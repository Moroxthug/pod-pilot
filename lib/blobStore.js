// Persistence layer backed by Vercel Blob. Used both in production (Vercel serverless,
// where the local filesystem is read-only/ephemeral) and in local dev, so behavior is
// identical in both places. Requires BLOB_READ_WRITE_TOKEN (auto-injected on Vercel once
// a Blob store is connected to the project; for local dev, pull it with `vercel env pull`).
const { put, head, del, BlobNotFoundError } = require('@vercel/blob');

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
    const meta = await head(pathname);
    const res = await fetch(meta.url);
    if (!res.ok) return fallback;
    return await res.json();
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
    contentType: 'application/json'
  });
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

module.exports = { uploadBuffer, readJson, writeJson, fetchBuffer, readCustomTemplates, writeCustomTemplates, del };
