const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const sharp = require('sharp');

const { CANVAS, buildDefaultTemplateList } = require('./templates/definitions');
const { generateBaseTemplates } = require('./templates/generateBaseTemplates');
const { composeMockup } = require('./lib/mockupEngine');

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const DESIGNS_DIR = path.join(UPLOADS_DIR, 'designs');
const CUSTOM_TEMPLATES_DIR = path.join(UPLOADS_DIR, 'templates');
const OUTPUT_DIR = path.join(ROOT, 'output');
const CUSTOM_TEMPLATES_JSON = path.join(DATA_DIR, 'customTemplates.json');

for (const dir of [DATA_DIR, UPLOADS_DIR, DESIGNS_DIR, CUSTOM_TEMPLATES_DIR, OUTPUT_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(CUSTOM_TEMPLATES_JSON)) {
  fs.writeFileSync(CUSTOM_TEMPLATES_JSON, '[]');
}

function readCustomTemplates() {
  return JSON.parse(fs.readFileSync(CUSTOM_TEMPLATES_JSON, 'utf8'));
}
function writeCustomTemplates(list) {
  fs.writeFileSync(CUSTOM_TEMPLATES_JSON, JSON.stringify(list, null, 2));
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/output', express.static(OUTPUT_DIR));

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function imageFileFilter(req, file, cb) {
  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    return cb(new Error('Only PNG, JPEG, or WEBP images are allowed'));
  }
  cb(null, true);
}

const designUpload = multer({
  storage: multer.diskStorage({
    destination: DESIGNS_DIR,
    filename: (req, file, cb) => {
      const id = crypto.randomUUID();
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${id}${ext}`);
    }
  }),
  fileFilter: imageFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }
});

const templateUpload = multer({
  storage: multer.diskStorage({
    destination: CUSTOM_TEMPLATES_DIR,
    filename: (req, file, cb) => {
      const id = crypto.randomUUID();
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${id}${ext}`);
    }
  }),
  fileFilter: imageFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }
});

// ---------- Templates ----------

app.get('/api/templates', (req, res) => {
  const defaults = buildDefaultTemplateList();
  const custom = readCustomTemplates();
  res.json({ templates: [...defaults, ...custom] });
});

