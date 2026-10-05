import { db, hydrate, getBlob, blobURL } from './db.js';
import { icon } from './icons.js';
import { getTemplates } from './data.js';
import { settings, saveSettings } from './state.js';
import { esc, toast, download, blobToDataURL, emptyState, fmtDate } from './util.js';

const PF_CSS = (orientation) => `
.pf{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#2B2724;background:#fff;line-height:1.55}
.pf *{box-sizing:border-box}
.pf-cover{display:flex;flex-direction:column;justify-content:flex-end;min-height:60vh;padding:48px 0;border-bottom:3px solid #4450B8;margin-bottom:48px}
.pf-cover h1{font-size:56px;line-height:1.05;letter-spacing:-.03em;margin:0 0 12px;font-weight:700}
.pf-cover p{margin:0;font-size:18px;color:#6B645E}
.pf-mark{width:48px;height:48px;border-radius:12px;background:#4450B8;position:relative;margin-bottom:32px}
.pf-mark::after{content:"";position:absolute;width:20px;height:20px;background:#FFF1A6;right:8px;top:8px;border-radius:3px;transform:rotate(-6deg)}
.pf-item{margin:0 0 56px}
.pf-item img{display:block;width:100%;height:auto;border-radius:6px;background:#F3F0EC}
.pf-item h2{font-size:22px;letter-spacing:-.01em;margin:16px 0 4px}
.pf-item .pf-sub{color:#6B645E;font-size:14px;margin:0}
.pf-item .pf-desc{margin:8px 0 0;max-width:60ch}
.pf-pal{display:flex;gap:6px;margin-top:12px}
.pf-pal span{display:inline-flex;align-items:flex-end;width:56px;height:40px;border-radius:4px;font-size:9px;padding:2px 4px}
.pf.grid .pf-items{display:grid;grid-template-columns:1fr 1fr;gap:32px}
.pf.grid .pf-item{margin:0}
.pf.grid .pf-item img{aspect-ratio:4/3;object-fit:cover}
.pf-foot{margin-top:48px;padding-top:16px;border-top:1px solid #E9E4DE;color:#6B645E;font-size:13px}
@media screen{.pf{max-width:960px;margin:0 auto;padding:48px 24px}}
@media print{
  @page{size:A4 ${orientation};margin:15mm}
  .pf{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pf-cover{min-height:auto;height:calc(100vh - 2mm);break-after:page;margin:0;border:0;justify-content:center}
  .pf.single .pf-item{break-after:page;break-inside:avoid;display:flex;flex-direction:column;justify-content:center;min-height:calc(100vh - 4mm);margin:0}
  .pf.single .pf-item img{max-height:${orientation === 'landscape' ? '68vh' : '74vh'};width:auto;max-width:100%;object-fit:contain;align-self:center}
  .pf.grid .pf-item{break-inside:avoid}
  .pf-foot{break-before:avoid}
}`;

async function buildHtml(projects, opt, embed) {
  const tmpls = await getTemplates();
  const parts = [];
  for (const p of projects) {
    let src = '';
    if (p.coverBlobId) {
      if (embed) { const b = await getBlob(p.coverBlobId, 'full'); src = b ? await blobToDataURL(b) : ''; }
      else src = await blobURL(p.coverBlobId, 'full');
    }
    const sub = [tmpls[p.type]?.name, p.finishedAt ? new Date(p.finishedAt).getFullYear() : ''].filter(Boolean).join(', ');
    parts.push(`<article class="pf-item">
      ${src ? `<img src="${src}" alt="${esc(p.name)}">` : ''}
      <h2>${esc(p.name)}</h2>
      ${opt.details !== 'title' ? `<p class="pf-sub">${esc(sub)}</p>` : ''}
      ${opt.details === 'full' && p.description ? `<p class="pf-desc">${esc(p.description)}</p>` : ''}
      ${opt.details === 'full' && p.palette?.length ? `<div class="pf-pal">${p.palette.map((c) => `<span style="background:${esc(c.hex)}"></span>`).join('')}</div>` : ''}
    </article>`);
  }
  const cover = opt.cover ? `<header class="pf-cover"><div class="pf-mark"></div><h1>${esc(settings.userName)}</h1>
    ${settings.portfolioIntro ? `<p>${esc(settings.portfolioIntro)}</p>` : ''}${settings.portfolioContact ? `<p>${esc(settings.portfolioContact)}</p>` : ''}</header>` : '';
  return `<div class="pf ${opt.layout}">${cover}<div class="pf-items">${parts.join('')}</div>
    <footer class="pf-foot">${esc(settings.userName)}, ${fmtDate(Date.now(), { month: 'long', year: 'numeric' })}</footer></div>`;
}

