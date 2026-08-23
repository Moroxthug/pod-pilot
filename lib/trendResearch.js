// Trend/niche research via Gemini with live Google Search grounding. Etsy doesn't expose a
// public trends API, so this grounds the model in real current web results instead of relying
// on training-data knowledge, which would go stale immediately for a "what's trending" feature.
const { getGeminiClient } = require('./geminiClient');

const MODEL = 'gemini-3.6-flash';

async function researchTrends({ focus } = {}) {
  const ai = getGeminiClient();

  const prompt = [
    'You are researching trending niches for a print-on-demand Etsy apparel seller.',
    focus
      ? `Focus specifically on the "${focus}" niche/category.`
      : 'Cover a spread of currently trending POD niches across different audiences (not just one category).',
    'Use live web search to ground this in what is actually trending right now — seasonal trends,',
    'recent viral moments, and currently high-interest hobbies/identities/humor angles — not generic evergreen advice.',
    '',
    'Return STRICT JSON only, no markdown fences, no commentary, matching exactly this shape:',
    '{"trends":[{"niche":string,"whyTrending":string,"keywords":string[5-8 items],"competitionLevel":"Low"|"Medium"|"High","designAngle":string}]}',
    'Return 6-8 trend entries. "designAngle" is a concrete one-sentence design concept a seller could generate today.'
  ].join(' ');

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  const text = response.text;
  if (!text) throw new Error('Gemini did not return trend research');

  const parsed = parseJsonLoose(text);
  if (!parsed || !Array.isArray(parsed.trends)) {
    throw new Error('Gemini returned an unexpected format for trend research');
  }

  const groundingChunks = response.candidates &&
    response.candidates[0] &&
    response.candidates[0].groundingMetadata &&
    response.candidates[0].groundingMetadata.groundingChunks || [];
  const sources = groundingChunks
    .map(c => c.web && { title: c.web.title, uri: c.web.uri })
    .filter(Boolean);

  return { trends: parsed.trends, sources };
}

// Gemini with tools enabled can't use responseSchema/JSON mode, so extract the JSON object
// out of whatever prose/fencing it wraps around it.
function parseJsonLoose(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

module.exports = { researchTrends };
