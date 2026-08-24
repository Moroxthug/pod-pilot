// Persistence layer backed by Vercel Blob. Used both in production (Vercel serverless,
// where the local filesystem is read-only/ephemeral) and in local dev, so behavior is
// identical in both places. Requires BLOB_READ_WRITE_TOKEN (auto-injected on Vercel once
// a Blob store is connected to the project; for local dev, pull it with `vercel env pull`).
const { put, get, del, list, BlobNotFoundError } = require('@vercel/blob');

const CUSTOM_TEMPLATES_PATHNAME = 'pod-pilot/custom-templates.json';

async function uploadBuffer(pathname, buffer, contentType) {
  const blob = await put(pathname, buffer, {
    access: 'public',
    addRandomSuffix: true,
    contentType
  });
  return blob.url;
}

async function readJson(pathname, fallback) {
  try {
    // These JSON blobs are mutable "files" (overwritten in place via allowOverwrite), unlike
    // uploadBuffer()'s immutable, uniquely-named uploads. Reading through the public CDN URL —
    // even with cache-busting query params or a fresh downloadUrl variant — can keep serving a
    // stale body indefinitely after an overwrite once that exact path has ever been fetched
    // once (confirmed by testing; the CDN doesn't reliably revalidate on new writes). get() with
    // useCache:false is the SDK's documented bypass: it reads directly from origin storage.
    const result = await get(pathname, { access: 'public', useCache: false });
    if (!result) return fallback;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof BlobNotFoundError) return fallback;
    throw err;
  }
}

async function writeJson(pathname, data) {
  await put(pathname, JSON.stringify(data, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    // These JSON blobs are mutable "files" (overwritten in place), not the immutable,
    // uniquely-named uploads uploadBuffer() handles — Vercel's default 30-day CDN cache
    // means the public URL can keep serving a stale body well after a real overwrite
    // (query-string cache-busting doesn't help; the CDN appears to ignore it). Forcing
    // effectively no caching here is what actually fixes read-your-own-write correctness.
    cacheControlMaxAge: 0
  });
}

// Write-once JSON entry (e.g. one record in a "table" of many small files under a shared
// prefix) rather than a single repeatedly-overwritten JSON "file". Overwriting one shared blob
// forces every read to race a read-modify-write against Vercel Blob's CDN caching (see
// readJson/writeJson above) — a blob that's written exactly once and never touched again has
// no stale-version-to-serve, so this sidesteps that entire class of bug for collections that
// naturally have a stable per-item id (add one file per item, delete that one file to remove it).
async function putJsonEntry(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: 'application/json'
  });
}

async function getJsonEntry(pathname) {
  try {
    const result = await get(pathname, { access: 'public', useCache: false });
    if (!result) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

// Lists every blob under a prefix (single page — fine for the small, personal-scale
// collections this app deals with; would need cursor pagination past ~1000 entries).
async function listPrefixed(prefix) {
  const { blobs } = await list({ prefix });
  return blobs;
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function readCustomTemplates() {
  return readJson(CUSTOM_TEMPLATES_PATHNAME, []);
}

function writeCustomTemplates(list) {
  return writeJson(CUSTOM_TEMPLATES_PATHNAME, list);
}

module.exports = {
  uploadBuffer,
  readJson,
  writeJson,
  putJsonEntry,
  getJsonEntry,
  listPrefixed,
  fetchBuffer,
  readCustomTemplates,
  writeCustomTemplates,
  del
};
