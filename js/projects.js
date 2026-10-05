import { db, hydrate } from './db.js';
import { icon } from './icons.js';
import { getTemplates } from './data.js';
import { uid, esc, modal, fieldError, dueLabel, daysUntil, emptyState, fmtDate } from './util.js';

export async function newProjectDialog() {
  const tmpls = await getTemplates();
  const entries = Object.entries(tmpls);
  const body = `
    <label class="field"><span>Project name</span><input name="name" placeholder="Cafe logo redesign" maxlength="80"></label>
    <fieldset class="field"><legend>Type</legend>
      <div class="type-grid">
        ${entries.map(([k, t], i) => `<label class="type-opt"><input type="radio" name="type" value="${esc(k)}" ${i === 0 ? 'checked' : ''}><span><strong>${esc(t.name)}</strong><small>${esc(t.hint || (t.custom ? 'Your template' : ''))}</small></span></label>`).join('')}
      </div>
    </fieldset>
    <div class="field-row">
      <label class="field"><span>Due date (optional)</span><input type="date" name="due"></label>
    </div>
    <label class="field"><span>Description (optional)</span><textarea name="description" rows="2" placeholder="What is this project about?"></textarea></label>`;
  return modal({
    title: 'New project',
    body,
    wide: true,
    actions: [{ label: 'Cancel', value: null }, { label: 'Create project', value: 'create', primary: true }],
    onAction: async (v, root) => {
      if (v !== 'create') return;
      const f = (n) => root.querySelector(`[name="${n}"]`);
      const name = f('name').value.trim();
      if (!name) { fieldError(root, 'Give the project a name first.'); f('name').focus(); return false; }
      const type = root.querySelector('[name="type"]:checked').value;
      const t = tmpls[type];
      const feedback = (await db.all('feedback')).filter((x) => x.nextTime);
      const p = {
        id: uid(), name, type, due: f('due').value || null, description: f('description').value.trim(),
        created: Date.now(), updated: Date.now(), status: 'active',
        checklist: (t.checklist || []).map((text) => ({ id: uid(), text, done: false })),
        palette: [], wip: [], boardBg: t.bg || 'grid', boardZoom: 1, logoBlobId: null, coverBlobId: null,
        feedbackHint: feedback.length > 0,
      };
      await db.put('projects', p);
      const labels = (t.zones || []).map((text, i) => ({
        id: uid(), projectId: p.id, type: 'label', text, x: 60 + i * 440, y: 40, w: 320, h: 40, rot: 0, z: i + 1, created: Date.now() + i,
      }));
      if (labels.length) await db.putMany('items', labels);
      location.hash = `#/project/${p.id}/board`;
      return p;
    },
  });
}

async function coverFor(p, itemsByProject) {
  if (p.coverBlobId) return `<img alt="" data-blob="${p.coverBlobId}">`;
  const img = (itemsByProject[p.id] || []).find((i) => i.type === 'image' && i.blobId);
  if (img) return `<img alt="" data-blob="${img.blobId}">`;
  if (p.palette?.length) return `<div class="cover-palette">${p.palette.map((c) => `<span style="background:${esc(c.hex)}"></span>`).join('')}</div>`;
  return `<div class="cover-blank bg-${esc(p.boardBg || 'grid')}"><span>${esc(p.name.slice(0, 1).toUpperCase())}</span></div>`;
}

async function cardsHtml(list) {
  const tmpls = await getTemplates();
  const all = await db.all('items');
  const byP = {};
  all.forEach((i) => { (byP[i.projectId] ||= []).push(i); });
  const out = [];
  for (const p of list) {
    const total = p.checklist?.length || 0;
    const done = p.checklist?.filter((c) => c.done).length || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const bar = p.palette?.[0]?.hex || 'var(--indigo)';
    const dueCls = p.due && p.status !== 'done' && daysUntil(p.due) <= 3 ? 'chip-warn' : '';
    out.push(`<a class="proj-card" href="#/project/${p.id}/board">
      <div class="proj-cover">${await coverFor(p, byP)}</div>
      <div class="proj-meta">
        <h3>${esc(p.name)}</h3>
        <div class="chips"><span class="chip">${esc(tmpls[p.type]?.name || 'Project')}</span>
        ${p.status === 'done' ? `<span class="chip">Finished ${fmtDate(p.finishedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : p.due ? `<span class="chip ${dueCls}">${esc(dueLabel(p.due))}</span>` : ''}</div>
        ${p.status !== 'done' && total ? `<div class="progress thin" aria-label="${pct}% done"><span style="width:${pct}%;background:${esc(bar)}"></span></div>` : ''}
      </div></a>`);
  }
  return out.join('');
}

export async function render(main) {
  const projects = (await db.all('projects')).filter((p) => p.status !== 'done').sort((a, b) => (b.updated || 0) - (a.updated || 0));
  main.innerHTML = `
    <header class="page-head"><div><h1>Projects</h1><p class="muted">Everything you're working on right now.</p></div>
    <button class="btn btn-primary" data-new>${icon('plus', 16)} New project</button></header>
    ${projects.length ? `<div class="proj-grid">${await cardsHtml(projects)}</div>`
      : emptyState('Start your first project', 'Pick a type like logo or illustration and you\'ll get a board, a checklist and a palette ready to go.', `<button class="btn btn-primary" data-new>${icon('plus', 16)} New project</button>`)}`;
  main.querySelectorAll('[data-new]').forEach((b) => { b.onclick = newProjectDialog; });
  hydrate(main);
}

export async function renderShelf(main) {
  const done = (await db.all('projects')).filter((p) => p.status === 'done').sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  main.innerHTML = `
    <header class="page-head"><div><h1>Shelf</h1><p class="muted">Finished work, all in one place.</p></div>
    ${done.length ? `<a class="btn" href="#/portfolio">${icon('fileOut', 16)} Make a portfolio</a>` : ''}</header>
    ${done.length ? `<div class="proj-grid shelf">${await cardsHtml(done)}</div>`
      : emptyState('Your shelf is waiting', 'When you mark a project as finished, it lands here with its cover. Over time, this becomes your portfolio.', '<a class="btn" href="#/projects">Go to projects</a>')}`;
  hydrate(main);
}
