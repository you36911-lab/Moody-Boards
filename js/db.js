// All saving and loading goes through this file.
// If you add cloud sync (e.g. Firebase) later, this is the only file that needs to change.
import { uid, makeThumb } from './util.js';

const DB_NAME = 'moody-boards';
const VERSION = 1;
export const STORES = ['projects', 'items', 'blobs', 'library', 'lessons', 'feedback', 'days', 'growth', 'templates', 'meta'];

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) {
        if (!d.objectStoreNames.contains(s)) {
          const os = d.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
          if (s === 'items') os.createIndex('projectId', 'projectId');
        }
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function run(store, mode, fn) {
  return open().then((d) => new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Transaction aborted'));
  }));
}

function changed(store, silent) {
  if (!silent) window.dispatchEvent(new CustomEvent('moody:changed', { detail: { store } }));
}

export const db = {
  all: (s) => run(s, 'readonly', (os) => os.getAll()),
  get: (s, id) => run(s, 'readonly', (os) => os.get(id)),
  byIndex: (s, idx, val) => run(s, 'readonly', (os) => os.index(idx).getAll(val)),
  put: (s, v, { silent } = {}) => run(s, 'readwrite', (os) => os.put(v)).then((r) => { changed(s, silent); return r; }),
  putMany: (s, arr, { silent } = {}) => run(s, 'readwrite', (os) => { arr.forEach((v) => os.put(v)); }).then(() => changed(s, silent)),
  del: (s, id, { silent } = {}) => run(s, 'readwrite', (os) => os.delete(id)).then(() => changed(s, silent)),
  clear: (s) => run(s, 'readwrite', (os) => os.clear()),
};

// ---------- images ----------
const urlCache = new Map();

export async function saveImage(blob) {
  const id = uid();
  const thumb = await makeThumb(blob, 900);
  await db.put('blobs', { id, blob, thumb, type: blob.type, created: Date.now() });
  return id;
}

export async function getBlob(id, kind = 'full') {
  const rec = await db.get('blobs', id);
  if (!rec) return null;
  return kind === 'thumb' ? rec.thumb || rec.blob : rec.blob;
}

export async function blobURL(id, kind = 'thumb') {
  const key = id + ':' + kind;
  if (urlCache.has(key)) return urlCache.get(key);
  const b = await getBlob(id, kind);
  if (!b) return '';
  const u = URL.createObjectURL(b);
  urlCache.set(key, u);
  return u;
}

// Fills every <img data-blob="..."> inside root. Add data-full to load the original.
export function hydrate(root) {
  root.querySelectorAll('img[data-blob]').forEach(async (img) => {
    if (img.dataset.loaded === img.dataset.blob) return;
    img.dataset.loaded = img.dataset.blob;
    const u = await blobURL(img.dataset.blob, img.hasAttribute('data-full') ? 'full' : 'thumb');
    if (u) img.src = u;
  });
}

// Removes images nobody uses any more (older than a day, so undo still works).
export async function cleanUnusedImages() {
  const used = new Set();
  const add = (v) => v && used.add(v);
  (await db.all('items')).forEach((i) => add(i.blobId));
  (await db.all('library')).forEach((i) => add(i.blobId));
  (await db.all('lessons')).forEach((i) => add(i.blobId));
  (await db.all('growth')).forEach((i) => add(i.blobId));
  (await db.all('projects')).forEach((p) => {
    add(p.coverBlobId); add(p.logoBlobId);
    (p.wip || []).forEach((w) => add(w.blobId));
  });
  ((await db.get('meta', 'settings'))?.value?.customFonts || []).forEach((f) => add(f.blobId));
  const dayAgo = Date.now() - 86400000;
  for (const b of await db.all('blobs')) {
    if (!used.has(b.id) && (b.created || 0) < dayAgo) await db.del('blobs', b.id, { silent: true });
  }
}
