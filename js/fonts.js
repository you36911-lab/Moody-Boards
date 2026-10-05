import { saveImage, getBlob } from './db.js';
import { settings, saveSettings } from './state.js';
import { icon } from './icons.js';
import { esc, modal, toast } from './util.js';

// A font reference saved on items and projects: { family, source: 'google' | 'local' | 'file', category }
export const GOOGLE_FONTS = {
  Sans: ['Inter', 'Poppins', 'Montserrat', 'DM Sans', 'Work Sans', 'Manrope', 'Nunito', 'Outfit', 'Space Grotesk', 'Plus Jakarta Sans', 'Rubik', 'Karla', 'Archivo', 'Figtree', 'Sora'],
  Serif: ['Playfair Display', 'Fraunces', 'DM Serif Display', 'Lora', 'Libre Baskerville', 'Cormorant Garamond', 'EB Garamond', 'Merriweather', 'Instrument Serif', 'Young Serif', 'Bodoni Moda', 'Crimson Pro'],
  Display: ['Bagel Fat One', 'Shrikhand', 'Chewy', 'Bungee', 'Righteous', 'Abril Fatface', 'Lilita One', 'Titan One', 'Fredoka', 'Rubik Mono One', 'Bowlby One', 'Unbounded', 'Syne'],
  Handwriting: ['Caveat', 'Pacifico', 'Dancing Script', 'Sacramento', 'Great Vibes', 'Homemade Apple', 'Shadows Into Light', 'Gochi Hand', 'Patrick Hand', 'Kalam', 'Satisfy', 'Yellowtail'],
  Mono: ['Space Mono', 'JetBrains Mono', 'IBM Plex Mono', 'DM Mono'],
};
const CATEGORY_OF = {};
Object.entries(GOOGLE_FONTS).forEach(([c, list]) => list.forEach((f) => { CATEGORY_OF[f] = c; }));

const FALLBACK = { Serif: 'serif', Mono: 'monospace', Handwriting: 'cursive' };
export const fontStack = (f) => (f ? `'${String(f.family).replace(/['"\\]/g, '')}', ${FALLBACK[f.category] || 'sans-serif'}` : '');
export const sameFont = (a, b) => a && b && a.family === b.family && a.source === b.source;
export const sourceLabel = { google: 'Google Fonts', local: 'On this computer', file: 'Uploaded file' };

const googleUrl = (families) => 'https://fonts.googleapis.com/css2?' + families.map((f) => 'family=' + encodeURIComponent(f).replace(/%20/g, '+')).join('&') + '&display=swap';

const loaded = new Set();
export function loadGoogle(families) {
  const need = families.filter((f) => !loaded.has(f));
  if (!need.length) return Promise.resolve(true);
  need.forEach((f) => loaded.add(f));
  return new Promise((res) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = googleUrl(need);
    l.onload = () => res(true);
    l.onerror = () => { need.forEach((f) => loaded.delete(f)); l.remove(); res(false); };
    document.head.append(l);
  });
}

