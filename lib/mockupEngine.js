const sharp = require('sharp');

// Composites a design PNG onto a garment base image within the template's printArea.
// Uses "multiply"-ish blending (via low opacity dark garments) is skipped in favor of a simple
// contain-fit + soft drop shadow, which reads cleanly across black/white/gray fabrics.
async function composeMockup({ baseImagePath, designBuffer, printArea, canvasSize = 2000 }) {
  const { x, y, w, h } = printArea;

  const designMeta = await sharp(designBuffer).metadata();
  const designAspect = designMeta.width / designMeta.height;
  const areaAspect = w / h;

  let fitW, fitH;
  if (designAspect > areaAspect) {
    fitW = w;
    fitH = Math.round(w / designAspect);
  } else {
    fitH = h;
    fitW = Math.round(h * designAspect);
  }

  const resizedDesign = await sharp(designBuffer)
    .resize(fitW, fitH, { fit: 'inside' })
    .png()
    .toBuffer();

  const offsetX = x + Math.round((w - fitW) / 2);
  const offsetY = y + Math.round((h - fitH) / 2);

  const base = sharp(baseImagePath);
  const composed = await base
    .composite([{ input: resizedDesign, left: offsetX, top: offsetY }])
    .png()
    .toBuffer();

  return composed;
}

module.exports = { composeMockup };
