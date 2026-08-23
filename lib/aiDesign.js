// AI design generation via Google's Gemini image model. Uses the current unified
// `@google/genai` SDK (the older `@google/generative-ai` package is deprecated).
const { GoogleGenAI } = require('@google/genai');
const { chromaKeyToTransparent } = require('./chromaKey');

const MODEL = 'gemini-2.5-flash-image';

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  return new GoogleGenAI({ apiKey });
}

// Generates a design image from a text prompt, optionally guided by a reference image
// (e.g. a competitor's design being reworked into an original piece).
async function generateDesignImage({ prompt, referenceImageBuffer, referenceMimeType }) {
  const ai = getClient();

  const parts = [];
  if (referenceImageBuffer) {
    parts.push({
      inlineData: {
        data: referenceImageBuffer.toString('base64'),
        mimeType: referenceMimeType || 'image/png'
      }
    });
  }
  parts.push({
    text: [
      prompt,
      'Output a single standalone graphic design suitable for print-on-demand apparel:',
      'centered composition, clean vector-friendly shapes, no mockup, no garment,',
      'no photo of a person, no watermark.',
      'Background: fill it with a single, perfectly flat, solid pure chroma-key green',
      '(hex #00FF00) — no gradient, no texture, no checkerboard pattern, no shadow on it.',
      'The green must not appear anywhere in the design artwork itself.'
    ].join(' ')
  });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }]
  });

  const candidate = response.candidates && response.candidates[0];
  const imagePart = candidate && candidate.content && candidate.content.parts
    ? candidate.content.parts.find(p => p.inlineData && p.inlineData.data)
    : null;

  if (!imagePart) {
    const textPart = candidate && candidate.content && candidate.content.parts
      ? candidate.content.parts.find(p => p.text)
      : null;
    throw new Error(textPart ? `Gemini did not return an image: ${textPart.text}` : 'Gemini did not return an image');
  }

  const rawBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
  const transparentBuffer = await chromaKeyToTransparent(rawBuffer);

  return { buffer: transparentBuffer, mimeType: 'image/png' };
}

module.exports = { generateDesignImage };