export async function render(main) {
  const done = (await db.all('projects')).filter((p) => p.status === 'done').sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  if (!done.length) {
    main.innerHTML = `<header class="page-head"><div><h1>Portfolio</h1></div></header>
      ${emptyState('Nothing to show yet', 'Finish a project and it will appear here, ready to go into your portfolio.', '<a class="btn" href="#/projects">Go to projects</a>')}`;
    return;
  }
  const chosen = new Set(done.map((p) => p.id));
  const opt = { layout: 'single', cover: true, details: 'full', orientation: 'portrait' };
  main.innerHTML = `
  <header class="page-head"><div><h1>Portfolio</h1><p class="muted">Pick finished work and save it as a web page or a PDF.</p></div></header>
  <div class="pf-layout">
    <section>
      <div class="section-head"><h2>Projects</h2><button class="btn btn-sm btn-ghost" data-all>Select all</button></div>
      <div class="pick-grid pf-pick">${done.map((p) => `
        <label class="pick tall"><input type="checkbox" value="${p.id}" checked>
          ${p.coverBlobId ? `<img alt="" data-blob="${p.coverBlobId}">` : '<span class="pick-blank">No cover</span>'}
          <span class="pick-name">${esc(p.name)}</span></label>`).join('')}</div>
    </section>
    <aside class="card pf-options">
      <h2>Options</h2>
      <fieldset class="field"><legend>Layout</legend><div class="seg" data-opt="layout">
        <button data-v="single" class="on" aria-pressed="true">One per page</button><button data-v="grid" aria-pressed="false">Grid</button></div></fieldset>
      <fieldset class="field"><legend>Page</legend><div class="seg" data-opt="orientation">
        <button data-v="portrait" class="on" aria-pressed="true">Portrait</button><button data-v="landscape" aria-pressed="false">Landscape</button></div></fieldset>
      <fieldset class="field"><legend>Under each project</legend><div class="seg" data-opt="details">
        <button data-v="title" aria-pressed="false">Title</button><button data-v="type" aria-pressed="false">Title and type</button><button data-v="full" class="on" aria-pressed="true">Everything</button></div></fieldset>
      <label class="check-line"><input type="checkbox" data-cover checked> Start with a cover page</label>
      <div data-cover-fields>
        <label class="field"><span>One-line intro</span><input data-intro value="${esc(settings.portfolioIntro || '')}" placeholder="Designer and illustrator"></label>
        <label class="field"><span>Contact</span><input data-contact value="${esc(settings.portfolioContact || '')}" placeholder="name@example.com"></label>
      </div>
      <div class="btn-col">
        <button class="btn btn-primary" data-pdf>${icon('printer', 16)} Save as PDF</button>
        <button class="btn" data-html>${icon('download', 16)} Download web page</button>
      </div>
      <p class="muted small">For PDF, choose “Save as PDF” in the print window. Turn on “Background graphics” if colors are missing.</p>
    </aside>
  </div>`;
  hydrate(main);

  main.querySelectorAll('.pf-pick input').forEach((c) => { c.onchange = () => { c.checked ? chosen.add(c.value) : chosen.delete(c.value); }; });
  main.querySelector('[data-all]').onclick = () => main.querySelectorAll('.pf-pick input').forEach((c) => { c.checked = true; chosen.add(c.value); });
  main.querySelectorAll('[data-opt]').forEach((g) => {
    g.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        opt[g.dataset.opt] = b.dataset.v;
        g.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      };
    });
  });
  const coverBox = main.querySelector('[data-cover]');
  coverBox.onchange = () => { opt.cover = coverBox.checked; main.querySelector('[data-cover-fields]').hidden = !coverBox.checked; };
  const saveCover = () => saveSettings({ portfolioIntro: main.querySelector('[data-intro]').value.trim(), portfolioContact: main.querySelector('[data-contact]').value.trim() });
  main.querySelector('[data-intro]').onchange = saveCover;
  main.querySelector('[data-contact]').onchange = saveCover;

  const selected = () => done.filter((p) => chosen.has(p.id));

  main.querySelector('[data-html]').onclick = async () => {
    const list = selected();
    if (!list.length) { toast('Select at least one project.'); return; }
    await saveCover();
    toast('Preparing your page…');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(settings.userName)}, portfolio</title><style>body{margin:0;background:#fff}${PF_CSS(opt.orientation)}</style></head><body>${await buildHtml(list, opt, true)}</body></html>`;
    download(new Blob([html], { type: 'text/html' }), `${(settings.userName || 'portfolio').toLowerCase().replace(/\s+/g, '-')}-portfolio.html`);
  };

  main.querySelector('[data-pdf]').onclick = async () => {
    const list = selected();
    if (!list.length) { toast('Select at least one project.'); return; }
    await saveCover();
    const root = document.getElementById('print-root');
    root.innerHTML = `<style>${PF_CSS(opt.orientation)}</style>${await buildHtml(list, opt, false)}`;
    await Promise.all([...root.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    document.body.classList.add('printing');
    const after = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', after); };
    window.addEventListener('afterprint', after);
    setTimeout(() => window.print(), 50);
  };
}
