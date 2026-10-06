import { db, saveImage, hydrate, getBlob } from './db.js';
import { icon } from './icons.js';
import { BOARD_BGS } from './data.js';
import { extractPalette } from './color.js';
import { pickFont, ensureFont, fontStack, sameFont } from './fonts.js';
import { pickColor } from './colorpick.js';
import {
  uid, esc, toast, clamp, isTyping, imagesFromClipboard, readDrop, imageSize, copyText,
  fetchImage, looksLikeImageUrl, debounce, reducedMotion,
} from './util.js';

const MIN_W = 3200;
const MIN_H = 2200;
const EDGE = 600; // when something comes this close to the edge, the board grows
const STEP = 800; // grow in steps of this many pixels
const GRID = 24; // Tidy up snaps to this grid (same size as the grid and dot backgrounds)
const LINKED_MSG = 'Added as a link because the site blocks saving. It may not show offline, and colors can\'t be read from it. Copy and paste the image to keep a real copy.';

export async function mountBoard(root, project, saveProject) {
  let items = await db.byIndex('items', 'projectId', project.id);
  let scale = project.boardZoom || 1;
  let W = Math.max(MIN_W, project.boardW || 0);
  let H = Math.max(MIN_H, project.boardH || 0);
  const sel = new Set();
  const undo = [];

  root.innerHTML = `
  <div class="board-bar">
    <div class="bb-group">
      <button class="btn btn-sm" data-a="note">${icon('note', 16)} Note</button>
      <button class="btn btn-sm" data-a="image">${icon('image', 16)} Image</button>
      <button class="btn btn-sm" data-a="color">${icon('palette', 16)} Color</button>
      <button class="btn btn-sm" data-a="label">${icon('type', 16)} Label</button>
      <button class="btn btn-sm" data-a="fontadd">${icon('aa', 16)} Font</button>
      <input type="file" accept="image/*" multiple hidden data-file>
    </div>
    <div class="bb-group sel-tools" hidden>
      <span class="bb-sep" aria-hidden="true"></span>
      <span class="sel-count" data-selcount></span>
      <button class="btn btn-sm" data-a="font">${icon('aa', 16)} Change font</button>
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
      <button class="btn btn-sm" data-a="tidy" title="Snap items to the grid. With a selection, only the selected items.">${icon('grid', 16)} Tidy up</button>
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
      <span>Paste an image with Ctrl+V, drop files or images from other sites, or add a note. The board grows as you fill it.</span>
    </div>
  </div>`;

  const wrap = root.querySelector('.board-wrap');
  const sizer = root.querySelector('.board-sizer');
  const board = root.querySelector('.board');
  const selTools = root.querySelector('.sel-tools');
  const hint = root.querySelector('.board-hint');
  const fileIn = root.querySelector('[data-file]');
  const zoomLabel = root.querySelector('[data-zoom]');

  const byId = (id) => items.find((i) => i.id === id);
  const nodeOf = (id) => board.querySelector(`[data-id="${id}"]`);
  const maxZ = () => items.reduce((m, i) => Math.max(m, i.z || 0), 0);
  const persist = (it) => db.put('items', it);
  const saveZoom = debounce(() => { project.boardZoom = scale; saveProject(); }, 600);
  const saveSize = debounce(() => { project.boardW = W; project.boardH = H; saveProject(); }, 800);
  const selected = () => [...sel].map(byId).filter(Boolean);
  const heightOf = (it) => (it.type === 'label' ? (nodeOf(it.id)?.offsetHeight || it.h) : it.h);
  const toBoard = (e) => { const r = board.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; };

  function snapshot() {
    undo.push(JSON.stringify(items));
    if (undo.length > 40) undo.shift();
  }

  // the board grows when something is placed near its right or bottom edge
  function grow(list = items) {
    let w = W, h = H;
    for (const it of list) {
      if (it.x + it.w > w - EDGE) w = Math.ceil((it.x + it.w + EDGE) / STEP) * STEP;
      if (it.y + heightOf(it) > h - EDGE) h = Math.ceil((it.y + heightOf(it) + EDGE) / STEP) * STEP;
    }
    if (w !== W || h !== H) { W = w; H = h; applyZoom(); saveSize(); }
  }
  // scroll the view when dragging close to its edge
  function autoScroll(e) {
    const r = wrap.getBoundingClientRect();
    const m = 48, sp = 24;
    if (e.clientX > r.right - m) wrap.scrollLeft += sp; else if (e.clientX < r.left + m) wrap.scrollLeft -= sp;
    if (e.clientY > r.bottom - m) wrap.scrollTop += sp; else if (e.clientY < r.top + m) wrap.scrollTop -= sp;
  }

  function applyZoom() {
    board.style.width = W + 'px';
    board.style.height = H + 'px';
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
        return `<div class="bi-text" ${it.font ? `style="font-family:${esc(fontStack(it.font))}"` : ''}>${esc(it.text)}</div>`;
      case 'font':
        return `<div class="bi-font-aa" style="font-family:${esc(fontStack(it.font))}">Aa</div>
          <div class="bi-text" style="font-family:${esc(fontStack(it.font))}">${esc(it.text)}</div>
          <div class="bi-font-name">${esc(it.font?.family || '')}</div>`;
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
    setSel([...sel].filter((id) => byId(id)));
    updateHint();
  }
  function setSel(ids) {
    sel.clear();
    ids.forEach((id) => sel.add(id));
    refreshSel();
  }
  function refreshSel() {
    board.querySelectorAll('.bi.sel').forEach((n) => n.classList.remove('sel'));
    sel.forEach((id) => nodeOf(id)?.classList.add('sel'));
    board.classList.toggle('multi', sel.size > 1);
    const list = selected();
    selTools.hidden = !list.length;
    if (!list.length) return;
    const one = list.length === 1 ? list[0] : null;
    selTools.querySelector('[data-selcount]').textContent = list.length > 1 ? `${list.length} selected` : '';
    selTools.querySelector('[data-a="lib"]').hidden = !(one && one.type === 'image');
    selTools.querySelector('[data-a="src"]').hidden = !(one && one.source);
    selTools.querySelector('[data-a="font"]').hidden = !list.every((i) => ['note', 'label', 'font'].includes(i.type));
  }
  const select = (id) => setSel(id ? [id] : []);

  function centerPos(w, h) {
    const jitter = () => Math.round(Math.random() * 60 - 30);
    return {
      x: Math.max(0, Math.round((wrap.scrollLeft + wrap.clientWidth / 2) / scale - w / 2) + jitter()),
      y: Math.max(0, Math.round((wrap.scrollTop + wrap.clientHeight / 2) / scale - h / 2) + jitter()),
    };
  }
  function at(pos, w, h) {
    return pos ? { x: Math.max(0, Math.round(pos.x - w / 2)), y: Math.max(0, Math.round(pos.y - h / 2)) } : centerPos(w, h);
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
    grow([it]);
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

  // ---------- pointer: select, move, resize, copy ----------
  // click = select one, Shift+click = add/remove, drag on empty space = box select,
  // Ctrl/Cmd/Alt + drag = copy, Ctrl/Cmd + click = add/remove
  let drag = null;
  let box = null;
  board.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const node = e.target.closest('.bi');
    if (!node) {
      if (document.activeElement?.isContentEditable) document.activeElement.blur();
      const p = toBoard(e);
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (!additive) setSel([]);
      const el = document.createElement('div');
      el.className = 'marquee';
      board.append(el);
      box = { x0: p.x, y0: p.y, base: new Set(sel), additive, el, moved: false };
      board.setPointerCapture(e.pointerId);
      wrap.focus({ preventScroll: true });
      return;
    }
    if (e.target.isContentEditable) return;
    const it = byId(node.dataset.id);
    if (!it) return;
    const copyKey = e.ctrlKey || e.metaKey || e.altKey;
    if (e.shiftKey) {
      if (sel.has(it.id)) { sel.delete(it.id); refreshSel(); e.preventDefault(); return; }
      sel.add(it.id);
      refreshSel();
    } else if (!sel.has(it.id) && !copyKey) {
      setSel([it.id]);
    }
    const group = sel.has(it.id) ? [...sel] : [it.id];
    const resize = !!e.target.closest('[data-resize]') && group.length === 1;
    drag = {
      it, node, ids: group, sx: e.clientX, sy: e.clientY,
      starts: new Map(group.map((id) => { const x = byId(id); return [id, { x: x.x, y: x.y, w: x.w, h: x.h }]; })),
      resize, copyKey, shift: e.shiftKey, chip: !!e.target.closest('[data-copy]'),
      moved: false, snap: JSON.stringify(items),
    };
    node.setPointerCapture(e.pointerId); // capture on the item so double-click still reaches it
    e.preventDefault();
    wrap.focus({ preventScroll: true });
  });

  function startCopy() {
    const top = maxZ();
    const copies = drag.ids.map(byId).sort((a, b) => (a.z || 0) - (b.z || 0)).map((src, k) => {
      const c = { ...JSON.parse(JSON.stringify(src)), id: uid(), z: top + 1 + k, created: Date.now() + k };
      items.push(c);
      board.append(make(c));
      drag.starts.set(c.id, drag.starts.get(src.id));
      return c.id;
    });
    hydrate(board);
    drag.ids = copies;
    drag.copied = true;
    setSel(copies);
    board.classList.add('copying');
  }

  board.addEventListener('pointermove', (e) => {
    if (box) {
      const p = toBoard(e);
      const x = Math.min(p.x, box.x0), y = Math.min(p.y, box.y0);
      const w = Math.abs(p.x - box.x0), h = Math.abs(p.y - box.y0);
      if (!box.moved && w + h < 4) return;
      box.moved = true;
      Object.assign(box.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
      const hits = items.filter((it) => it.x < x + w && it.x + it.w > x && it.y < y + h && it.y + heightOf(it) > y).map((it) => it.id);
      setSel(box.additive ? [...new Set([...box.base, ...hits])] : hits);
      autoScroll(e);
      return;
    }
    if (!drag) return;
    const dx = (e.clientX - drag.sx) / scale;
    const dy = (e.clientY - drag.sy) / scale;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    if (!drag.moved) {
      drag.moved = true;
      if (drag.copyKey && !drag.resize) startCopy();
      else {
        const top = maxZ();
        drag.ids.map(byId).sort((a, b) => (a.z || 0) - (b.z || 0)).forEach((it, k) => { it.z = top + 1 + k; });
      }
      drag.ids.forEach((id) => nodeOf(id)?.classList.add('dragging'));
    }
    if (drag.resize) {
      const it = drag.it;
      const s0 = drag.starts.get(it.id);
      it.w = Math.max(60, Math.round(s0.w + dx));
      if (it.type === 'image') it.h = Math.round(it.w * s0.h / s0.w);
      else it.h = Math.max(40, Math.round(s0.h + dy));
      place(nodeOf(it.id), it);
      grow([it]);
    } else {
      const moving = drag.ids.map(byId);
      for (const it of moving) {
        const s0 = drag.starts.get(it.id);
        it.x = Math.round(Math.max(-it.w / 2, s0.x + dx));
        it.y = Math.round(Math.max(-20, s0.y + dy));
        place(nodeOf(it.id), it);
      }
      grow(moving);
    }
    autoScroll(e);
  });

  const endDrag = async () => {
    board.classList.remove('copying');
    if (box) {
      box.el.remove();
      box = null;
      return;
    }
    if (!drag) return;
    const d = drag;
    drag = null;
    d.ids.forEach((id) => nodeOf(id)?.classList.remove('dragging'));
    if (d.moved) {
      undo.push(d.snap);
      if (undo.length > 40) undo.shift();
      await db.putMany('items', d.ids.map(byId));
      if (d.copied) toast(d.ids.length > 1 ? `${d.ids.length} items copied` : 'Copied');
    } else if (d.copyKey) {
      // Ctrl/Cmd + click without moving: add to or remove from the selection
      if (sel.has(d.it.id) && sel.size > 1) sel.delete(d.it.id); else sel.add(d.it.id);
      refreshSel();
    } else if (!d.shift && sel.size > 1) {
      setSel([d.it.id]);
    } else if (d.chip) {
      copyText(d.it.color, `${d.it.color.toUpperCase()} copied`);
    }
  };
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);

  board.addEventListener('dblclick', (e) => {
    const node = e.target.closest('.bi');
    if (!node) return;
    const it = byId(node.dataset.id);
    if (it.type === 'note' || it.type === 'label' || it.type === 'font') startEdit(it);
    else if (it.type === 'color') changeColor(it);
    else if (it.type === 'image' && it.source) window.open(it.source, '_blank', 'noopener');
  });

  const paletteHexes = () => [...(project.palette || []).map((c) => c.hex), ...items.filter((i) => i.type === 'color').map((i) => i.color)];
  async function changeColor(it) {
    const hex = await pickColor({ initial: it.color, swatches: paletteHexes(), title: 'Change color' });
    if (!hex || hex === it.color) return;
    snapshot();
    it.color = hex;
    await persist(it);
    nodeOf(it.id)?.replaceWith(make(it));
    refreshSel();
  }

  // ---------- toolbar ----------
  root.querySelector('.board-bar').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.tagName === 'SELECT') return;
    const a = b.dataset.a;
    const list = selected();
    const it = list.length === 1 ? list[0] : null;
    if (a === 'note') addNote('', null, true);
    else if (a === 'image') fileIn.click();
    else if (a === 'color') {
      const hex = await pickColor({ initial: project.palette?.[0]?.hex || '#4450B8', swatches: paletteHexes(), title: 'Add a color' });
      if (hex) await addItem({ type: 'color', color: hex, w: 120, h: 144, ...centerPos(120, 144) });
    } else if (a === 'label') {
      const n = await addItem({ type: 'label', text: 'New section', w: 300, h: 40, ...centerPos(300, 40) });
      startEdit(n);
    } else if (a === 'fontadd') {
      const f = await pickFont({ recent: project.fonts || [] });
      if (!f) return;
      ensureFont(f);
      rememberFont(f);
      await addItem({ type: 'font', font: f, text: 'The quick brown fox jumps over the lazy dog', w: 260, h: 190, ...centerPos(260, 190) });
    } else if (list.length && a === 'font') {
      const f = await pickFont({ current: it?.font, recent: project.fonts || [] });
      if (!f) return;
      snapshot();
      ensureFont(f);
      rememberFont(f);
      for (const x of list) { x.font = f; nodeOf(x.id)?.replaceWith(make(x)); }
      await db.putMany('items', list);
      refreshSel();
    } else if (a === 'tidy') tidy();
    else if (a === 'undo') doUndo();
    else if (a === 'zin' || a === 'zout') {
      scale = clamp(Math.round((scale + (a === 'zin' ? 0.1 : -0.1)) * 10) / 10, 0.3, 1.6);
      applyZoom();
      saveZoom();
    } else if (list.length && a === 'tilt') {
      snapshot();
      for (const x of list) {
        x.rot = x.rot ? 0 : (Math.random() < 0.5 ? -1 : 1) * (2 + Math.round(Math.random() * 3));
        place(nodeOf(x.id), x);
      }
      await db.putMany('items', list);
    } else if (list.length && a === 'front') {
      snapshot();
      const top = maxZ();
      list.sort((p, q) => (p.z || 0) - (q.z || 0)).forEach((x, k) => { x.z = top + 1 + k; place(nodeOf(x.id), x); });
      await db.putMany('items', list);
    } else if (it && a === 'lib') saveToLibrary(it);
    else if (it && a === 'src') window.open(it.source, '_blank', 'noopener');
    else if (list.length && a === 'del') removeSelected();
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

  function rememberFont(f) {
    project.fonts ||= [];
    if (!project.fonts.some((x) => sameFont(x, f))) { project.fonts.push(f); saveProject(); }
  }

  async function removeSelected() {
    const list = selected();
    if (!list.length) return;
    snapshot();
    const gone = new Set(list.map((i) => i.id));
    items = items.filter((i) => !gone.has(i.id));
    for (const id of gone) { nodeOf(id)?.remove(); await db.del('items', id, { silent: true }); }
    window.dispatchEvent(new CustomEvent('moody:changed', { detail: { store: 'items' } }));
    setSel([]);
    updateHint();
    toast(list.length > 1 ? `${list.length} items deleted` : 'Deleted', { action: 'Undo', onAction: doUndo });
  }

  async function duplicateSelected() {
    const list = selected().sort((p, q) => (p.z || 0) - (q.z || 0));
    if (!list.length) return;
    snapshot();
    const top = maxZ();
    const copies = list.map((src, k) => ({ ...JSON.parse(JSON.stringify(src)), id: uid(), x: src.x + 24, y: src.y + 24, z: top + 1 + k, created: Date.now() + k }));
    items.push(...copies);
    copies.forEach((c) => board.append(make(c)));
    hydrate(board);
    await db.putMany('items', copies);
    setSel(copies.map((c) => c.id));
    grow(copies);
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
    grow();
  }

  // Tidy up: snap items to the nearest grid point and size, without changing the layout.
  // With a selection, only the selected items are tidied.
  async function tidy() {
    const list = sel.size ? selected() : items;
    if (!list.length) return;
    snapshot();
    const g = GRID;
    const snap = (v) => Math.round(v / g) * g;
    for (const it of list) {
      it.x = Math.max(0, snap(it.x));
      it.y = Math.max(0, snap(it.y));
      if (it.type === 'image') {
        const ratio = it.h / it.w;
        it.w = Math.max(g * 2, snap(it.w));
        it.h = Math.round(it.w * ratio);
      } else if (it.type !== 'label') {
        it.w = Math.max(g * 2, snap(it.w));
        it.h = Math.max(g * 2, snap(it.h));
      } else {
        it.w = Math.max(g * 4, snap(it.w));
      }
    }
    await db.putMany('items', list);
    if (!reducedMotion()) {
      board.classList.add('animating');
      setTimeout(() => board.classList.remove('animating'), 450);
    }
    list.forEach((it) => { const n = nodeOf(it.id); if (n) place(n, it); });
    grow();
    toast(sel.size ? 'Selection snapped to the grid' : 'Snapped to the grid');
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
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); removeSelected(); }
    else if (mod && !e.shiftKey && k === 'z') { e.preventDefault(); doUndo(); }
    else if (mod && k === 'a') { e.preventDefault(); setSel(items.map((i) => i.id)); }
    else if (mod && k === 'd') { e.preventDefault(); duplicateSelected(); }
    else if (e.key === 'Escape') setSel([]);
    else if (sel.size && e.key.startsWith('Arrow')) {
      const step = e.shiftKey ? 20 : 4;
      const list = selected();
      for (const it of list) {
        if (e.key === 'ArrowLeft') it.x -= step;
        if (e.key === 'ArrowRight') it.x += step;
        if (e.key === 'ArrowUp') it.y -= step;
        if (e.key === 'ArrowDown') it.y += step;
        place(nodeOf(it.id), it);
      }
      e.preventDefault();
      db.putMany('items', list);
      grow(list);
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

  items.forEach((i) => ensureFont(i.font));
  applyZoom();
  render();
  grow();

  return () => {
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('paste', onPaste);
  };
}
