// Saved cost/price tables per garment, so a seller doesn't have to re-enter their known
// Printify/print-provider costs every time — mirrors MyDesigns' "Load prices from field" step.
const { readJson, writeJson } = require('./blobStore');

const PRESETS_PATHNAME = 'pod-pilot/pricing-presets.json';

function readPricingPresets() {
  return readJson(PRESETS_PATHNAME, []);
}

function writePricingPresets(list) {
  return writeJson(PRESETS_PATHNAME, list);
}

async function addPricingPreset(preset) {
  const list = await readPricingPresets();
  const full = { id: preset.id || require('crypto').randomUUID(), createdAt: new Date().toISOString(), ...preset };
  const filtered = list.filter(p => p.id !== full.id);
  filtered.unshift(full);
  await writePricingPresets(filtered);
  return full;
}

async function removePricingPreset(id) {
  const list = await readPricingPresets();
  const filtered = list.filter(p => p.id !== id);
  await writePricingPresets(filtered);
  return filtered.length !== list.length;
}

module.exports = { readPricingPresets, writePricingPresets, addPricingPreset, removePricingPreset };
