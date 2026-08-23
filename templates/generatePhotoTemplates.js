// One-off generator for photorealistic blank garment templates via Gemini. Run manually
// (npm run generate:photo-templates) and commit the output — not regenerated at request time,
// same rationale as the flat SVG templates: consistent, zero runtime cost, reviewable output.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { getGeminiClient } = require('../lib/geminiClient');
const { CANVAS } = require('./definitions');

const IMAGE_MODEL = 'gemini-2.5-flash-image';
const OUT_DIR = path.join(__dirname, '..', 'public', 'templates-photo');

const COLOR_DESCRIPTIONS = {
  black: 'solid black',
  white: 'solid white',
  gray: 'heather gray'
};

const GARMENT_PROMPTS = {
  tshirt: color => `Professional e-commerce product photography of a blank ${COLOR_DESCRIPTIONS[color]} crew-neck cotton t-shirt, flat lay, shot from directly above on a neutral light gray textured surface, soft even studio lighting, subtle natural fabric wrinkles and folds, no text, no logo, no graphics, no model, no mannequin, high resolution, centered, square framing.`,
  hoodie: color => `Professional e-commerce product photography of a blank ${COLOR_DESCRIPTIONS[color]} pullover hoodie with drawstrings, flat lay, shot from directly above on a neutral light gray textured surface, soft even studio lighting, subtle natural fabric wrinkles and folds, no text, no logo, no graphics, no model, no mannequin, high resolution, centered, square framing.`,
  sweatshirt: color => `Professional e-commerce product photography of a blank ${COLOR_DESCRIPTIONS[color]} crew-neck fleece sweatshirt, flat lay, shot from directly above on a neutral light gray textured surface, soft even studio lighting, subtle natural fabric wrinkles and folds, no text, no logo, no graphics, no model, no mannequin, high resolution, centered, square framing.`
};

const TARGETS = [
  { garment: 'tshirt', colors: ['black', 'white', 'gray'] },
  { garment: 'hoodie', colors: ['black', 'white'] },
  { garment: 'sweatshirt', colors: ['black', 'white'] }
];

async function generateOne(garment, color) {
  const ai = getGeminiClient();
  const prompt = GARMENT_PROMPTS[garment](color);
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });
  const part = response.candidates[0].content.parts.find(p => p.inlineData);
  if (!part) throw new Error(`No image returned for ${garment}-${color}`);
  const raw = Buffer.from(part.inlineData.data, 'base64');
  // JPEG, not PNG: these are photos with fine grain/noise texture that compresses very poorly
  // as PNG (5-7MB each) but shrinks to a few hundred KB as JPEG with no visible quality loss.
  return sharp(raw).resize(CANVAS, CANVAS, { fit: 'cover' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const { garment, colors } of TARGETS) {
    for (const color of colors) {
      const outPath = path.join(OUT_DIR, `${garment}-${color}.jpg`);
      console.log(`Generating ${garment}-${color}...`);
      const buffer = await generateOne(garment, color);
      fs.writeFileSync(outPath, buffer);
      console.log(`Saved ${outPath}`);
    }
  }
  console.log('Done. Inspect public/templates-photo/*.jpg and tune printArea coords in definitions.js.');
}

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { generateOne };
