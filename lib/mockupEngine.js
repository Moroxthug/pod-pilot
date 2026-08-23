const sharp = require('sharp');

// Fits the design into the print area (contain, centered) and returns the resized buffer
// plus its placement offset on the base canvas.
async function fitDesignToArea(designBuffer, printArea) {
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

  return {
    resizedDesign,
    offsetX: x + Math.round((w - fitW) / 2),
    offsetY: y + Math.round((h - fitH) / 2)
  };
}

// Flat overlay: just places the design on top of the base image. Used for the vector-flat
// templates, which have no real fabric lighting to pick up.
async function composeMockup({ baseImageBuffer, designBuffer, printArea }) {
  const { resizedDesign, offsetX, offsetY } = await fitDesignToArea(designBuffer, printArea);
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
async function composePhotoMockup({ baseImageBuffer, designBuffer, printArea }) {
  const { x, y, w, h } = printArea;
  const { resizedDesign, offsetX, offsetY } = await fitDesignToArea(designBuffer, printArea);

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

  // Crop the light map to the design's actual placement within the print area (design may be
  // smaller than the area if its aspect ratio doesn't match).
  const designMeta = await sharp(resizedDesign).metadata();
  const cropX = offsetX - x;
  const cropY = offsetY - y;
  const lightMapForDesign = await sharp(lightMap)
    .extract({ left: cropX, top: cropY, width: designMeta.width, height: designMeta.height })
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
