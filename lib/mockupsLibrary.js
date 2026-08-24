// Library of every generated mockup, browsable and deletable later instead of only existing as
// a one-off URL from a single session. Stored as one write-once JSON blob per mockup (under
// ENTRY_PREFIX) rather than a single repeatedly-overwritten "table" file — a shared JSON file
// overwritten on every add/delete forces each read to race Vercel Blob's CDN caching behavior,
// which (confirmed by testing during development) can serve a stale body indefinitely after an
// overwrite and silently discard concurrent changes. A blob written exactly once has nothing to
// go stale from, so this sidesteps that whole class of bug.
const { putJsonEntry, getJsonEntry, listPrefixed, del } = require('./blobStore');

const ENTRY_PREFIX = 'pod-pilot/mockup-entries/';
const entryPath = id => `${ENTRY_PREFIX}${id}.json`;

async function readMockupsLibrary() {
  const blobs = await listPrefixed(ENTRY_PREFIX);
  const entries = await Promise.all(blobs.map(b => getJsonEntry(b.pathname)));
  return entries
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function addMockupToLibrary(entry) {
  const [full] = await addMockupsToLibrary([entry]);
  return full;
}

async function addMockupsToLibrary(entries) {
  const fulls = entries.map(entry => ({ createdAt: new Date().toISOString(), ...entry }));
  await Promise.all(fulls.map(full => putJsonEntry(entryPath(full.id), full)));
  return fulls;
}

async function removeMockupsFromLibrary(ids) {
  const entries = await Promise.all(ids.map(id => getJsonEntry(entryPath(id))));
  const found = entries.filter(Boolean);
  await Promise.all(found.map(entry => Promise.all([
    del(entryPath(entry.id)).catch(() => {}),
    del(entry.url).catch(() => {})
  ])));
  const mockups = await readMockupsLibrary();
  return { removedCount: found.length, mockups };
}

module.exports = { readMockupsLibrary, addMockupToLibrary, addMockupsToLibrary, removeMockupsFromLibrary };
