// Deterministic upscaling via Lanczos3 resampling. Deliberately NOT AI super-resolution --
// a generative model asked to "upscale" tends to reinterpret the image (different linework,
// added/removed detail), which is unacceptable for a design that must stay pixel-accurate.
// This only resamples, never invents content, so the design is guaranteed unchanged.
const sharp = require('sharp');

async function upscaleImage(buffer, factor = 2) {
  const clampedFactor = [2, 3, 4].includes(factor) ? factor : 2;
  const meta = await sharp(buffer).metadata();
  const targetWidth = Math.round(meta.width * clampedFactor);
  const targetHeight = Math.round(meta.height * clampedFactor);

  return sharp(buffer)
    .resize(targetWidth, targetHeight, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
}

module.exports = { upscaleImage };
