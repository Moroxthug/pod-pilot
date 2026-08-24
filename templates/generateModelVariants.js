// Generates a reusable roster of model photos: 6 base identities (3 male, 3 female), each
// then edited (not regenerated) into every garment-type x color combo — edit mode preserves
// the person/pose/background pixel-for-pixel except what's instructed to change, so the same
// model wears every variant instead of a different-looking person per combo (verified elsewhere
// in this app: fur-color edits kept everything else pixel-identical). Run manually
// (npm run generate:model-variants -- [modelIndex]) and commit the output, same rationale as
// the other template generators: consistent, zero runtime cost, reviewable before shipping.
//
// TODO (noted for later, not now): expanding to more models, and reusing these same identities
// for background swaps, is a natural extension of this same base-photo + edit-mode approach.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { getGeminiClient } = require('../lib/geminiClient');
const { CANVAS } = require('./definitions');

const IMAGE_MODEL = 'gemini-2.5-flash-image';
const OUT_DIR = path.join(__dirname, '..', 'public', 'templates-model-v2');

const MODELS = [
  { id: 'male-1', gender: 'male', description: 'short dark hair, athletic build, light stubble', background: 'outdoors on a sunlit brick-lined street' },
  { id: 'male-2', gender: 'male', description: 'light brown hair, slim build, short beard', background: 'in a bright minimalist indoor studio with a light gray backdrop' },
  { id: 'male-3', gender: 'male', description: 'black hair, average build, clean-shaven, glasses', background: 'outdoors on a city sidewalk with soft bokeh background' },
  { id: 'female-1', gender: 'female', description: 'long straight brown hair', background: 'outdoors in a sunlit courtyard with green plants' },
  { id: 'female-2', gender: 'female', description: 'blonde hair in a low ponytail', background: 'in a bright minimalist indoor studio with a light gray backdrop' },
  { id: 'female-3', gender: 'female', description: 'short curly black hair', background: 'outdoors in a leafy park with soft bokeh background' }
];

const GARMENT_LABELS = {
  tshirt: 'crew-neck t-shirt',
  hoodie: 'pullover hoodie',
  sweatshirt: 'crew-neck sweatshirt',
  jumper: 'ribbed crew-neck knit jumper'
};

const COLOR_LABELS = {
  black: 'solid black',
  white: 'solid white',
  'heather-gray': 'heather gray',
  navy: 'solid navy blue'
};

const BASE_GARMENT = 'tshirt';
const BASE_COLOR = 'black';

function outPath(modelId, garment, color) {
  return path.join(OUT_DIR, `${modelId}-${garment}-${color}.jpg`);
}

async function extractImageBuffer(response) {
  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part) {
    const textPart = response.candidates?.[0]?.content?.parts?.find(p => p.text);
    throw new Error(textPart ? `Gemini did not return an image: ${textPart.text}` : 'Gemini did not return an image');
  }
  return Buffer.from(part.inlineData.data, 'base64');
}

async function generateBase(model) {
  const ai = getGeminiClient();
  const prompt = `Professional e-commerce apparel photograph of a real ${model.gender} model (${model.description}), wearing a blank ${COLOR_LABELS[BASE_COLOR]} ${GARMENT_LABELS[BASE_GARMENT]}, standing straight-on facing the camera, centered, arms relaxed at their sides, neutral confident expression, shot from mid-thigh up, ${model.background}, soft natural lighting, shallow depth of field, no text, no logo, no graphics on the garment, high resolution, square framing.`;
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });
  const raw = await extractImageBuffer(response);
  return sharp(raw).resize(CANVAS, CANVAS, { fit: 'cover' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

async function generateVariant(baseBuffer, garment, color) {
  const ai = getGeminiClient();
  // Deliberately no apostrophes ("person's") — reproduced a consistent IMAGE_OTHER failure on
  // one combo that a wording change without an apostrophe fixed; avoiding possessives entirely
  // sidesteps that class of flakiness rather than chasing which apostrophe is safe.
  const instruction = `Replace the garment worn by the person with a ${COLOR_LABELS[color]} ${GARMENT_LABELS[garment]}, keeping the person, pose, and background exactly the same. No text, no logo, no graphics on the garment.`;
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { data: baseBuffer.toString('base64'), mimeType: 'image/jpeg' } },
        { text: instruction }
      ]
    }]
  });
  const raw = await extractImageBuffer(response);
  return sharp(raw).resize(CANVAS, CANVAS, { fit: 'cover' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

async function withRetries(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.log(`  retrying after error: ${err.message}`);
    }
  }
  throw lastErr;
}

// Resumable: skips any combo whose output file already exists, so a failed/interrupted run
// can just be re-invoked instead of re-generating (and re-billing) everything from scratch.
async function generateForModel(model) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const basePath = outPath(model.id, BASE_GARMENT, BASE_COLOR);
  let baseBuffer;
  if (fs.existsSync(basePath)) {
    console.log(`[${model.id}] base already exists, reusing`);
    baseBuffer = fs.readFileSync(basePath);
  } else {
    console.log(`[${model.id}] generating base (${BASE_GARMENT}/${BASE_COLOR})...`);
    baseBuffer = await withRetries(() => generateBase(model));
    fs.writeFileSync(basePath, baseBuffer);
    console.log(`[${model.id}] saved base`);
  }

  for (const garment of Object.keys(GARMENT_LABELS)) {
    for (const color of Object.keys(COLOR_LABELS)) {
      if (garment === BASE_GARMENT && color === BASE_COLOR) continue;
      const target = outPath(model.id, garment, color);
      if (fs.existsSync(target)) {
        console.log(`[${model.id}] ${garment}/${color} already exists, skipping`);
        continue;
      }
      console.log(`[${model.id}] generating ${garment}/${color}...`);
      const buffer = await withRetries(() => generateVariant(baseBuffer, garment, color));
      fs.writeFileSync(target, buffer);
      console.log(`[${model.id}] saved ${garment}/${color}`);
    }
  }
}

async function main() {
  const arg = process.argv[2];
  const targets = arg !== undefined ? [MODELS[Number(arg)]] : MODELS;
  for (const model of targets) {
    await generateForModel(model);
  }
  console.log('Done.');
}

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { MODELS, GARMENT_LABELS, COLOR_LABELS, generateForModel };
