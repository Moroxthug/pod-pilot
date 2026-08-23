// One-off generator for on-model (person wearing the garment) photorealistic templates via
// Gemini, alongside the existing flat-lay photo templates. Run manually
// (npm run generate:model-templates) and commit the output — same rationale as
// generatePhotoTemplates.js: consistent, zero runtime cost, reviewable output.
//
// Framing is deliberately standardized (straight-on, mid-thigh-up, arms relaxed at sides,
// centered) rather than varied dynamic poses — that keeps the chest print area landing in
// roughly the same place across the set, so one printArea per garment/gender pairing is a
// reasonable starting point instead of needing per-photo tuning.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { getGeminiClient } = require('../lib/geminiClient');
const { CANVAS } = require('./definitions');

const IMAGE_MODEL = 'gemini-2.5-flash-image';
const OUT_DIR = path.join(__dirname, '..', 'public', 'templates-model');

const COLOR_DESCRIPTIONS = {
  black: 'solid black',
  white: 'solid white'
};

function buildPrompt({ garmentLabel, color, genderLabel, background }) {
  return `Professional e-commerce apparel photograph of a real ${genderLabel} model wearing a blank ${COLOR_DESCRIPTIONS[color]} ${garmentLabel}, standing straight-on facing the camera, centered, arms relaxed at their sides, neutral confident expression, shot from mid-thigh up, ${background}, soft natural lighting, shallow depth of field, no text, no logo, no graphics on the garment, high resolution, square framing.`;
}

const TARGETS = [
  { id: 'tshirt-model-male-black', garmentName: 'T-Shirt', colorName: 'Black', prompt: buildPrompt({ garmentLabel: 'crew-neck t-shirt', color: 'black', genderLabel: 'male', background: 'outdoors on a sunlit brick-lined street' }) },
  { id: 'tshirt-model-male-white', garmentName: 'T-Shirt', colorName: 'White', prompt: buildPrompt({ garmentLabel: 'crew-neck t-shirt', color: 'white', genderLabel: 'male', background: 'in a bright minimalist indoor studio with a light gray backdrop' }) },
  { id: 'tshirt-model-female-black', garmentName: 'T-Shirt', colorName: 'Black', prompt: buildPrompt({ garmentLabel: 'crew-neck t-shirt', color: 'black', genderLabel: 'female', background: 'outdoors in a sunlit courtyard with green plants' }) },
  { id: 'tshirt-model-female-white', garmentName: 'T-Shirt', colorName: 'White', prompt: buildPrompt({ garmentLabel: 'crew-neck t-shirt', color: 'white', genderLabel: 'female', background: 'in a bright minimalist indoor studio with a light gray backdrop' }) },
  { id: 'hoodie-model-male-black', garmentName: 'Hoodie', colorName: 'Black', prompt: buildPrompt({ garmentLabel: 'pullover hoodie', color: 'black', genderLabel: 'male', background: 'outdoors on a city sidewalk with soft bokeh background' }) },
  { id: 'sweatshirt-model-female-white', garmentName: 'Sweatshirt', colorName: 'White', prompt: buildPrompt({ garmentLabel: 'crew-neck fleece sweatshirt', color: 'white', genderLabel: 'female', background: 'in a bright minimalist indoor studio with a light gray backdrop' }) }
];

async function generateOne(prompt) {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });
  const part = response.candidates[0].content.parts.find(p => p.inlineData);
  if (!part) throw new Error('No image returned');
  const raw = Buffer.from(part.inlineData.data, 'base64');
  return sharp(raw).resize(CANVAS, CANVAS, { fit: 'cover' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const target of TARGETS) {
    const outPath = path.join(OUT_DIR, `${target.id}.jpg`);
    console.log(`Generating ${target.id}...`);
    const buffer = await generateOne(target.prompt);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved ${outPath}`);
  }
  console.log('Done. Inspect public/templates-model/*.jpg and set printArea coords in definitions.js.');
}

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { generateOne, TARGETS };
