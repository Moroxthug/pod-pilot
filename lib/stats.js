// Lightweight running counters for the dashboard (total mockups generated over time).
// A blob list()-based count would work too, but this is O(1) to read instead of paginating
// every mockup ever generated on every dashboard load.
const { readJson, writeJson } = require('./blobStore');

const STATS_PATHNAME = 'pod-pilot/stats.json';

async function readStats() {
  return readJson(STATS_PATHNAME, { mockupsGenerated: 0 });
}

async function incrementMockupCount(by) {
  const stats = await readStats();
  stats.mockupsGenerated = (stats.mockupsGenerated || 0) + by;
  await writeJson(STATS_PATHNAME, stats);
  return stats;
}

module.exports = { readStats, incrementMockupCount };
