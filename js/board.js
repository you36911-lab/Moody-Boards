import { db, saveImage, hydrate, getBlob } from './db.js';
import { icon } from './icons.js';
import { BOARD_BGS } from './data.js';
import { extractPalette } from './color.js';
import {
  uid, esc, toast, clamp, isTyping, imagesFromClipboard, readDrop, imageSize, copyText,
  fetchImage, looksLikeImageUrl, debounce, reducedMotion,
} from './util.js';

const W = 3200;
const H = 2200;
const LINKED_MSG = 'Added as a link because the site blocks saving. It may not show offline, and colors can\'t be read from it. Copy and paste the image to keep a real copy.';

export async function mountBoard(root, project, saveProject) {
  let items = await db.byIndex('items', 'projectId', project.id);
  let scale = project.boardZoom || 1;
  let selId = null;
  const undo = [];

  root.innerHTML = `
  <div class="board-bar">
    <div class="bb-group">
      <button class="btn btn-sm" data-a="note">${icon('note', 16)} Note</button>
      <button class="btn btn-sm" data-a="image">${icon('image', 16)} Image</button>
      <button class="btn btn-sm" data-a="color">${icon('palette', 16)} Color</button>
      <button class="btn btn-sm" data-a="label">${icon('type', 16)} Label</button>
      <input type="file" accept="image/*" multiple hidden data-file>
      <input type="color" class="sr-only" tabindex="-1" aria-hidden="true" data-colorin>
    </div>
    <div class="bb-group sel-tools" hidden>
      <span class="bb-sep" aria-hidden="true"></span>
      <button class="icon-btn" data-a="tilt" title="Tilt" aria-label="Tilt">${icon('tilt', 16)}</button>
      <button class="icon-btn" data-a="front" title="Bring to front" aria-label="Bring to front">${icon('layers', 16)}</button>
      <button class="icon-btn" data-a="lib" title="Save to library" aria-label="Save to library">${icon('bookmark', 16)}</button>
      <button class="icon-btn" data-a="src" title="Open source" aria-label="Open source">${icon('external', 16)}</button>
      <button class="icon-btn danger" data-a="del" title="Delete" aria-label="Delete">${icon('trash', 16)}</button>
    </div>
    <div class="bb-group bb-right">
      <select class="select-sm" data-a="bg" aria-label="Board background">
        ${BOARD_BGS.map(([k, l]) => `<option value="${k}" ${project.boardBg === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <button class="btn btn-sm" data-a="tidy">${icon('grid', 16)} Tidy up</button>
      <button class="icon-btn" data-a="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${icon('undo', 16)}</button>
      <span class="zoom">
        <button class="icon-btn" data-a="zout" aria-label="Zoom out">${icon('zoomOut', 16)}</button>
        <span class="zoom-val" data-zoom>100%</span>
        <button class="icon-btn" data-a="zin" aria-label="Zoom in">${icon('zoomIn', 16)}</button>
      </span>
    </div>
  </div>
  <div class="board-wrap" tabindex="0" aria-label="Mood board">
    <div class="board-sizer"><div class="board bg-${esc(project.boardBg || 'grid')}"></div></div>
    <div class="board-hint" aria-hidden="true">
      <strong>This board is feeling a little empty</strong>
      <span>Paste an image with Ctrl+V, drop files or images from other sites, or add a note.</span>
    </div>
  </div>`;

  const wrap = root.querySelector('.board-wrap');
  const sizer = root.querySelector('.board-sizer');
  const board = root.querySelector('.board');
  const selTools = root.querySelector('.sel-tools');
  const hint = root.querySelector('.board-hint');
  const fileIn = root.querySelector('[data-file]');
  const colorIn = root.querySelector('[data-colorin]');
  const zoomLabel = root.querySelector('[data-zoom]');

  const byId = (id) => items.find((i) => i.id === id);
  const nodeOf = (id) => board.querySelector(`[data-id="${id}"]`);
  const maxZ = () => items.reduce((m, i) => Math.max(m, i.z || 0), 0);
  const persist = (it) => db.put('items', it);
  const saveZoom = debounce(() => { project.boardZoom = scale; saveProject(); }, 600);

  function snapshot() {
    undo.push(JSON.stringify(items));
    if (undo.length > 40) undo.shift();
  }

  function applyZoom() {
    board.style.transform = `scale(${scale})`;
    sizer.style.width = W * scale + 'px';
    sizer.style.height = H * scale + 'px';
    zoomLabel.textContent = Math.round(scale * 100) + '%';
  }
  function updateHint() { hint.hidden = items.some((i) => i.type !== 'label'); }

  function inner(it) {
    switch (it.type) {
      case 'image':
        return it.blobId
          ? `<img alt="" draggable="false" data-blob="${it.blobId}">`
          : `<img alt="" draggable="false" src="${esc(it.url)}" referrerpolicy="no-referrer"><span class="bi-badge">${icon('link', 12)} Linked</span>`;
      case 'note':
      case 'label':
        return `<div class="bi-text">${esc(it.text)}</div>`;
      case 'color':
        return `<div class="bi-swatch" style="background:${esc(it.color)}"></div><button type="button" class="bi-hex" data-copy title="Copy">${esc(it.color.toUpperCase())}</button>`;
      default:
        return '';
    }
  }
  function place(d, it) {
    d.style.left = it.x + 'px';
    d.style.top = it.y + 'px';
    d.style.width = it.w + 'px';
    d.style.height = it.type === 'label' ? 'auto' : it.h + 'px';
    d.style.zIndex = it.z || 1;
    d.style.transform = it.rot ? `rotate(${it.rot}deg)` : '';
  }
  function make(it) {
    const d = document.createElement('div');
    d.className = `bi bi-${it.type}`;
    d.dataset.id = it.id;
    d.innerHTML = inner(it) + '<span class="rh" data-resize aria-hidden="true"></span>';
    place(d, it);
    if (it.type === 'image' && !it.blobId) {
      const img = d.querySelector('img');
      img.onerror = () => d.classList.add('broken');
    }
    return d;
  }
  function render() {
    board.innerHTML = '';
    items.forEach((it) => board.append(make(it)));
    hydrate(board);
    select(selId && byId(selId) ? selId : null);
    updateHint();
  }
  function select(id) {
    selId = id;
    board.querySelectorAll('.bi.sel').forEach((n) => n.classList.remove('sel'));
    const it = id && byId(id);
    if (it) nodeOf(id)?.classList.add('sel');
    selTools.hidden = !it;
    if (it) {
      selTools.querySelector('[data-a="lib"]').hidden = it.type !== 'image';
      selTools.querySelector('[data-a="src"]').hidden = !it.source;
    }
  }

  function centerPos(w, h) {
    const jitter = () => Math.round(Math.random() * 60 - 30);
    return {
      x: clamp(Math.round((wrap.scrollLeft + wrap.clientWidth / 2) / scale - w / 2) + jitter(), 0, W - w),
      y: clamp(Math.round((wrap.scrollTop + wrap.clientHeight / 2) / scale - h / 2) + jitter(), 0, H - h),
    };
  }
  function at(pos, w, h) {
    return pos ? { x: clamp(Math.round(pos.x - w / 2), 0, W - w), y: clamp(Math.round(pos.y - h / 2), 0, H - h) } : centerPos(w, h);
  }

  async function addItem(partial) {
    snapshot();
    const it = { id: uid(), projectId: project.id, x: 0, y: 0, w: 200, h: 160, rot: 0, z: maxZ() + 1, created: Date.now(), ...partial };
    items.push(it);
    await persist(it);
    board.append(make(it));
    hydrate(board);
    select(it.id);
    updateHint();
    return it;
  }
  async function addBlob(blob, pos, source) {
    const blobId = await saveImage(blob);
    const s = await imageSize(blob);
    const w = Math.min(320, s.w || 320);
    const h = Math.max(40, Math.round(w * (s.h / s.w || 0.75)));
    return addItem({ type: 'image', blobId, source: source || null, w, h, ...at(pos, w, h) });
  }
  async function addLinked(url, pos) {
    toast(LINKED_MSG, { ms: 7000 });
    return addItem({ type: 'image', url, source: url, linked: true, w: 280, h: 210, ...at(pos, 280, 210) });
  }
  async function addNote(text, pos, edit = false) {
    const it = await addItem({ type: 'note', text: text || '', w: 200, h: 160, rot: Math.round(Math.random() * 4 - 2), ...at(pos, 200, 160) });
    if (edit) startEdit(it);
  }

  function startEdit(it) {
    const node = nodeOf(it.id);
    const t = node?.querySelector('.bi-text');
    if (!t) return;
    t.contentEditable = 'true';
    t.focus();
    document.getSelection().selectAllChildren(t);
    t.onkeydown = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); t.blur(); } };
    t.onblur = async () => {
      t.contentEditable = 'false';
      t.onblur = null;
      const v = t.innerText.trim();
      if (v !== it.text) { snapshot(); it.text = v; await persist(it); }
    };
  }

  // ---------- pointer: move & resize ----------
  let drag = null;
  board.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const node = e.target.closest('.bi');
    if (!node) {
      if (document.activeElement?.isContentEditable) document.activeElement.blur();
      select(null);
      return;
    }
    if (e.target.isContentEditable) return;
    const it = byId(node.dataset.id);
    if (!it) return;
    select(it.id);
    drag = {
      it, node, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, ow: it.w, oh: it.h,
      resize: !!e.target.closest('[data-resize]'), copy: !!e.target.closest('[data-copy]'),
      moved: false, snap: JSON.stringify(items),
    };
    node.setPointerCapture(e.pointerId);
    e.preventDefault();
    wrap.focus({ preventScroll: true });
  });
  board.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.sx) / scale;
    const dy = (e.clientY - drag.sy) / scale;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    const it = drag.it;
    if (!drag.moved) {
      drag.moved = true;
      if ((it.z || 0) < maxZ()) it.z = maxZ() + 1;
      drag.node.classList.add('dragging');
    }
    if (drag.resize) {
      it.w = Math.max(60, Math.round(drag.ow + dx));
      if (it.type === 'image') it.h = Math.round(it.w * drag.oh / drag.ow);
      else it.h = Math.max(40, Math.round(drag.oh + dy));
    } else {
      it.x = Math.round(clamp(drag.ox + dx, -it.w / 2, W - it.w / 2));
      it.y = Math.round(clamp(drag.oy + dy, -20, H - 40));
    }
    place(drag.node, it);
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.node.classList.remove('dragging');
    if (d.moved) {
      undo.push(d.snap);
      if (undo.length > 40) undo.shift();
      persist(d.it);
    } else if (d.copy) {
      copyText(d.it.color, `${d.it.color.toUpperCase()} copied`);
    }
  };
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);

  board.addEventListener('dblclick', (e) => {
    const node = e.target.closest('.bi');
    if (!node) return;
    const it = byId(node.dataset.id);
    if (it.type === 'note' || it.type === 'label') startEdit(it);
    else if (it.type === 'color') { colorIn.value = it.color; colorIn.dataset.id = it.id; colorIn.click(); }
    else if (it.type === 'image' && it.source) window.open(it.source, '_blank', 'noopener');
  });

  colorIn.addEventListener('change', async () => {
    const it = byId(colorIn.dataset.id);
    if (!it) return;
    snapshot();
    it.color = colorIn.value.toUpperCase();
    await persist(it);
    const old = nodeOf(it.id);
    const n = make(it);
    old.replaceWith(n);
    select(it.id);
  });

  // ---------- toolbar ----------
  root.querySelector('.board-bar').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.tagName === 'SELECT') return;
    const a = b.dataset.a;
    const it = selId && byId(selId);
    if (a === 'note') addNote('', null, true);
    else if (a === 'image') fileIn.click();
    else if (a === 'color') {
      const n = await addItem({ type: 'color', color: project.palette?.[0]?.hex || '#4450B8', w: 120, h: 150, ...centerPos(120, 150) });
      colorIn.value = n.color; colorIn.dataset.id = n.id; colorIn.click();
    } else if (a === 'label') {
      const n = await addItem({ type: 'label', text: 'New section', w: 300, h: 40, ...centerPos(300, 40) });
      startEdit(n);
    } else if (a === 'tidy') tidy();
    else if (a === 'undo') doUndo();
    else if (a === 'zin' || a === 'zout') {
      scale = clamp(Math.round((scale + (a === 'zin' ? 0.1 : -0.1)) * 10) / 10, 0.3, 1.6);
      applyZoom();
      saveZoom();
    } else if (it && a === 'tilt') {
      snapshot();
      it.rot = it.rot ? 0 : (Math.random() < 0.5 ? -1 : 1) * (2 + Math.round(Math.random() * 3));
      place(nodeOf(it.id), it);
      persist(it);
    } else if (it && a === 'front') {
      snapshot();
      it.z = maxZ() + 1;
      place(nodeOf(it.id), it);
      persist(it);
    } else if (it && a === 'lib') saveToLibrary(it);
    else if (it && a === 'src') window.open(it.source, '_blank', 'noopener');
    else if (it && a === 'del') removeSelected();
  });
  root.querySelector('[data-a="bg"]').addEventListener('change', (e) => {
    board.className = 'board bg-' + e.target.value;
    project.boardBg = e.target.value;
    saveProject();
  });
  fileIn.addEventListener('change', async () => {
    let i = 0;
    for (const f of fileIn.files) {
      const p = centerPos(0, 0);
      await addBlob(f, { x: p.x + i * 28, y: p.y + i * 28 });
      i++;
    }
    fileIn.value = '';
  });

  async function removeSelected() {
    const it = selId && byId(selId);
    if (!it) return;
    snapshot();
    items = items.filter((i) => i.id !== it.id);
    nodeOf(it.id)?.remove();
    await db.del('items', it.id);
    select(null);
    updateHint();
    toast('Deleted', { action: 'Undo', onAction: doUndo });
  }

  async function doUndo() {
    const s = undo.pop();
    if (!s) { toast('Nothing to undo'); return; }
    const prev = JSON.parse(s);
    const keep = new Set(prev.map((i) => i.id));
    for (const it of items) if (!keep.has(it.id)) await db.del('items', it.id, { silent: true });
    await db.putMany('items', prev);
    items = prev;
    render();
  }

  async function tidy() {
    if (!items.length) return;
    snapshot();
    const view = Math.max(900, wrap.clientWidth / scale);
    const colW = 260, gap = 24, left = 40;
    const cols = clamp(Math.floor((view - left * 2 + gap) / (colW + gap)), 2, 8);
    const order = { image: 0, note: 1, color: 2 };
    const labels = items.filter((i) => i.type === 'label').sort((a, b) => a.y - b.y || a.x - b.x);
    const rest = items.filter((i) => i.type !== 'label').sort((a, b) => order[a.type] - order[b.type] || (a.created || 0) - (b.created || 0));
    labels.forEach((l, i) => { l.x = left + (i % cols) * (colW + gap); l.y = 32 + Math.floor(i / cols) * 56; l.rot = 0; });
    const top = labels.length ? 32 + Math.ceil(labels.length / cols) * 56 + 12 : 40;
    const hs = Array(cols).fill(top);
    for (const it of rest) {
      if (it.type === 'image') { it.h = Math.round(colW * it.h / it.w); it.w = colW; }
      else if (it.type === 'note') { it.w = colW; it.h = Math.max(120, it.h); }
      const c = hs.indexOf(Math.min(...hs));
      it.x = left + c * (colW + gap);
      it.y = hs[c];
      it.rot = 0;
      hs[c] += it.h + gap;
    }
    await db.putMany('items', items);
    if (!reducedMotion()) {
      board.classList.add('animating');
      setTimeout(() => board.classList.remove('animating'), 450);
    }
    items.forEach((it) => { const n = nodeOf(it.id); if (n) place(n, it); });
    wrap.scrollTo({ left: 0, top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  async function saveToLibrary(it) {
    let colors = [];
    if (it.blobId) {
      const blob = await getBlob(it.blobId, 'thumb');
      colors = blob ? (await extractPalette([blob], 3)).map((c) => c.hex) : [];
    }
    await db.put('library', {
      id: uid(), blobId: it.blobId || null, url: it.blobId ? null : it.url, title: '', description: '',
      link: it.source || '', category: 'Other', tags: [project.name], colors, created: Date.now(),
    });
    toast('Saved to your library');
  }

  // ---------- keyboard, paste, drop ----------
  const modalOpen = () => !!document.querySelector('.modal-back');
  const onKey = (e) => {
    if (isTyping(e) || modalOpen()) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selId) { e.preventDefault(); removeSelected(); }
    else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
    else if (e.key === 'Escape') select(null);
    else if (selId && e.key.startsWith('Arrow')) {
      const it = byId(selId);
      const step = e.shiftKey ? 20 : 4;
      if (e.key === 'ArrowLeft') it.x -= step;
      if (e.key === 'ArrowRight') it.x += step;
      if (e.key === 'ArrowUp') it.y -= step;
      if (e.key === 'ArrowDown') it.y += step;
      e.preventDefault();
      place(nodeOf(it.id), it);
      persist(it);
    }
  };
  const onPaste = async (e) => {
    if (isTyping(e) || modalOpen()) return;
    const files = imagesFromClipboard(e);
    if (files.length) {
      e.preventDefault();
      for (const f of files) await addBlob(f);
      return;
    }
    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (!text) return;
    e.preventDefault();
    if (/^https?:\/\/\S+$/.test(text)) {
      try { await addBlob(await fetchImage(text), null, text); }
      catch { if (looksLikeImageUrl(text)) addLinked(text); else addNote(text); }
    } else addNote(text);
  };
  window.addEventListener('keydown', onKey);
  document.addEventListener('paste', onPaste);

  wrap.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('drop-over'); });
  wrap.addEventListener('dragleave', (e) => { if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('drop-over'); });
  wrap.addEventListener('drop', async (e) => {
    e.preventDefault();
    wrap.classList.remove('drop-over');
    const r = board.getBoundingClientRect();
    const pos = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    const res = await readDrop(e.dataTransfer);
    if (res.blobs) {
      let i = 0;
      for (const b of res.blobs) { await addBlob(b, { x: pos.x + i * 28, y: pos.y + i * 28 }, res.source); i++; }
    } else if (res.linked) addLinked(res.linked, pos);
    else if (res.text) addNote(res.text, pos);
  });

  applyZoom();
  render();

  return () => {
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('paste', onPaste);
  };
}
