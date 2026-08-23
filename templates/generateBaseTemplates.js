const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { GARMENTS, GARMENT_COLORS } = require('./definitions');
const { renderGarmentSvg } = require('./svgShapes');

const OUT_DIR = path.join(__dirname, '..', 'public', 'templates-static');

async function generateBaseTemplates({ force = false } = {}) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const jobs = [];
  for (const [garmentId, garment] of Object.entries(GARMENTS)) {
    for (const colorId of garment.colors) {
      const color = GARMENT_COLORS[colorId];
      const outPath = path.join(OUT_DIR, `${garmentId}-${colorId}.png`);
      if (!force && fs.existsSync(outPath)) continue;
      const svg = renderGarmentSvg(garmentId, color.fill, color.shadow);
      jobs.push(
        sharp(Buffer.from(svg)).png().toFile(outPath)
      );
    }
  }
  await Promise.all(jobs);
}

module.exports = { generateBaseTemplates };
