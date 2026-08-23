if (!process.env.VERCEL) require('dotenv').config({ path: require('path').join(__dirname, '.env.local') });

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const sharp = require('sharp');

const { CANVAS, buildDefaultTemplateList } = require('./templates/definitions');
const { composeMockupByStyle } = require('./lib/mockupEngine');
const { generateDesignImage, analyzeDesign } = require('./lib/aiDesign');
const { researchTrends } = require('./lib/trendResearch');
const { addDesignToLibrary, readDesignsLibrary, removeDesignFromLibrary } = require('./lib/designsLibrary');
const { readPricingPresets, addPricingPreset, removePricingPreset } = require('./lib/pricingPresets');
const {
  uploadBuffer,
  fetchBuffer,
  readCustomTemplates,
  writeCustomTemplates,
  del: deleteBlob
} = require('./lib/blobStore');

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function imageFileFilter(req, file, cb) {
  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    return cb(new Error('Only PNG, JPEG, or WEBP images are allowed'));
  }
  cb(null, true);
}

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Resolves this deployment's own origin so default (statically-served) template images
// can be fetched over HTTP alongside blob-hosted custom templates and designs.
function originOf(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// ---------- Templates ----------

app.get('/api/templates', async (req, res) => {
  try {
    const defaults = buildDefaultTemplateList();
    const custom = await readCustomTemplates();
    res.json({ templates: [...defaults, ...custom] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload a custom blank garment template. printArea (x,y,w,h) is on a 2000x2000 canvas;
// if omitted, defaults to a centered chest-print box so it's usable immediately.
app.post('/api/templates', memoryUpload.single('image'), async (req, res) => {
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
    const normalized = await sharp(req.file.buffer)
      .resize(CANVAS, CANVAS, { fit: 'contain', background: { r: 20, g: 20, b: 22, alpha: 1 } })
      .png()
      .toBuffer();

    const id = `custom-${crypto.randomUUID()}`;
    const blobUrl = await uploadBuffer(`pod-pilot/templates/${id}.png`, normalized, 'image/png');

    const entry = {
      id,
      garment: 'custom',
      garmentName,
      color: 'custom',
      colorName,
      printArea,
      source: 'upload',
      baseImage: blobUrl
    };

    const list = await readCustomTemplates();
    list.push(entry);
    await writeCustomTemplates(list);

    res.json({ template: entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/templates/:id', async (req, res) => {
  try {
    const list = await readCustomTemplates();
    const target = list.find(t => t.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'Template not found' });
    const filtered = list.filter(t => t.id !== req.params.id);
    await writeCustomTemplates(filtered);
    await deleteBlob(target.baseImage).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Designs ----------

app.post('/api/designs', memoryUpload.single('design'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No design uploaded' });
    const ext = (path.extname(req.file.originalname) || '.png').toLowerCase();
    const id = crypto.randomUUID();
    const url = await uploadBuffer(`pod-pilot/designs/${id}${ext}`, req.file.buffer, req.file.mimetype);
    await addDesignToLibrary({ id, url, source: 'upload' });
    res.json({ design: { id, url } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generates a design from a text prompt via Gemini, optionally guided by a reference image
// (either an uploaded file under the "reference" field, or a previously-uploaded design's URL).
app.post('/api/designs/generate', memoryUpload.single('reference'), async (req, res) => {
  try {
    const prompt = (req.body.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    let referenceImageBuffer = null;
    let referenceMimeType = null;
    if (req.file) {
      referenceImageBuffer = req.file.buffer;
      referenceMimeType = req.file.mimetype;
    } else if (req.body.referenceUrl) {
      referenceImageBuffer = await fetchBuffer(req.body.referenceUrl);
      referenceMimeType = 'image/png';
    }

    const { buffer, mimeType } = await generateDesignImage({ prompt, referenceImageBuffer, referenceMimeType });

    const id = crypto.randomUUID();
    const ext = mimeType === 'image/jpeg' ? '.jpg' : '.png';
    const url = await uploadBuffer(`pod-pilot/designs/${id}${ext}`, buffer, mimeType);
    await addDesignToLibrary({ id, url, source: 'generated', prompt });

    res.json({ design: { id, url } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-detects style, niche, colors, elements, and a commercial strength/weakness call-out
// for a design — either an uploaded file or a URL to an already-uploaded/generated design.
app.post('/api/designs/analyze', memoryUpload.single('design'), async (req, res) => {
  try {
    let imageBuffer = null;
    let mimeType = null;
    if (req.file) {
      imageBuffer = req.file.buffer;
      mimeType = req.file.mimetype;
    } else if (req.body.designUrl) {
      imageBuffer = await fetchBuffer(req.body.designUrl);
      mimeType = 'image/png';
    } else {
      return res.status(400).json({ error: 'designUrl or an uploaded design is required' });
    }

    const analysis = await analyzeDesign({ imageBuffer, mimeType });
    res.json({ analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Designs library ----------

app.get('/api/designs/library', async (req, res) => {
  try {
    const designs = await readDesignsLibrary();
    res.json({ designs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/designs/library/:id', async (req, res) => {
  try {
    const removed = await removeDesignFromLibrary(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Design not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Canvas ----------

// Saves a canvas export (data URL from <canvas>.toDataURL()) as a new design, so it feeds
// straight into the same Mockups/Analysis flow as an upload or an AI generation.
app.post('/api/canvas/save', async (req, res) => {
  try {
    const { dataUrl } = req.body;
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'dataUrl (data:image/... base64) is required' });
    }
    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Malformed data URL' });
    const [, mimeType, base64] = match;
    const buffer = Buffer.from(base64, 'base64');

    const id = crypto.randomUUID();
    const ext = mimeType === 'image/jpeg' ? '.jpg' : '.png';
    const url = await uploadBuffer(`pod-pilot/designs/${id}${ext}`, buffer, mimeType);
    await addDesignToLibrary({ id, url, source: 'canvas' });

    res.json({ design: { id, url } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Mockup generation ----------

app.post('/api/mockups/generate', async (req, res) => {
  try {
    const { designUrl, templateIds } = req.body;
    if (!designUrl) return res.status(400).json({ error: 'designUrl is required' });
    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({ error: 'templateIds must be a non-empty array' });
    }

    const allTemplates = [...buildDefaultTemplateList(), ...(await readCustomTemplates())];
    const templateMap = new Map(allTemplates.map(t => [t.id, t]));

    const origin = originOf(req);
    const designBuffer = await fetchBuffer(designUrl);

    const results = [];
    for (const tid of templateIds) {
      const tpl = templateMap.get(tid);
      if (!tpl) continue;

      const baseImageUrl = tpl.baseImage.startsWith('http') ? tpl.baseImage : `${origin}${tpl.baseImage}`;
      const baseImageBuffer = await fetchBuffer(baseImageUrl);

      const composedBuffer = await composeMockupByStyle(tpl.style, {
        baseImageBuffer,
        designBuffer,
        printArea: tpl.printArea
      });

      const outName = `${tpl.garmentName.replace(/\s+/g, '')}-${tpl.colorName.replace(/\s+/g, '')}-${tid}.png`;
      const url = await uploadBuffer(`pod-pilot/mockups/${crypto.randomUUID()}-${outName}`, composedBuffer, 'image/png');

      results.push({ templateId: tid, garmentName: tpl.garmentName, colorName: tpl.colorName, url });
    }

    res.json({ mockups: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Zips a set of already-generated mockup URLs (or any image URLs) on the fly — stateless,
// so it works the same locally and on Vercel without needing a shared batch directory.
app.post('/api/mockups/zip', async (req, res) => {
  try {
    const { mockups } = req.body;
    if (!Array.isArray(mockups) || mockups.length === 0) {
      return res.status(400).json({ error: 'mockups must be a non-empty array' });
    }

    res.attachment('pod-pilot-mockups.zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => res.status(500).end(String(err)));
    archive.pipe(res);

    for (const m of mockups) {
      const buffer = await fetchBuffer(m.url);
      const name = `${(m.garmentName || 'garment').replace(/\s+/g, '')}-${(m.colorName || 'color').replace(/\s+/g, '')}-${crypto.randomUUID().slice(0, 8)}.png`;
      archive.append(buffer, { name });
    }

    await archive.finalize();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
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

// ---------- Trend research ----------

app.post('/api/trends/research', async (req, res) => {
  try {
    const focus = (req.body.focus || '').trim() || null;
    const result = await researchTrends({ focus });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Pricing presets ----------

app.get('/api/pricing/presets', async (req, res) => {
  try {
    const presets = await readPricingPresets();
    res.json({ presets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pricing/presets', async (req, res) => {
  try {
    const { name, sizes } = req.body;
    if (!name || !Array.isArray(sizes) || sizes.length === 0) {
      return res.status(400).json({ error: 'name and a non-empty sizes array are required' });
    }
    const preset = await addPricingPreset({ name, sizes });
    res.json({ preset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/pricing/presets/:id', async (req, res) => {
  try {
    const removed = await removePricingPreset(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Preset not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

if (require.main === module) {
  const PORT = process.env.PORT || 4173;
  app.listen(PORT, () => {
    console.log(`POD Pilot running at http://localhost:${PORT}`);
  });
}

module.exports = app;
