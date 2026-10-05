import { icon } from './icons.js';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const BLOCKED_MSG = 'That site blocks saving its images. Copy the image and paste it here with Ctrl+V instead.';

// ---------- dates ----------
export function todayKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function daysUntil(key) {
  return Math.round((parseKey(key) - parseKey(todayKey())) / 86400000);
}
export function fmtDate(v, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = typeof v === 'string' ? parseKey(v) : new Date(v);
  return d.toLocaleDateString('en-GB', opts);
}
export function dueLabel(key) {
  const n = daysUntil(key);
  if (n < 0) return n === -1 ? 'Was due yesterday' : `Was due ${-n} days ago`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  if (n < 14) return `Due in ${n} days`;
  return `Due ${fmtDate(key, { day: 'numeric', month: 'short' })}`;
}
export function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return fmtDate(ts);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------- feedback ----------
export function toast(msg, { action, onAction, ms = 3000 } = {}) {
  const host = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="toast-btn">${esc(action)}</button>` : ''}`;
  host.append(t);
  if (action) t.querySelector('button').onclick = () => { onAction?.(); t.remove(); };
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms);
}

export function confetti() {
  if (reducedMotion()) return;
  const host = document.createElement('div');
  host.className = 'confetti';
  const colors = ['var(--indigo)', 'var(--lemon)', '#F4A6B8', '#8FD3B0'];
  for (let i = 0; i < 46; i++) {
    const s = document.createElement('span');
    s.style.left = Math.random() * 100 + 'vw';
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = Math.random() * 0.35 + 's';
    s.style.setProperty('--drift', (Math.random() * 160 - 80) + 'px');
    s.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
    host.append(s);
  }
  document.body.append(host);
  setTimeout(() => host.remove(), 2200);
}

// ---------- modal ----------
export function modal({ title, body = '', actions = [{ label: 'Close', value: null }], onOpen, onAction, wide = false }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1">
      <header class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<footer class="modal-foot">${actions.map((a, i) => `<button type="button" class="btn ${a.primary ? 'btn-primary' : ''} ${a.danger ? 'btn-danger' : ''} ${a.left ? 'left' : ''}" data-act="${i}">${esc(a.label)}</button>`).join('')}</footer>` : ''}
    </div>`;
    document.body.append(back);
    const prev = document.activeElement;
    let closed = false;
    const close = (v) => {
      if (closed) return;
      closed = true;
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
        const primary = back.querySelector('.btn-primary[data-act]');
        if (primary) { e.preventDefault(); primary.click(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) close(null); });
    back.querySelector('[data-close]').onclick = () => close(null);
    back.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = async () => {
        const a = actions[+b.dataset.act];
        if (onAction) {
          const r = await onAction(a.value, back);
          if (r === false) return;
          close(r === undefined ? a.value : r);
        } else close(a.value);
      };
    });
    onOpen?.(back, close);
    const first = back.querySelector('.modal-body input:not([type=hidden]):not([type=radio]):not([type=checkbox]), .modal-body textarea, .modal-body select');
    (first || back.querySelector('.modal')).focus();
  });
}

export async function confirmBox(title, text, { label = 'Delete', danger = true } = {}) {
  const r = await modal({
    title,
    body: `<p>${esc(text)}</p>`,
    actions: [{ label: 'Cancel', value: false }, { label, value: true, primary: !danger, danger }],
  });
  return r === true;
}

export function fieldError(root, msg) {
  let e = root.querySelector('.form-error');
  if (!e) {
    e = document.createElement('p');
    e.className = 'form-error';
    root.querySelector('.modal-body')?.append(e);
  }
  e.textContent = msg;
}

// ---------- files & images ----------
export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
export function blobToDataURL(b) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}
export async function dataURLToBlob(u) { return (await fetch(u)).blob(); }

export async function copyText(t, msg = 'Copied') {
  try { await navigator.clipboard.writeText(t); toast(msg); }
  catch { toast('Copy failed. Select the text and copy it manually.'); }
}

export async function makeThumb(blob, max = 900) {
  try {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (s === 1 && blob.size < 500000) { bmp.close?.(); return null; }
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * s));
    c.height = Math.max(1, Math.round(bmp.height * s));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return await new Promise((r) => c.toBlob(r, 'image/webp', 0.86));
  } catch { return null; }
}
export async function imageSize(blob) {
  try {
    const b = await createImageBitmap(blob);
    const r = { w: b.width, h: b.height };
    b.close?.();
    return r;
  } catch { return { w: 300, h: 220 }; }
}
export async function fetchImage(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const b = await res.blob();
  if (!b.type.startsWith('image/')) throw new Error('Not an image');
  return b;
}
export const looksLikeImageUrl = (u) => /^data:image\//.test(u) || /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i.test(u);

export function isTyping(e) {
  const t = e.target;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}
export function imagesFromClipboard(e) {
  return [...(e.clipboardData?.items || [])]
    .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
    .map((i) => i.getAsFile())
    .filter(Boolean);
}

// Reads whatever was dropped: files, an image from another website, a link or text.
// Returns { blobs, source } | { linked } | { text }
export async function readDrop(dt) {
  const files = [...(dt.files || [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) return { blobs: files };
  let url = '';
  let fromImg = false;
  const html = dt.getData('text/html');
  if (html) {
    const img = new DOMParser().parseFromString(html, 'text/html').querySelector('img');
    const src = img?.getAttribute('src');
    if (src) { url = src; fromImg = true; }
  }
  if (!url) url = (dt.getData('text/uri-list') || '').split(/\r?\n/).find((l) => l && !l.startsWith('#')) || '';
  const plain = (dt.getData('text/plain') || '').trim();
  if (!url && /^https?:\/\/\S+$/.test(plain)) url = plain;
  if (!url) return plain ? { text: plain } : {};
  try {
    const blob = await fetchImage(url);
    return { blobs: [blob], source: url.startsWith('data:') ? null : url };
  } catch {
    if (fromImg || looksLikeImageUrl(url)) return { linked: url };
    return { text: url };
  }
}

// A click / drop / paste target for adding images. Returns a cleanup function.
export function dropzone(el, { onBlob, multiple = true }) {
  el.classList.add('dropzone');
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = multiple;
  input.hidden = true;
  el.after(input);
  el.addEventListener('click', () => input.click());
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.onchange = () => { [...input.files].forEach((f) => onBlob(f, null)); input.value = ''; };
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('over');
    const r = await readDrop(e.dataTransfer);
    if (r.blobs) r.blobs.forEach((b) => onBlob(b, r.source));
    else if (r.linked) toast(BLOCKED_MSG, { ms: 6000 });
  });
  const onPaste = (e) => {
    if (!el.isConnected) { document.removeEventListener('paste', onPaste); return; }
    if (isTyping(e)) return;
    const files = imagesFromClipboard(e);
    if (files.length) { e.preventDefault(); files.forEach((b) => onBlob(b, null)); }
  };
  document.addEventListener('paste', onPaste);
  return () => document.removeEventListener('paste', onPaste);
}

export function emptyState(title, text, buttonHtml = '') {
  return `<div class="empty"><div class="empty-art" aria-hidden="true"><span></span><span></span><span></span></div><h2>${esc(title)}</h2><p>${esc(text)}</p>${buttonHtml}</div>`;
}