const registered = new Set();
export async function registerFileFonts() {
  for (const f of settings.customFonts || []) {
    if (registered.has(f.family)) continue;
    try {
      const blob = await getBlob(f.blobId);
      if (!blob) continue;
      const face = new FontFace(f.family, await blob.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      registered.add(f.family);
    } catch (e) { console.warn('Font could not be loaded', f.family, e); }
  }
}

export function ensureFont(f) {
  if (!f) return;
  if (f.source === 'google') loadGoogle([f.family]);
  else if (f.source === 'file') registerFileFonts();
}

export function cssFor(f) {
  const ff = `font-family: ${fontStack(f)};`;
  if (f.source === 'google') return `@import url('${googleUrl([f.family])}');\n\n${ff}`;
  if (f.source === 'file') return `@font-face {\n  font-family: '${f.family}';\n  src: url('${f.family}.woff2') format('woff2'); /* point this at your font file */\n}\n\n${ff}`;
  return `${ff} /* installed on this computer */`;
}

async function addFontFile(file) {
  const family = file.name.replace(/\.(ttf|otf|woff2?|)$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'My font';
  const blobId = await saveImage(file);
  const list = (settings.customFonts || []).filter((f) => f.family !== family);
  list.push({ family, blobId });
  await saveSettings({ customFonts: list });
  await registerFileFonts();
  return { family, source: 'file', category: 'Sans' };
}

// Opens the font picker. `recent` = fonts already used in this project. Resolves to a font ref or null.
export function pickFont({ current = null, recent = [] } = {}) {
  let tab = current?.source === 'local' ? 'local' : current?.source === 'file' ? 'file' : 'google';
  let q = '';
  let cat = 'All';
  let localList = null;
  const sample = 'The quick brown fox';
  loadGoogle(Object.values(GOOGLE_FONTS).flat());
  recent.forEach(ensureFont);

  const row = (f, sub) => `<button type="button" class="font-row ${sameFont(f, current) ? 'on' : ''}" data-f='${esc(JSON.stringify(f))}'>
      <span class="font-preview" style="font-family:${esc(fontStack(f))}">${esc(f.family)}</span>
      <span class="muted small">${esc(sub)}</span></button>`;

  return modal({
    title: 'Choose a font', wide: true, actions: [{ label: 'Cancel', value: null }],
    body: `
      ${recent.length ? `<div class="field"><span>Used in this project</span><div class="chips">${recent.map((f) => `<button type="button" class="chip-btn" data-f='${esc(JSON.stringify(f))}' style="font-family:${esc(fontStack(f))}">${esc(f.family)}</button>`).join('')}</div></div>` : ''}
      <div class="seg" role="tablist" data-tabs>${[['google', 'Google Fonts'], ['local', 'On this computer'], ['file', 'Upload a font']].map(([k, l]) => `<button role="tab" data-tab="${k}">${l}</button>`).join('')}</div>
      <div data-panel class="font-panel"></div>`,
    onOpen: (root, close) => {
      const panel = root.querySelector('[data-panel]');
      const choose = (f) => close(f);
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]');
        if (b) choose(JSON.parse(b.dataset.f));
      });

      const draw = () => {
        root.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
        if (tab === 'google') {
          const list = Object.entries(GOOGLE_FONTS).flatMap(([c, fs]) => fs.map((family) => ({ family, source: 'google', category: c })))
            .filter((f) => (cat === 'All' || f.category === cat) && (!q || f.family.toLowerCase().includes(q)));
          panel.innerHTML = `
            <div class="toolbar"><label class="search">${icon('search', 16)}<input type="search" placeholder="Search fonts" value="${esc(q)}" data-q aria-label="Search fonts"></label></div>
            <div class="chips filter-chips">${['All', ...Object.keys(GOOGLE_FONTS)].map((c) => `<button type="button" class="chip-btn ${c === cat ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('')}</div>
            <div class="font-list">${list.map((f) => row(f, f.category)).join('') || '<p class="muted">No match in this list. Try the box below.</p>'}</div>
            <div class="field font-any"><span>Any other Google Font</span>
              <div class="inline"><input data-any placeholder="e.g. Comfortaa" aria-label="Google Font name"><button type="button" class="btn" data-any-go>Use</button></div>
              <span class="muted small">Type the exact name from fonts.google.com.</span></div>`;
          const qi = panel.querySelector('[data-q]');
          qi.oninput = () => { q = qi.value.toLowerCase(); draw(); const n = panel.querySelector('[data-q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
          panel.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { cat = b.dataset.cat; draw(); }; });
          const go = async () => {
            const name = panel.querySelector('[data-any]').value.trim().replace(/\s+/g, ' ');
            if (!name) return;
            const ok = await loadGoogle([name]);
            if (!ok) { toast(`Couldn't find “${name}” on Google Fonts. Check the spelling.`); return; }
            choose({ family: name, source: 'google', category: CATEGORY_OF[name] || 'Sans' });
          };
          panel.querySelector('[data-any-go]').onclick = go;
          panel.querySelector('[data-any]').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(); } };
        } else if (tab === 'local') {
          const supported = 'queryLocalFonts' in window;
          const list = (localList || []).filter((f) => !q || f.toLowerCase().includes(q));
          panel.innerHTML = `
            ${supported ? (localList ? `
              <div class="toolbar"><label class="search">${icon('search', 16)}<input type="search" placeholder="Search your fonts" value="${esc(q)}" data-q aria-label="Search your fonts"></label><span class="muted small">${localList.length} fonts</span></div>
              <div class="font-list">${list.slice(0, 300).map((family) => row({ family, source: 'local', category: 'Sans' }, 'Installed')).join('') || '<p class="muted">No match.</p>'}</div>`
            : `<p>See the fonts installed on this computer. The browser will ask for permission first.</p><button type="button" class="btn btn-primary" data-show>${icon('type', 16)} Show my fonts</button>`)
            : '<p class="muted">This browser can\'t list installed fonts. Chrome and Edge can. You can still type the name of an installed font below.</p>'}
            <div class="field font-any"><span>Type an installed font's name</span>
              <div class="inline"><input data-local-name placeholder="e.g. Helvetica Neue" aria-label="Installed font name"><button type="button" class="btn" data-local-go>Use</button></div></div>
            <p class="muted small">Installed fonts only show on computers that have them. To use a font everywhere, upload the font file instead.</p>`;
          panel.querySelector('[data-show]')?.addEventListener('click', async () => {
            try {
              const fonts = await window.queryLocalFonts();
              localList = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
              draw();
            } catch { toast('Permission was not given, so the font list can\'t be shown.'); }
          });
          const qi = panel.querySelector('[data-q]');
          if (qi) qi.oninput = () => { q = qi.value.toLowerCase(); draw(); const n = panel.querySelector('[data-q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
          const goLocal = () => { const name = panel.querySelector('[data-local-name]').value.trim(); if (name) choose({ family: name, source: 'local', category: 'Sans' }); };
          panel.querySelector('[data-local-go]').onclick = goLocal;
          panel.querySelector('[data-local-name]').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); goLocal(); } };
        } else {
          const mine = settings.customFonts || [];
          panel.innerHTML = `
            <div class="dz-line" data-fontdz tabindex="0" role="button">${icon('upload', 18)} Drop a font file here or click to choose (.ttf, .otf, .woff, .woff2)</div>
            <input type="file" accept=".ttf,.otf,.woff,.woff2,font/*" hidden data-fontfile>
            ${mine.length ? `<div class="font-list">${mine.map((f) => row({ family: f.family, source: 'file', category: 'Sans' }, 'Uploaded')).join('')}</div>` : ''}
            <p class="muted small">Uploaded fonts are saved in the app and included in backups, so they work offline and on any computer you restore to. Check the font's license before using it in client work.</p>`;
          const dz = panel.querySelector('[data-fontdz]');
          const input = panel.querySelector('[data-fontfile]');
          const take = async (file) => {
            if (!file || !/\.(ttf|otf|woff2?)$/i.test(file.name)) { toast('That isn\'t a font file. Use .ttf, .otf, .woff or .woff2.'); return; }
            try { choose(await addFontFile(file)); } catch { toast('That font file could not be read.'); }
          };
          dz.onclick = () => input.click();
          dz.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
          input.onchange = () => take(input.files[0]);
          dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
          dz.ondragleave = () => dz.classList.remove('over');
          dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); take(e.dataTransfer.files[0]); };
        }
      };
      root.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; q = ''; draw(); }; });
      draw();
    },
  });
}
