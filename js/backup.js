import { db } from './db.js';
import { blobToDataURL, dataURLToBlob, makeThumb, download, todayKey } from './util.js';

const DATA_STORES = ['projects', 'items', 'library', 'lessons', 'feedback', 'days', 'growth', 'templates'];
const KEEP_DAILY = 14;

export async function buildBackup() {
  const data = {};
  for (const s of DATA_STORES) data[s] = await db.all(s);
  const settings = (await db.get('meta', 'settings'))?.value || {};
  const blobs = [];
  for (const b of await db.all('blobs')) {
    blobs.push({ id: b.id, type: b.type, created: b.created, data: await blobToDataURL(b.blob) });
  }
  return JSON.stringify({ app: 'moody-boards', version: 1, exportedAt: new Date().toISOString(), settings, data, blobs });
}

export async function exportToFile() {
  const json = await buildBackup();
  download(new Blob([json], { type: 'application/json' }), `moody-boards-backup-${todayKey()}.json`);
}

export async function importFromFile(file) {
  const obj = JSON.parse(await file.text());
  if (obj?.app !== 'moody-boards' || !obj.data) throw new Error('This file is not a backup from this app.');
  for (const s of [...DATA_STORES, 'blobs']) await db.clear(s);
  for (const s of DATA_STORES) if (obj.data[s]?.length) await db.putMany(s, obj.data[s], { silent: true });
  for (const b of obj.blobs || []) {
    const blob = await dataURLToBlob(b.data);
    await db.put('blobs', { id: b.id, type: b.type, created: b.created || Date.now(), blob, thumb: await makeThumb(blob, 900) }, { silent: true });
  }
  if (obj.settings) await db.put('meta', { key: 'settings', value: obj.settings }, { silent: true });
}

// ---------- automatic folder backup (Chrome / Edge) ----------
let dir = null;
let timer = null;

export const autoSupported = () => 'showDirectoryPicker' in window;

export async function initAutoBackup() {
  dir = (await db.get('meta', 'backupDir'))?.value || null;
  window.addEventListener('moody:changed', () => {
    if (!dir) return;
    clearTimeout(timer);
    timer = setTimeout(() => backupNow().catch((e) => console.warn('Auto backup failed', e)), 15000);
  });
  window.addEventListener('beforeunload', () => { if (timer) backupNow().catch(() => {}); });
}

export async function autoStatus() {
  if (!dir) return { state: 'off' };
  const last = (await db.get('meta', 'lastBackup'))?.value || null;
  let perm = 'prompt';
  try { perm = await dir.queryPermission({ mode: 'readwrite' }); } catch { /* ignore */ }
  return { state: perm === 'granted' ? 'on' : 'reconnect', folder: dir.name, last };
}

export async function chooseFolder() {
  const h = await window.showDirectoryPicker({ id: 'moody-backup', mode: 'readwrite' });
  dir = h;
  await db.put('meta', { key: 'backupDir', value: h }, { silent: true });
  await backupNow();
}

export async function reconnect() {
  if (!dir) return false;
  const p = await dir.requestPermission({ mode: 'readwrite' });
  if (p === 'granted') { await backupNow(); return true; }
  return false;
}

export async function disconnect() {
  dir = null;
  clearTimeout(timer);
  await db.del('meta', 'backupDir', { silent: true });
}

async function writeFile(name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

export async function backupNow() {
  clearTimeout(timer);
  timer = null;
  if (!dir) return false;
  if ((await dir.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
  const json = await buildBackup();
  await writeFile('moody-boards-backup-latest.json', json);
  await writeFile(`moody-boards-backup-${todayKey()}.json`, json);
  // keep the last two weeks of daily copies
  const daily = [];
  for await (const [name] of dir.entries()) {
    if (/^moody-boards-backup-\d{4}-\d{2}-\d{2}\.json$/.test(name)) daily.push(name);
  }
  daily.sort().slice(0, Math.max(0, daily.length - KEEP_DAILY)).forEach((n) => dir.removeEntry(n).catch(() => {}));
  await db.put('meta', { key: 'lastBackup', value: Date.now() }, { silent: true });
  window.dispatchEvent(new CustomEvent('moody:backup'));
  return true;
}