// Upload a custom blank garment template. printArea (x,y,w,h) is on a 2000x2000 canvas;
// if omitted, defaults to a centered chest-print box so it's usable immediately.
app.post('/api/templates', templateUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const garmentName = (req.body.garmentName || 'Custom Garment').slice(0, 60);
    const colorName = (req.body.colorName || 'Custom').slice(0, 40);

    let printArea = { x: 700, y: 620, w: 600, h: 700 };
    if (req.body.printArea) {
      try {
        const parsed = JSON.parse(req.body.printArea);
        if (
          Number.isFinite(parsed.x) && Number.isFinite(parsed.y) &&
          Number.isFinite(parsed.w) && Number.isFinite(parsed.h)
        ) {
          printArea = parsed;
        }
      } catch { /* keep default */ }
    }

    // Normalize to a 2000x2000 canvas so the compositing engine can treat every template uniformly.
    const normalizedPath = path.join(CUSTOM_TEMPLATES_DIR, `norm-${path.basename(req.file.filename, path.extname(req.file.filename))}.png`);
    await sharp(req.file.path)
      .resize(CANVAS, CANVAS, { fit: 'contain', background: { r: 20, g: 20, b: 22, alpha: 1 } })
      .png()
      .toFile(normalizedPath);

    const id = `custom-${crypto.randomUUID()}`;
    const entry = {
      id,
      garment: 'custom',
      garmentName,
      color: 'custom',
      colorName,
      printArea,
      source: 'upload',
      baseImage: `/uploads/templates/${path.basename(normalizedPath)}`
    };

    const list = readCustomTemplates();
    list.push(entry);
    writeCustomTemplates(list);

    res.json({ template: entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/templates/:id', (req, res) => {
  const list = readCustomTemplates();
  const filtered = list.filter(t => t.id !== req.params.id);
  if (filtered.length === list.length) return res.status(404).json({ error: 'Template not found' });
  writeCustomTemplates(filtered);
  res.json({ ok: true });
});

// ---------- Designs ----------

app.post('/api/designs', designUpload.single('design'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No design uploaded' });
  res.json({
    design: {
      id: req.file.filename,
      url: `/uploads/designs/${req.file.filename}`
    }
  });
});

// ---------- Mockup generation ----------

app.post('/api/mockups/generate', async (req, res) => {
  try {
    const { designId, templateIds } = req.body;
    if (!designId) return res.status(400).json({ error: 'designId is required' });
    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({ error: 'templateIds must be a non-empty array' });
    }

    const designPath = path.join(DESIGNS_DIR, path.basename(designId));
    if (!fs.existsSync(designPath)) return res.status(404).json({ error: 'Design not found' });
    const designBuffer = fs.readFileSync(designPath);

    const allTemplates = [...buildDefaultTemplateList(), ...readCustomTemplates()];
    const templateMap = new Map(allTemplates.map(t => [t.id, t]));

    const batchId = crypto.randomUUID();
    const batchDir = path.join(OUTPUT_DIR, batchId);
    fs.mkdirSync(batchDir, { recursive: true });

    const results = [];
    for (const tid of templateIds) {
      const tpl = templateMap.get(tid);
      if (!tpl) continue;
      const baseImagePath = path.join(ROOT, 'public', tpl.baseImage.replace(/^\//, ''));
      const composedBuffer = await composeMockup({
        baseImagePath,
        designBuffer,
        printArea: tpl.printArea,
        canvasSize: CANVAS
      });
      const outName = `${tpl.garmentName.replace(/\s+/g, '')}-${tpl.colorName.replace(/\s+/g, '')}-${tid}.png`;
      const outPath = path.join(batchDir, outName);
      fs.writeFileSync(outPath, composedBuffer);
      results.push({
        templateId: tid,
        garmentName: tpl.garmentName,
        colorName: tpl.colorName,
        url: `/output/${batchId}/${outName}`
      });
    }

    res.json({ batchId, mockups: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mockups/download/:batchId', (req, res) => {
  const batchDir = path.join(OUTPUT_DIR, path.basename(req.params.batchId));
  if (!fs.existsSync(batchDir)) return res.status(404).json({ error: 'Batch not found' });

  res.attachment(`pod-pilot-mockups-${req.params.batchId.slice(0, 8)}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => res.status(500).end(String(err)));
  archive.pipe(res);
  archive.directory(batchDir, false);
  archive.finalize();
});

// ---------- Listing content helper (heuristic, no external API) ----------

app.post('/api/listing/generate', (req, res) => {
  const { keywords = [], style = '', niche = '' } = req.body;
  const cleanKeywords = keywords.map(k => String(k).trim()).filter(Boolean).slice(0, 20);

  if (cleanKeywords.length === 0) {
    return res.status(400).json({ error: 'Provide at least one keyword' });
  }

  const primary = cleanKeywords[0];
  const titleParts = [
    capitalize(primary),
    style && capitalize(style),
    niche && capitalize(niche),
    'Shirt',
    'Funny Graphic Tee',
    'Unisex T-Shirt'
  ].filter(Boolean);
  const title = titleParts.join(' | ').slice(0, 140);

  const tagPool = new Set();
  for (const k of cleanKeywords) tagPool.add(k.toLowerCase().slice(0, 20));
  if (style) tagPool.add(style.toLowerCase().slice(0, 20));
  if (niche) tagPool.add(niche.toLowerCase().slice(0, 20));
  ['gift idea', 'graphic tee', 'unisex shirt', 'trendy shirt', 'custom design'].forEach(t => tagPool.add(t));
  const tags = Array.from(tagPool).slice(0, 13);

  const description = [
    `${capitalize(primary)} design${style ? `, ${style} style` : ''}${niche ? ` for ${niche} lovers` : ''}.`,
    `Printed on soft, comfortable fabric. Makes a great gift for any occasion.`,
    `Available in multiple colors and sizes. Unisex fit.`,
    ``,
    `Keywords: ${cleanKeywords.join(', ')}`
  ].join('\n');

  res.json({ title, tags, description });
});

function capitalize(s) {
  return String(s).replace(/\b\w/g, c => c.toUpperCase());
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

generateBaseTemplates()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`POD Pilot running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to generate base templates:', err);
    process.exit(1);
  });
