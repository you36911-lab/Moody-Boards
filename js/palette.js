import { db, getBlob } from './db.js';
import { icon } from './icons.js';
import { extractPalette, cuteName, contrast, contrastVerdict, readableOn, harmony, HARMONIES, paletteChecks } from './color.js';
import { PALETTE_IDEAS, PURPOSES, PURPOSE_OF_TYPE } from './data.js';
import { esc, toast, copyText, confirmBox } from './util.js';

export function renderPalette(body, { p, t, save }) {
  let fg = 0;
  let bg = 'white';
  let purpose = PURPOSE_OF_TYPE[p.type] || t.purpose || 'all';
  let base = p.palette[0]?.hex || '#4450B8';
  let mode = 'analogous';

  const swatchRow = (hexes) => `<div class="idea-swatches">${hexes.map((h) => `<span style="background:${esc(h)}" title="${esc(h)}"></span>`).join('')}</div>`;
  function ideasHtml() {
    const tipRow = PURPOSES.find((x) => x[0] === purpose);
    const list = PALETTE_IDEAS.filter((i) => purpose === 'all' || i.purpose === purpose);
    const gen = harmony(base, mode);
    return `<section class="ideas">
      <div class="section-head"><h2>Palette ideas</h2></div>
      <div class="seg" role="radiogroup" aria-label="Purpose">${[['all', 'All'], ...PURPOSES.map((x) => [x[0], x[1]])].map(([k, l]) => `<button role="radio" aria-checked="${purpose === k}" class="${purpose === k ? 'on' : ''}" data-purpose="${k}">${l}</button>`).join('')}</div>
      ${tipRow ? `<p class="idea-tip">${esc(tipRow[2])}</p>` : '<p class="idea-tip">Ready-made palettes sorted by what they work best for.</p>'}
      <div class="idea-grid">${list.map((i) => `<div class="idea-card">${swatchRow(i.colors)}<div class="idea-body"><strong>${esc(i.name)}</strong><button class="btn btn-sm" data-use="${esc(i.name)}">Use</button></div></div>`).join('')}</div>
      <h3 style="margin-top:24px">Build from one color</h3>
      <div class="harmony">
        <label class="btn btn-sm color-add"><span class="dot-big" style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${esc(base)}"></span> ${esc(base)}<input type="color" value="${esc(base)}" data-base aria-label="Base color"></label>
        <select class="select-sm" data-mode aria-label="Color rule">${HARMONIES.map(([k, l]) => `<option value="${k}" ${k === mode ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="idea-grid"><div class="idea-card">${swatchRow(gen.map((c) => c.hex))}<div class="idea-body"><strong>${esc(HARMONIES.find((h) => h[0] === mode)[1])}</strong><button class="btn btn-sm" data-use-gen>Use</button></div></div></div>
    </section>`;
  }
  async function usePalette(colors) {
    if (p.palette.length && !(await confirmBox('Replace palette?', 'Your current colors will be replaced with this palette.', { label: 'Replace', danger: false }))) return;
    p.palette = colors.map((c) => (typeof c === 'string' ? { hex: c, name: cuteName(c) } : c));
    await save();
    draw();
    toast('Palette updated');
    body.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function options(sel) {
    const opts = [...p.palette.map((c, i) => [String(i), `${c.name} ${c.hex}`]), ['white', 'White #FFFFFF'], ['black', 'Near black #2B2724']];
    return opts.map(([v, l]) => `<option value="${v}" ${String(sel) === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  }
  const pick = (v) => (v === 'white' ? '#FFFFFF' : v === 'black' ? '#2B2724' : p.palette[+v]?.hex || '#FFFFFF');

  function draw() {
    if (fg !== 'white' && fg !== 'black' && !p.palette[+fg]) fg = p.palette.length ? 0 : 'black';
    if (bg !== 'white' && bg !== 'black' && !p.palette[+bg]) bg = 'white';
    const f = pick(String(fg));
    const b = pick(String(bg));
    const ratio = contrast(f, b);
    const v = contrastVerdict(ratio);
    body.innerHTML = `
    <div class="palette-layout">
      <section>
        <div class="section-head">
          <h2>Palette</h2>
          <div class="btn-row">
            <button class="btn" data-extract>${icon('sparkle', 16)} Get colors from board</button>
            <label class="btn color-add">${icon('plus', 16)} Add color<input type="color" value="#4450B8" data-add aria-label="Pick a color to add"></label>
          </div>
        </div>
        ${p.palette.length && purpose !== 'all' ? `<ul class="checks" aria-label="Palette check">${paletteChecks(purpose, p.palette).map((c) => `<li class="${c.ok ? 'good' : 'hint'}">${icon(c.ok ? 'check' : 'sparkle', 15)}<span>${esc(c.text)}</span></li>`).join('')}</ul>` : ''}
        ${p.palette.length ? `<ul class="swatches">${p.palette.map((c, i) => `
          <li class="swatch">
            <button class="swatch-color" style="background:${esc(c.hex)};color:${readableOn(c.hex)}" data-copy="${i}" title="Copy ${esc(c.hex)}">${icon('copy', 16)}</button>
            <div class="swatch-info"><strong>${esc(c.name)}</strong><span>${esc(c.hex)}</span></div>
            <button class="icon-btn" data-remove="${i}" aria-label="Remove ${esc(c.name)}">${icon('x', 16)}</button>
          </li>`).join('')}</ul>
          <div class="btn-row">
            <button class="btn btn-sm" data-css>${icon('copy', 14)} Copy as CSS variables</button>
            <button class="btn btn-sm" data-hexes>${icon('copy', 14)} Copy HEX list</button>
            <button class="btn btn-sm btn-ghost" data-clear>Clear palette</button>
          </div>`
        : `<div class="empty small"><p>No colors yet. Add a few images to the board and press <strong>Get colors from board</strong>, or add colors by hand.</p></div>`}
        <p class="muted small">Colors can only be read from images saved in the app, not from linked images.</p>
      </section>
      <section class="card contrast-card">
        <h3>Contrast check</h3>
        <p class="muted small">Is this text color readable on this background?</p>
        <div class="field-row">
          <label class="field"><span>Text</span><select data-fg>${options(fg)}</select></label>
          <label class="field"><span>Background</span><select data-bg>${options(bg)}</select></label>
        </div>
        <div class="contrast-sample" style="color:${f};background:${b}">
          <span class="big">Aa</span><span>The quick brown fox jumps over the lazy dog.</span>
        </div>
        <p class="verdict v-${v.level}"><strong>${ratio.toFixed(2)} : 1</strong> ${v.label}</p>
      </section>
    </div>
    ${ideasHtml()}`;
    wire();
  }

  function wire() {
    body.querySelector('[data-extract]').onclick = extract;
    body.querySelector('[data-add]').onchange = async (e) => {
      const hex = e.target.value.toUpperCase();
      p.palette.push({ hex, name: cuteName(hex) });
      await save();
      draw();
    };
    body.querySelectorAll('[data-copy]').forEach((b) => {
      b.onclick = () => { const c = p.palette[+b.dataset.copy]; copyText(c.hex, `${c.hex} copied`); };
    });
    body.querySelectorAll('[data-remove]').forEach((b) => {
      b.onclick = async () => { p.palette.splice(+b.dataset.remove, 1); await save(); draw(); };
    });
    body.querySelector('[data-css]')?.addEventListener('click', () => {
      const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const css = `:root {\n${p.palette.map((c) => `  --${slug(c.name)}: ${c.hex};`).join('\n')}\n}`;
      copyText(css, 'CSS variables copied');
    });
    body.querySelector('[data-hexes]')?.addEventListener('click', () => copyText(p.palette.map((c) => c.hex).join(', '), 'HEX list copied'));
    body.querySelector('[data-clear]')?.addEventListener('click', async () => {
      if (!(await confirmBox('Clear palette?', 'This removes every color from this palette.', { label: 'Clear' }))) return;
      p.palette = [];
      await save();
      draw();
    });
    body.querySelectorAll('[data-purpose]').forEach((b) => { b.onclick = () => { purpose = b.dataset.purpose; draw(); }; });
    body.querySelectorAll('[data-use]').forEach((b) => { b.onclick = () => usePalette(PALETTE_IDEAS.find((i) => i.name === b.dataset.use).colors); });
    body.querySelector('[data-use-gen]').onclick = () => usePalette(harmony(base, mode));
    body.querySelector('[data-base]').onchange = (e) => { base = e.target.value.toUpperCase(); draw(); };
    body.querySelector('[data-mode]').onchange = (e) => { mode = e.target.value; draw(); };
    body.querySelector('[data-fg]').onchange = (e) => { fg = e.target.value; draw(); };
    body.querySelector('[data-bg]').onchange = (e) => { bg = e.target.value; draw(); };
  }

  async function extract() {
    const items = (await db.byIndex('items', 'projectId', p.id)).filter((i) => i.type === 'image' && i.blobId);
    if (!items.length) { toast('Add some images to the board first.'); return; }
    if (p.palette.length && !(await confirmBox('Replace palette?', 'Your current colors will be replaced with colors from the board.', { label: 'Replace', danger: false }))) return;
    const btn = body.querySelector('[data-extract]');
    btn.disabled = true;
    btn.textContent = 'Reading colors…';
    const blobs = (await Promise.all(items.map((i) => getBlob(i.blobId, 'thumb')))).filter(Boolean);
    p.palette = await extractPalette(blobs, 5);
    await save();
    draw();
    toast(`Found ${p.palette.length} colors`);
  }

  draw();
}
