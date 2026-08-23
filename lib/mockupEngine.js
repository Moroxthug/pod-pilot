const sharp = require('sharp');

const IDENTITY_PLACEMENT = { offsetXPct: 0, offsetYPct: 0, scalePct: 1, rotationDeg: 0 };

// Fits the design into the print area (contain, centered by default) and returns the resized/
// rotated buffer plus its placement offset on the base canvas. `placement` lets the caller
// override the default centering — offsetXPct/offsetYPct shift the design as a fraction of the
// print area's width/height (-0.5..0.5 covers edge-to-edge), scalePct multiplies the baseline
// contain-fit size, and rotationDeg rotates the design in place before it's positioned.
// `canvasSize` is the full base-image dimensions, used only to keep the overlay from landing
// somewhere sharp's compositor would reject (past the base image's own edges).
async function fitDesignToArea(designBuffer, printArea, placement = IDENTITY_PLACEMENT, canvasSize) {
  const { x, y, w, h } = printArea;
  const { offsetXPct = 0, offsetYPct = 0, scalePct = 1, rotationDeg = 0 } = placement;

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
  fitW = Math.max(1, Math.round(fitW * scalePct));
  fitH = Math.max(1, Math.round(fitH * scalePct));

  let resizedDesign = await sharp(designBuffer)
    .resize(fitW, fitH, { fit: 'inside' })
    .png()
    .toBuffer();

  if (rotationDeg) {
    resizedDesign = await sharp(resizedDesign)
      .rotate(rotationDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  const finalMeta = await sharp(resizedDesign).metadata();
  let offsetX = x + Math.round((w - finalMeta.width) / 2) + Math.round(offsetXPct * w);
  let offsetY = y + Math.round((h - finalMeta.height) / 2) + Math.round(offsetYPct * h);

  // Clamp so the overlay always stays inside the base canvas — sharp throws if a composite
  // layer's offset would place any part of it outside the base image.
  const maxX = Math.max(0, (canvasSize?.width ?? x + w) - finalMeta.width);
  const maxY = Math.max(0, (canvasSize?.height ?? y + h) - finalMeta.height);
  offsetX = Math.min(Math.max(0, offsetX), maxX);
  offsetY = Math.min(Math.max(0, offsetY), maxY);

  return { resizedDesign, offsetX, offsetY };
}

// Flat overlay: just places the design on top of the base image. Used for the vector-flat
// templates, which have no real fabric lighting to pick up.
async function composeMockup({ baseImageBuffer, designBuffer, printArea, placement }) {
  const canvasSize = await sharp(baseImageBuffer).metadata();
  const { resizedDesign, offsetX, offsetY } = await fitDesignToArea(designBuffer, printArea, placement, canvasSize);
  return sharp(baseImageBuffer)
    .composite([{ input: resizedDesign, left: offsetX, top: offsetY }])
    .png()
    .toBuffer();
}

// Photo-realistic compositing: extracts the fabric's own lighting/shadow from the print area
// of the base photo (as a softened grayscale map) and multiply-blends it into the design's RGB
// channels only — the design's alpha is reattached afterwards so transparency survives the
// blend (sharp's multiply composite otherwise forces full opacity wherever it's applied). This
// makes the design pick up real fold shadows instead of sitting on top like a flat sticker,
// without an AI model ever touching (and potentially altering) the design's actual pixels.
async function composePhotoMockup({ baseImageBuffer, designBuffer, printArea, placement }) {
  const { x, y, w, h } = printArea;
  const canvasSize = await sharp(baseImageBuffer).metadata();
  const { resizedDesign, offsetX, offsetY } = await fitDesignToArea(designBuffer, printArea, placement, canvasSize);

  const lightMapRaw = await sharp(baseImageBuffer)
    .extract({ left: x, top: y, width: w, height: h })
    .greyscale()
    .toBuffer();
  // Pull toward mid-gray and soften contrast so the multiply shades rather than overpowers.
  const lightMap = await sharp(lightMapRaw)
    .linear(0.55, 128 * (1 - 0.55))
    .resize(w, h)
    .toBuffer();

  const designWithAlpha = sharp(resizedDesign).ensureAlpha();
  const designAlpha = await designWithAlpha.clone().extractChannel('alpha').toBuffer();
  const designRgbOnly = await designWithAlpha.clone().removeAlpha().toBuffer();

  // Crop the light map to the design's actual placement within the print area. A manual
  // placement can move/scale the design outside the print area's own rectangle (which is all
  // the light map covers) — clamp the extract region so it always stays inside the light map's
  // bounds; the lighting realism degrades gracefully instead of crashing in that case.
  const designMeta = await sharp(resizedDesign).metadata();
  const extractW = Math.min(designMeta.width, w);
  const extractH = Math.min(designMeta.height, h);
  const cropX = Math.min(Math.max(0, offsetX - x), w - extractW);
  const cropY = Math.min(Math.max(0, offsetY - y), h - extractH);
  const lightMapForDesign = await sharp(lightMap)
    .extract({ left: cropX, top: cropY, width: extractW, height: extractH })
    .resize(designMeta.width, designMeta.height)
    .toBuffer();

  const blendedRgb = await sharp(designRgbOnly)
    .composite([{ input: lightMapForDesign, blend: 'multiply' }])
    .removeAlpha()
    .toBuffer();

  const shadedDesign = await sharp(blendedRgb)
    .joinChannel(designAlpha)
    .png()
    .toBuffer();

  return sharp(baseImageBuffer)
    .composite([{ input: shadedDesign, left: offsetX, top: offsetY }])
    .png()
    .toBuffer();
}

async function composeMockupByStyle(style, args) {
  return style === 'photo' ? composePhotoMockup(args) : composeMockup(args);
}

module.exports = { composeMockup, composePhotoMockup, composeMockupByStyle };
