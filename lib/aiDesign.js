// AI design generation via Google's Gemini image model. Uses the current unified
// `@google/genai` SDK (the older `@google/generative-ai` package is deprecated).
const sharp = require('sharp');
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

// The house style brief for every POD design this app generates — a professional t-shirt
// designer's rules, not just "make an image." Applied to generate/edit/remix alike so nothing
// slips through undressed. Simplicity is the product, not a compromise.
const STYLE_BRIEF = [
  'You are a print-on-demand t-shirt designer with 15 years of hand experience in Photoshop/Illustrator.',
  'Every design follows these rules, no exceptions:',
  'COLORS: 2-3 total, muted/wearable tones — not neon, not gradient, not rainbow.',
  'TYPOGRAPHY: one bold, confident, readable typeface carrying the design; clear size hierarchy if more than one line; no fantasy/decorative fonts.',
  'ILLUSTRATION: at most one simple illustration with clean outlines and simple shapes — no added flourishes, badges, banners, ribbons, borders, or stamps unless the concept specifically calls for them.',
  'COMPOSITION: generous negative space, one obvious focal point, deliberate placement — not centered-by-default, not scattered.',
  'EXPLICITLY AVOID (these read as "AI-made"): gradients on text, glow/lens-flare/sparkle effects, more than 3 colors, hyper-saturation, procedural texture overlays, floating particles/dots/stars, drop shadows on every element, metallic/chrome/holographic effects, overly detailed illustration, perfect/rigid symmetry.',
  'Before finishing, silently check: 2-3 colors only; room to breathe with nothing crowded; text reads clearly at a glance and at small size; would look intentional in a real designer\'s portfolio, not generated. If any check fails, simplify — never add something to fix it.'
].join(' ');

const BASE_OUTPUT_INSTRUCTIONS = [
  'Output a single standalone graphic design suitable for print-on-demand apparel:',
  'flat design only, clean vector-friendly shapes, no mockup, no garment,',
  'no photo of a person, no watermark, crisp edges.',
  'Background: fill it with a single, perfectly flat, solid pure chroma-key green',
  '(hex #00FF00) — no gradient, no texture, no checkerboard pattern, no shadow on it.',
  'The green must not appear anywhere in the design artwork itself.'
].join(' ');

const MODE_INSTRUCTIONS = {
  generate: prompt => `${STYLE_BRIEF} Reference/concept: ${prompt} ${BASE_OUTPUT_INSTRUCTIONS}`,
  edit: prompt => [
    STYLE_BRIEF,
    `Edit the provided reference image according to this instruction, preserving its overall`,
    `subject and composition except for what the instruction asks to change: "${prompt}".`,
    `Create an improved version at the same or lower complexity than the reference — never more complex.`,
    BASE_OUTPUT_INSTRUCTIONS
  ].join(' '),
  remix: prompt => [
    STYLE_BRIEF,
    `Combine and remix visual elements from the provided reference images into one new,`,
    `original design, following this direction: "${prompt}". Do not simply place the images`,
    `side by side — blend their styles/elements into a single cohesive composition, at the`,
    `same or lower complexity than the references — never more complex.`,
    BASE_OUTPUT_INSTRUCTIONS
  ].join(' ')
};

// Standard POD print-file canvas: Gildan 5000, 4500x5400px at 300 DPI. The design itself is
// contain-fit (not stretched) onto a transparent canvas of this exact size so every generated
// design is delivery-ready regardless of what aspect ratio Gemini happened to render.
const PRINT_FILE_WIDTH = 4500;
const PRINT_FILE_HEIGHT = 5400;
const PRINT_FILE_DPI = 300;

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
  const printFileBuffer = await sharp(transparentBuffer)
    .resize(PRINT_FILE_WIDTH, PRINT_FILE_HEIGHT, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .withMetadata({ density: PRINT_FILE_DPI })
    .png()
    .toBuffer();

  return { buffer: printFileBuffer, mimeType: 'image/png' };
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
