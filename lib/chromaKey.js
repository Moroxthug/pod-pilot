const sharp = require('sharp');

// Gemini's image model doesn't emit real alpha transparency, and doesn't reliably hit an exact
// requested hex color either — it renders its own approximation of "solid green background".
// So instead of assuming a fixed key color, sample the actual corner pixels of the generated
// image and key out whatever color that turns out to be, with a soft-edged threshold so
// anti-aliased edges don't leave a color fringe.
async function chromaKeyToTransparent(buffer, { threshold = 45, feather = 35 } = {}) {
  const image = sharp(buffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const keyColor = sampleCornerColor(data, width, height, channels);

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dist = Math.sqrt(
      (r - keyColor.r) ** 2 + (g - keyColor.g) ** 2 + (b - keyColor.b) ** 2
    );
    if (dist < threshold) {
      data[i + 3] = 0;
    } else if (dist < threshold + feather) {
      data[i + 3] = Math.round(((dist - threshold) / feather) * 255);
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

function sampleCornerColor(data, width, height, channels) {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1]
  ];
  let r = 0, g = 0, b = 0;
  for (const [x, y] of corners) {
    const idx = (y * width + x) * channels;
    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
  }
  return { r: r / 4, g: g / 4, b: b / 4 };
}

module.exports = { chromaKeyToTransparent };
