import { db, saveImage, hydrate, getBlob } from './db.js';
import { icon } from './icons.js';
import { LIBRARY_CATEGORIES } from './data.js';
import { extractPalette, hexToRgb, dist } from './color.js';
import { uid, esc, modal, fieldError, dropzone, toast, emptyState, imagesFromClipboard, isTyping, imageSize } from './util.js';

async function itemDialog(existing = null, presetBlob = null) {
  const it = existing || { title: '', description: '', link: '', category: 'Other', tags: [], blobId: null, url: null };
  let blobId = it.blobId;
  let source = null;
  const projects = existing ? (await db.all('projects')).filter((p) => p.status !== 'done') : [];
  const body = `
    <div class="lib-form">
      <div class="dz-preview tall" data-dz>${blobId ? `<img alt="" data-blob="${blobId}">` : it.url ? `<img alt="" src="${esc(it.url)}" referrerpolicy="no-referrer">` : 'Drop, paste or click to add an image'}</div>
      <div>
        <label class="field"><span>Title</span><input name="title" value="${esc(it.title)}" placeholder="Hand-lettered menu board"></label>
        <label class="field"><span>Why you saved it (optional)</span><textarea name="description" rows="3" placeholder="Love the mix of serif and script">${esc(it.description)}</textarea></label>
        <div class="field-row">
          <label class="field"><span>Category</span><select name="category">${LIBRARY_CATEGORIES.map((c) => `<option ${c === it.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="field"><span>Tags</span><input name="tags" value="${esc((it.tags || []).join(', '))}" placeholder="cafe, warm"></label>
        </div>
        <label class="field"><span>Where you found it (optional)</span><input name="link" value="${esc(it.link)}" placeholder="https://"></label>
        ${existing && projects.length ? `<div class="field"><span>Add to a project board</span><div class="inline"><select name="toProject">${projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><button type="button" class="btn btn-sm" data-to-board>Add</button></div></div>` : ''}
      </div>
    </div>`;
  const actions = [{ label: 'Cancel', value: null }, { label: existing ? 'Save changes' : 'Save to library', value: 'save', primary: true }];
  if (existing) actions.unshift({ label: 'Delete', value: 'delete', danger: true, left: true });
  return modal({
    title: existing ? 'Inspiration' : 'Add inspiration', body, actions, wide: true,
    onOpen: (root) => {
      const dz = root.querySelector('[data-dz]');
      const setBlob = async (b, src) => {
        blobId = await saveImage(b);
        source = src;
        dz.innerHTML = `<img alt="" data-blob="${blobId}">`;
        hydrate(dz);
        if (src && !root.querySelector('[name="link"]').value) root.querySelector('[name="link"]').value = src;
      };
      hydrate(root);
      dropzone(dz, { multiple: false, onBlob: setBlob });
      if (presetBlob) setBlob(presetBlob, null);
      root.querySelector('[data-to-board]')?.addEventListener('click', async () => {
        const pid = root.querySelector('[name="toProject"]').value;
        const all = await db.byIndex('items', 'projectId', pid);
        const s = blobId ? await imageSize(await getBlob(blobId, 'thumb')) : { w: 280, h: 210 };
        const w = 280;
        await db.put('items', {
          id: uid(), projectId: pid, type: 'image', blobId: blobId || null, url: blobId ? null : it.url, linked: !blobId,
          source: it.link || null, x: 80 + Math.random() * 300, y: 140 + Math.random() * 200, w, h: Math.round(w * s.h / s.w), rot: 0,
          z: all.reduce((m, i) => Math.max(m, i.z || 0), 0) + 1, created: Date.now(),
        });
        toast('Added to the board');
      });
    },
    onAction: async (v, root) => {
      if (v === 'delete') { await db.del('library', existing.id); return 'deleted'; }
      if (v !== 'save') return;
      if (!blobId && !it.url) { fieldError(root, 'Add an image first.'); return false; }
      const g = (n) => root.querySelector(`[name="${n}"]`).value.trim();
      let colors = it.colors || [];
      if (blobId && blobId !== it.blobId) {
        const b = await getBlob(blobId, 'thumb');
        colors = b ? (await extractPalette([b], 3)).map((c) => c.hex) : [];
      }
      await db.put('library', {
        ...it, id: existing?.id || uid(), blobId, title: g('title'), description: g('description'), link: g('link') || source || '',
        category: g('category'), tags: g('tags').split(',').map((t) => t.trim()).filter(Boolean), colors, created: existing?.created || Date.now(),
      });
      return 'saved';
    },
  });
}

export async function render(main) {
  let cat = 'All';
  let q = '';
  let color = null;
  main.innerHTML = `
    <header class="page-head"><div><h1>Library</h1><p class="muted">Inspiration from every project, in one place. Paste an image anywhere on this page to add it.</p></div>
    <button class="btn btn-primary" data-add>${icon('plus', 16)} Add inspiration</button></header>
    <div class="toolbar lib-toolbar">
      <label class="search">${icon('search', 16)}<input type="search" placeholder="Search titles, notes and tags" data-q aria-label="Search library"></label>
      <div class="color-filter">
        <label class="btn btn-sm color-add">${icon('palette', 14)} Find by color<input type="color" value="#4450B8" data-color aria-label="Pick a color to search"></label>
        <span data-color-chip></span>
      </div>
    </div>
    <div class="chips filter-chips" role="group" aria-label="Category">${['All', ...LIBRARY_CATEGORIES].map((c) => `<button class="chip-btn ${c === 'All' ? 'on' : ''}" data-cat="${c}" aria-pressed="${c === 'All'}">${c}</button>`).join('')}</div>
    <div data-grid></div>`;
  const grid = main.querySelector('[data-grid]');

  const draw = async () => {
    const all = (await db.all('library')).sort((a, b) => b.created - a.created);
    const target = color && hexToRgb(color);
    const list = all.filter((i) => (cat === 'All' || i.category === cat)
      && (!q || [i.title, i.description, i.category, ...(i.tags || [])].join(' ').toLowerCase().includes(q))
      && (!target || (i.colors || []).some((h) => dist(hexToRgb(h), target) < 110)));
    if (!all.length) {
      grid.innerHTML = emptyState('Start collecting', 'Save designs, fonts and colors you love. Paste an image here, or save one from any project board.', '');
      return;
    }
    grid.innerHTML = list.length ? `<div class="masonry">${list.map((i) => `
      <button class="lib-card" data-id="${i.id}">
        ${i.blobId ? `<img alt="${esc(i.title)}" data-blob="${i.blobId}">` : `<img alt="${esc(i.title)}" src="${esc(i.url)}" referrerpolicy="no-referrer">`}
        <div class="lib-meta">${i.title ? `<strong>${esc(i.title)}</strong>` : ''}<span class="muted small">${esc(i.category)}</span>
        ${i.colors?.length ? `<span class="dots">${i.colors.map((h) => `<i style="background:${esc(h)}"></i>`).join('')}</span>` : ''}</div>
      </button>`).join('')}</div>` : '<p class="muted">Nothing matches. Try another category, search or color.</p>';
    hydrate(grid);
    grid.querySelectorAll('[data-id]').forEach((b) => {
      b.onclick = async () => { if (await itemDialog(list.find((x) => x.id === b.dataset.id))) draw(); };
    });
  };

  main.querySelector('[data-add]').onclick = async () => { if (await itemDialog()) draw(); };
  main.querySelector('[data-q]').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
  main.querySelectorAll('[data-cat]').forEach((b) => {
    b.onclick = () => {
      cat = b.dataset.cat;
      main.querySelectorAll('[data-cat]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      draw();
    };
  });
  const chip = main.querySelector('[data-color-chip]');
  main.querySelector('[data-color]').onchange = (e) => {
    color = e.target.value;
    chip.innerHTML = `<span class="chip"><i class="dot" style="background:${color}"></i>${color.toUpperCase()}<button class="chip-x" aria-label="Clear color filter">${icon('x', 12)}</button></span>`;
    chip.querySelector('button').onclick = () => { color = null; chip.innerHTML = ''; draw(); };
    draw();
  };

  const onPaste = async (e) => {
    if (isTyping(e) || document.querySelector('.modal-back')) return;
    const files = imagesFromClipboard(e);
    if (!files.length) return;
    e.preventDefault();
    if (await itemDialog(null, files[0])) draw();
  };
  document.addEventListener('paste', onPaste);
  draw();
  return () => document.removeEventListener('paste', onPaste);
}
