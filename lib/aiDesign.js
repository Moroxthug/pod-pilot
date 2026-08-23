// AI design generation via Google's Gemini image model. Uses the current unified
// `@google/genai` SDK (the older `@google/generative-ai` package is deprecated).
const { chromaKeyToTransparent } = require('./chromaKey');
const { getGeminiClient } = require('./geminiClient');

const IMAGE_MODEL = 'gemini-2.5-flash-image';
const TEXT_MODEL = 'gemini-3.6-flash';

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    style: { type: 'string', description: 'Design style, e.g. "Vintage/Retro", "Minimalist Line Art", "Bold Typography"' },
    niche: { type: 'string', description: 'The most likely target niche/audience, e.g. "Surf & Beach", "Dog Mom", "Nurse Humor"' },
    colors: { type: 'array', items: { type: 'string' }, description: '2-5 dominant color names' },
    elements: { type: 'array', items: { type: 'string' }, description: 'Key visual/text elements present' },
    strength: { type: 'string', description: 'The single strongest thing about this design commercially' },
    weakness: { type: 'string', description: 'The single weakest thing about this design commercially' },
    suggestedKeywords: { type: 'array', items: { type: 'string' }, description: '5-10 Etsy-search-style keywords this design could rank for' }
  },
  required: ['style', 'niche', 'colors', 'elements', 'strength', 'weakness', 'suggestedKeywords']
};

const BASE_OUTPUT_INSTRUCTIONS = [
  'Output a single standalone graphic design suitable for print-on-demand apparel:',
  'centered composition, clean vector-friendly shapes, no mockup, no garment,',
  'no photo of a person, no watermark.',
  'Background: fill it with a single, perfectly flat, solid pure chroma-key green',
  '(hex #00FF00) — no gradient, no texture, no checkerboard pattern, no shadow on it.',
  'The green must not appear anywhere in the design artwork itself.'
].join(' ');

const MODE_INSTRUCTIONS = {
  generate: prompt => `${prompt} ${BASE_OUTPUT_INSTRUCTIONS}`,
  edit: prompt => [
    `Edit the provided reference image according to this instruction, preserving its overall`,
    `subject and composition except for what the instruction asks to change: "${prompt}".`,
    BASE_OUTPUT_INSTRUCTIONS
  ].join(' '),
  remix: prompt => [
    `Combine and remix visual elements from the provided reference images into one new,`,
    `original design, following this direction: "${prompt}". Do not simply place the images`,
    `side by side — blend their styles/elements into a single cohesive composition.`,
    BASE_OUTPUT_INSTRUCTIONS
  ].join(' ')
};

// Generates a design image. mode "generate" is text-only; "edit" takes one reference image
// and an instruction to modify it; "remix" takes multiple reference images and blends them
// into a new design — matches MyDesigns' Dream AI Generate/Edit/Remix modes.
async function generateDesignImage({ prompt, mode = 'generate', referenceImages = [] }) {
  const ai = getGeminiClient();

  const parts = [];
  for (const ref of referenceImages) {
    parts.push({
      inlineData: {
        data: ref.buffer.toString('base64'),
        mimeType: ref.mimeType || 'image/png'
      }
    });
  }

  const buildInstruction = MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.generate;
  parts.push({ text: buildInstruction(prompt) });

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
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

// Analyzes a design image: auto-detects style, niche, dominant colors, key elements,
// and a commercial strength/weakness call-out — matches the "ANALYSIS" panel from the spec.
async function analyzeDesign({ imageBuffer, mimeType }) {
  const ai = getGeminiClient();

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { data: imageBuffer.toString('base64'), mimeType: mimeType || 'image/png' } },
        {
          text: 'You are a print-on-demand (Etsy) merchandising expert. Analyze this design image ' +
            'as if evaluating it for a t-shirt/apparel listing. Be specific and commercially minded, ' +
            'not generic.'
        }
      ]
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: ANALYSIS_SCHEMA
    }
  });

  const text = response.text;
  if (!text) throw new Error('Gemini did not return an analysis');
  return JSON.parse(text);
}

// Removes the background from an arbitrary uploaded photo/image — not just our own AI
// generations. Gemini doesn't output real alpha transparency (proven earlier: it just draws
// a checkerboard or a flat color), so this reuses the same trick as generation: ask it to
// redraw ONLY the background as solid chroma-key green while leaving the foreground subject
// pixel-for-pixel untouched, then run the proven chroma-key-to-transparent post-process.
async function removeBackgroundFromImage({ imageBuffer, mimeType }) {
  const ai = getGeminiClient();

  const instruction = [
    'Keep the main foreground subject exactly as it is — same pixels, same colors, same details,',
    'no other changes whatsoever. Replace ONLY the background with a single, perfectly flat,',
    'solid pure chroma-key green (hex #00FF00) — no gradient, no texture, no shadow, no pattern.',
    'The green must not appear anywhere on the subject itself.'
  ].join(' ');

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { data: imageBuffer.toString('base64'), mimeType: mimeType || 'image/png' } },
        { text: instruction }
      ]
    }]
  });

  const candidate = response.candidates && response.candidates[0];
  const imagePart = candidate && candidate.content && candidate.content.parts
    ? candidate.content.parts.find(p => p.inlineData && p.inlineData.data)
    : null;

  if (!imagePart) throw new Error('Gemini did not return an image');

  const rawBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
  const transparentBuffer = await chromaKeyToTransparent(rawBuffer);

  return { buffer: transparentBuffer, mimeType: 'image/png' };
}

module.exports = { generateDesignImage, analyzeDesign, removeBackgroundFromImage };
