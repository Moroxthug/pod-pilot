// Persistent library of every design ever uploaded, generated, or saved from Canvas —
// mirrors MyDesigns' "Designs" section, which keeps a browsable history rather than
// treating each upload/generation as a one-off used-and-forgotten URL.
const { readJson, writeJson } = require('./blobStore');

const LIBRARY_PATHNAME = 'pod-pilot/designs-library.json';

function readDesignsLibrary() {
  return readJson(LIBRARY_PATHNAME, []);
}

function writeDesignsLibrary(list) {
  return writeJson(LIBRARY_PATHNAME, list);
}

async function addDesignToLibrary(entry) {
  const list = await readDesignsLibrary();
  const full = { createdAt: new Date().toISOString(), ...entry };
  list.unshift(full);
  await writeDesignsLibrary(list);
  return full;
}

async function removeDesignFromLibrary(id) {
  const list = await readDesignsLibrary();
  const filtered = list.filter(d => d.id !== id);
  await writeDesignsLibrary(filtered);
  return filtered.length !== list.length;
}

module.exports = { readDesignsLibrary, writeDesignsLibrary, addDesignToLibrary, removeDesignFromLibrary };
