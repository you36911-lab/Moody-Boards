import { db, saveImage, hydrate } from './db.js';
import { icon } from './icons.js';
import { uid, esc, modal, fieldError, dropzone, fmtDate, todayKey, emptyState } from './util.js';

export async function feedbackDialog(existing = null, { projectId = null } = {}) {
  const projects = await db.all('projects');
  const f = existing || { from: '', projectId, said: '', nextTime: '', date: todayKey() };
  const body = `
    <div class="field-row">
      <label class="field"><span>From</span><input name="from" value="${esc(f.from)}" placeholder="Teacher, classmate, client"></label>
      <label class="field"><span>Date</span><input type="date" name="date" value="${esc(f.date)}"></label>
    </div>
    <label class="field"><span>Project (optional)</span><select name="projectId"><option value="">None</option>
      ${projects.map((p) => `<option value="${p.id}" ${f.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field"><span>What they said</span><textarea name="said" rows="3" placeholder="The type feels crowded at small sizes">${esc(f.said)}</textarea></label>
    <label class="field"><span>Next time I'll…</span><textarea name="nextTime" rows="2" placeholder="Test the logo at 32px before choosing a direction">${esc(f.nextTime)}</textarea></label>`;
  const actions = [{ label: 'Cancel', value: null }, { label: 'Save feedback', value: 'save', primary: true }];
  if (existing) actions.unshift({ label: 'Delete', value: 'delete', danger: true, left: true });
  return modal({
    title: existing ? 'Edit feedback' : 'Add feedback',
    body, actions,
    onAction: async (v, root) => {
      if (v === 'delete') {
        await db.del('feedback', existing.id);
        return 'deleted';
      }
      if (v !== 'save') return;
      const g = (n) => root.querySelector(`[name="${n}"]`).value.trim();
      if (!g('said') && !g('nextTime')) { fieldError(root, 'Write down what they said or what you\'ll try next time.'); return false; }
      const rec = { id: existing?.id || uid(), from: g('from'), date: g('date') || todayKey(), projectId: g('projectId') || null, said: g('said'), nextTime: g('nextTime'), created: existing?.created || Date.now() };
      await db.put('feedback', rec);
      return rec;
    },
  });
}

async function lessonDialog(existing = null) {
  const l = existing || { title: '', body: '', link: '', tags: [], blobId: null };
  let blobId = l.blobId;
  const body = `
    <label class="field"><span>What did you learn?</span><input name="title" value="${esc(l.title)}" placeholder="Shade the big shapes first"></label>
    <label class="field"><span>Notes</span><textarea name="body" rows="4" placeholder="Block in light and shadow before any detail. Squint to check.">${esc(l.body)}</textarea></label>
    <div class="field-row">
      <label class="field"><span>Link (optional)</span><input name="link" value="${esc(l.link)}" placeholder="https://"></label>
      <label class="field"><span>Tags (comma separated)</span><input name="tags" value="${esc((l.tags || []).join(', '))}" placeholder="shading, anatomy"></label>
    </div>
    <div class="field"><span>Example image (optional)</span><div class="dz-preview" data-dz>${blobId ? `<img alt="" data-blob="${blobId}">` : 'Drop, paste or click to add an image'}</div></div>`;
  const actions = [{ label: 'Cancel', value: null }, { label: 'Save card', value: 'save', primary: true }];
  if (existing) actions.unshift({ label: 'Delete', value: 'delete', danger: true, left: true });
  return modal({
    title: existing ? 'Edit lesson' : 'New lesson card',
    body, actions, wide: true,
    onOpen: (root) => {
      const dz = root.querySelector('[data-dz]');
      hydrate(root);
      dropzone(dz, {
        multiple: false,
        onBlob: async (b) => { blobId = await saveImage(b); dz.innerHTML = `<img alt="" data-blob="${blobId}">`; hydrate(dz); },
      });
    },
    onAction: async (v, root) => {
      if (v === 'delete') { await db.del('lessons', existing.id); return 'deleted'; }
      if (v !== 'save') return;
      const g = (n) => root.querySelector(`[name="${n}"]`).value.trim();
      if (!g('title')) { fieldError(root, 'Give the card a title.'); return false; }
      await db.put('lessons', {
        id: existing?.id || uid(), title: g('title'), body: g('body'), link: g('link'),
        tags: g('tags').split(',').map((t) => t.trim()).filter(Boolean), blobId, created: existing?.created || Date.now(),
      });
      return 'saved';
    },
  });
}

export async function render(main, [tab = 'lessons']) {
  const tabs = [['lessons', 'Lesson cards'], ['feedback', 'Feedback']];
  if (!tabs.some((t) => t[0] === tab)) tab = 'lessons';
  main.innerHTML = `
    <header class="page-head"><div><h1>Study</h1><p class="muted">What you've learned, and what to try next time.</p></div>
    <button class="btn btn-primary" data-add>${icon('plus', 16)} ${tab === 'lessons' ? 'New lesson card' : 'Add feedback'}</button></header>
    <nav class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" href="#/study/${k}" class="${k === tab ? 'active' : ''}" aria-selected="${k === tab}">${l}</a>`).join('')}</nav>
    <section class="tab-body" data-body></section>`;
  const bodyEl = main.querySelector('[data-body]');
  const add = main.querySelector('[data-add]');

  if (tab === 'lessons') {
    let q = '';
    const draw = async () => {
      const all = (await db.all('lessons')).sort((a, b) => b.created - a.created);
      const list = all.filter((l) => !q || [l.title, l.body, ...(l.tags || [])].join(' ').toLowerCase().includes(q));
      bodyEl.innerHTML = all.length ? `
        <div class="toolbar"><label class="search">${icon('search', 16)}<input type="search" placeholder="Search lessons" value="${esc(q)}" data-q aria-label="Search lessons"></label></div>
        <div class="lesson-grid">${list.map((l) => `
          <button class="lesson-card" data-id="${l.id}">
            ${l.blobId ? `<img alt="" data-blob="${l.blobId}">` : ''}
            <h3>${esc(l.title)}</h3>
            ${l.body ? `<p>${esc(l.body)}</p>` : ''}
            ${l.tags?.length ? `<div class="chips">${l.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
          </button>`).join('') || '<p class="muted">No lessons match that search.</p>'}</div>`
        : emptyState('Keep what you learn', 'After a tutorial or a class, write the one thing worth remembering on a card. Add an example image if it helps.', '');
      hydrate(bodyEl);
      const qi = bodyEl.querySelector('[data-q]');
      if (qi) {
        qi.oninput = () => { q = qi.value.toLowerCase(); draw().then(() => { const n = bodyEl.querySelector('[data-q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); };
      }
      bodyEl.querySelectorAll('[data-id]').forEach((b) => {
        b.onclick = async () => { const l = all.find((x) => x.id === b.dataset.id); if (await lessonDialog(l)) draw(); };
      });
    };
    add.onclick = async () => { if (await lessonDialog()) draw(); };
    draw();
  } else {
    const draw = async () => {
      const [all, projects] = await Promise.all([db.all('feedback'), db.all('projects')]);
      all.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.created - a.created);
      const pname = (id) => projects.find((p) => p.id === id)?.name;
      bodyEl.innerHTML = all.length ? `<ul class="feedback-list">${all.map((f) => `
        <li><button class="feedback-card" data-id="${f.id}">
          <div class="fb-meta"><strong>${esc(f.from || 'Feedback')}</strong><span class="muted small">${fmtDate(f.date)}${pname(f.projectId) ? `, ${esc(pname(f.projectId))}` : ''}</span></div>
          ${f.said ? `<div class="fb-said"><span class="fb-label">What they said</span><p>${esc(f.said)}</p></div>` : ''}
          ${f.nextTime ? `<div class="fb-next"><span class="fb-label">Next time</span><p>${esc(f.nextTime)}</p></div>` : ''}
        </button></li>`).join('')}</ul>`
        : emptyState('Turn feedback into progress', 'Write down the feedback you get and one thing to try next time. When you start a new project, it shows up as a gentle reminder.', '');
      bodyEl.querySelectorAll('[data-id]').forEach((b) => {
        b.onclick = async () => { if (await feedbackDialog(all.find((x) => x.id === b.dataset.id))) draw(); };
      });
    };
    add.onclick = async () => { if (await feedbackDialog()) draw(); };
    draw();
  }
}
