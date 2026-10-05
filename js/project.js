import { db, saveImage, hydrate } from './db.js';
import { icon } from './icons.js';
import { getTemplates, PURPOSE_OF_TYPE } from './data.js';
import { mountBoard } from './board.js';
import { renderPalette } from './palette.js';
import { feedbackDialog } from './study.js';
import { settings } from './state.js';
import {
  uid, esc, modal, fieldError, toast, confetti, dropzone, dueLabel, daysUntil, fmtDate, debounce,
  confirmBox, emptyState,
} from './util.js';

export async function render(main, [id, tab = 'board']) {
  const p = await db.get('projects', id);
  if (!p) {
    main.innerHTML = emptyState('This project is gone', 'It may have been deleted.', '<a class="btn" href="#/projects">Back to projects</a>');
    return;
  }
  p.palette ||= []; p.wip ||= []; p.checklist ||= [];
  const tmpls = await getTemplates();
  const t = tmpls[p.type] || tmpls.free;
  const tabs = [['board', 'Board'], ['palette', 'Palette'], ['checklist', 'Checklist'], ['process', 'Process']];
  if (t.features?.includes('mockups')) tabs.push(['mockups', 'Mockups']);
  tabs.push(['details', 'Details']);
  if (!tabs.some((x) => x[0] === tab)) tab = 'board';

  main.classList.add('wide');
  const save = async () => { p.updated = Date.now(); await db.put('projects', p); };
  const isDone = p.status === 'done';

  main.innerHTML = `
  <header class="proj-head">
    <a class="back" href="#/${isDone ? 'shelf' : 'projects'}">${icon('chevronLeft', 16)} ${isDone ? 'Shelf' : 'Projects'}</a>
    <div class="proj-title-row">
      <input class="proj-name" value="${esc(p.name)}" aria-label="Project name" maxlength="80">
      <div class="chips"><span class="chip">${esc(t.name)}</span><span data-due-chip></span></div>
      <div class="proj-actions">
        <span class="mini-progress" data-mini></span>
        ${isDone ? `<button class="btn" data-reopen>Reopen</button>` : `<button class="btn btn-primary" data-finish>${icon('check', 16)} Mark as finished</button>`}
      </div>
    </div>
    <div data-hint></div>
    <nav class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" href="#/project/${p.id}/${k}" class="${k === tab ? 'active' : ''}" aria-selected="${k === tab}">${l}</a>`).join('')}</nav>
  </header>
  <section class="tab-body ${tab === 'board' ? 'tab-board' : ''}" data-body></section>`;

  const refreshHead = () => {
    const total = p.checklist.length;
    const done = p.checklist.filter((c) => c.done).length;
    main.querySelector('[data-mini]').textContent = total ? `${done} of ${total} steps` : '';
    const dc = main.querySelector('[data-due-chip]');
    dc.innerHTML = p.due && !isDone ? `<span class="chip ${daysUntil(p.due) <= 3 ? 'chip-warn' : ''}">${esc(dueLabel(p.due))}</span>` : '';
  };
  refreshHead();

  const nameIn = main.querySelector('.proj-name');
  nameIn.addEventListener('change', async () => {
    const v = nameIn.value.trim();
    if (!v) { nameIn.value = p.name; return; }
    p.name = v;
    await save();
    toast('Renamed');
  });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameIn.blur(); });

  main.querySelector('[data-finish]')?.addEventListener('click', () => finish(p, save));
  main.querySelector('[data-reopen]')?.addEventListener('click', async () => {
    p.status = 'active';
    await save();
    toast('Back in your projects');
    location.hash = `#/project/${p.id}/board`;
  });

  // reminder from past feedback, shown once for new projects
  if (p.feedbackHint && !isDone) {
    const fb = (await db.all('feedback')).filter((f) => f.nextTime).sort((a, b) => b.created - a.created).slice(0, 2);
    if (fb.length) {
      const hint = main.querySelector('[data-hint]');
      hint.innerHTML = `<div class="banner lemon">
        <div><strong>Before you start, notes from past feedback</strong>
        <ul>${fb.map((f) => `<li>${esc(f.nextTime)}</li>`).join('')}</ul></div>
        <button class="btn btn-sm" data-gotit>Got it</button></div>`;
      hint.querySelector('[data-gotit]').onclick = async () => { p.feedbackHint = false; await save(); hint.innerHTML = ''; };
    }
  }

  const body = main.querySelector('[data-body]');
  const ctx = { p, t, save, refreshHead };
  let cleanup = null;
  if (tab === 'board') cleanup = await mountBoard(body, p, save);
  else if (tab === 'palette') renderPalette(body, ctx);
  else if (tab === 'checklist') renderChecklist(body, ctx);
  else if (tab === 'process') cleanup = renderProcess(body, ctx);
  else if (tab === 'mockups') cleanup = renderMockups(body, ctx);
  else if (tab === 'details') renderDetails(body, ctx);
  return () => cleanup?.();
}

// ---------- finish ----------
async function finish(p, save) {
  const imgs = (await db.byIndex('items', 'projectId', p.id)).filter((i) => i.type === 'image' && i.blobId);
  const cands = [...new Set([...[...p.wip].sort((a, b) => b.date - a.date).map((w) => w.blobId), ...(p.logoBlobId ? [p.logoBlobId] : []), ...imgs.map((i) => i.blobId)])].slice(0, 12);
  const body = cands.length
    ? `<p>Choose a cover for your shelf.</p><div class="pick-grid">${cands.map((b, i) => `<label class="pick"><input type="radio" name="cover" value="${b}" ${i === 0 ? 'checked' : ''}><img alt="" data-blob="${b}"></label>`).join('')}</div>`
    : '<p>Add an image to the board or the Process tab to give this project a cover. You can still finish it now.</p>';
  const r = await modal({
    title: 'Mark as finished?', body, wide: cands.length > 4,
    onOpen: (root) => hydrate(root),
    actions: [{ label: 'Not yet', value: null }, { label: 'Finish project', value: 'ok', primary: true }],
    onAction: (v, root) => (v === 'ok' ? root.querySelector('[name="cover"]:checked')?.value || 'none' : null),
  });
  if (!r) return;
  p.status = 'done';
  p.finishedAt = Date.now();
  p.coverBlobId = r === 'none' ? null : r;
  await save();
  confetti();
  toast('Finished. It\'s on your shelf now.');
  location.hash = '#/shelf';
}

// ---------- checklist ----------
function renderChecklist(body, { p, t, save, refreshHead }) {
  const draw = () => {
    const total = p.checklist.length;
    const done = p.checklist.filter((c) => c.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const bar = p.palette[0]?.hex || 'var(--indigo)';
    const tip = t.tips?.length ? t.tips[Math.floor(Date.now() / 86400000) % t.tips.length] : '';
    body.innerHTML = `
    <div class="two-col">
      <section class="card">
        <div class="progress-row">
          <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%;background:${esc(bar)}"></span></div>
          <span class="muted small">${pct}%</span>
        </div>
        ${total ? `<ul class="checklist">${p.checklist.map((c) => `
          <li data-id="${c.id}" class="${c.done ? 'done' : ''}">
            <label class="check"><input type="checkbox" ${c.done ? 'checked' : ''} aria-label="Done"><span class="check-box">${icon('check', 14)}</span></label>
            <input class="check-text" value="${esc(c.text)}" aria-label="Step">
            <button class="icon-btn" data-del aria-label="Remove step">${icon('x', 16)}</button>
          </li>`).join('')}</ul>` : '<p class="muted">No steps yet. Add the first one below.</p>'}
        <form class="add-row" data-add><input name="t" placeholder="Add a step" aria-label="New step" maxlength="120"><button class="btn">Add</button></form>
      </section>
      <aside class="side-stack">
        <div class="card"><h3>Due date</h3>
          <input type="date" value="${esc(p.due || '')}" data-due aria-label="Due date">
          <p class="muted small">A reminder shows on the home page during the last week.</p></div>
        ${tip ? `<div class="card lemon-card"><h3>Tip</h3><p>${esc(tip)}</p></div>` : ''}
        <div class="card"><h3>Reuse these steps</h3><p class="muted small">Save this checklist and the board sections as a template for future projects.</p>
          <button class="btn btn-sm" data-tmpl>Save as template</button></div>
      </aside>
    </div>`;
    wire();
  };
  const wire = () => {
    body.querySelectorAll('.checklist li').forEach((li) => {
      const c = p.checklist.find((x) => x.id === li.dataset.id);
      li.querySelector('[type=checkbox]').onchange = async (e) => {
        c.done = e.target.checked;
        await save();
        refreshHead();
        draw();
        if (p.checklist.length && p.checklist.every((x) => x.done) && p.status !== 'done') {
          confetti();
          toast('Every step is done. Ready to finish?', { action: 'Mark as finished', onAction: () => document.querySelector('[data-finish]')?.click(), ms: 6000 });
        }
      };
      li.querySelector('.check-text').onchange = async (e) => { c.text = e.target.value.trim() || c.text; await save(); };
      li.querySelector('[data-del]').onclick = async () => { p.checklist = p.checklist.filter((x) => x !== c); await save(); refreshHead(); draw(); };
    });
    body.querySelector('[data-add]').onsubmit = async (e) => {
      e.preventDefault();
      const v = e.target.t.value.trim();
      if (!v) return;
      p.checklist.push({ id: uid(), text: v, done: false });
      await save();
      refreshHead();
      draw();
      body.querySelector('[data-add] input').focus();
    };
    body.querySelector('[data-due]').onchange = async (e) => { p.due = e.target.value || null; await save(); refreshHead(); };
    body.querySelector('[data-tmpl]').onclick = () => saveAsTemplate(p, t);
  };
  draw();
}

async function saveAsTemplate(p, t) {
  const labels = (await db.byIndex('items', 'projectId', p.id)).filter((i) => i.type === 'label').sort((a, b) => a.x - b.x).map((i) => i.text);
  await modal({
    title: 'Save as template',
    body: `<label class="field"><span>Template name</span><input name="n" value="${esc(p.name)}"></label>
      <p class="muted small">Includes ${p.checklist.length} steps and ${labels.length} board sections.</p>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Save template', value: 'ok', primary: true }],
    onAction: async (v, root) => {
      if (v !== 'ok') return;
      const name = root.querySelector('[name="n"]').value.trim();
      if (!name) { fieldError(root, 'Give the template a name.'); return false; }
      await db.put('templates', {
        id: 'custom-' + uid(), custom: true, name, hint: 'Your template', checklist: p.checklist.map((c) => c.text), zones: labels,
        stages: t.stages || [], features: t.features || [], purpose: PURPOSE_OF_TYPE[p.type] || t.purpose || null, bg: p.boardBg || 'grid', tips: [], created: Date.now(),
      });
      toast('Template saved. You\'ll find it when you start a new project.');
    },
  });
}

// ---------- process (work in progress) ----------
function renderProcess(body, { p, t, save }) {
  const stages = t.stages?.length ? t.stages : ['Start', 'Middle', 'Final'];
  body.innerHTML = `
  <section class="card process-add">
    <div class="field-row">
      <label class="field"><span>Stage</span><select data-stage>${stages.map((s) => `<option>${esc(s)}</option>`).join('')}<option value="__other">Other…</option></select></label>
      <label class="field grow"><span>Note (optional)</span><input data-note placeholder="What changed in this step" maxlength="160"></label>
    </div>
    <div class="dz-line" data-dz>${icon('upload', 18)} Drop, paste or click to add a work-in-progress image</div>
  </section>
  <div class="section-head"><h2>Timeline</h2><button class="btn" data-play hidden>${icon('play', 16)} Play</button></div>
  <div data-list></div>`;
  const list = body.querySelector('[data-list]');
  const stageSel = body.querySelector('[data-stage]');
  const noteIn = body.querySelector('[data-note]');

  const draw = () => {
    const w = [...p.wip].sort((a, b) => a.date - b.date);
    body.querySelector('[data-play]').hidden = w.length < 2;
    list.innerHTML = w.length ? `<ol class="timeline">${w.map((x) => `
      <li data-id="${x.id}"><figure>
        <img alt="${esc(x.stage)}" data-blob="${x.blobId}">
        <figcaption><strong>${esc(x.stage)}</strong><span class="muted small">${fmtDate(x.date)}</span>${x.note ? `<p>${esc(x.note)}</p>` : ''}</figcaption>
      </figure><button class="icon-btn" data-del aria-label="Remove">${icon('trash', 16)}</button></li>`).join('')}</ol>`
      : '<div class="empty small"><p>Save an image at each step. Later you can play the whole process back like a slideshow.</p></div>';
    hydrate(list);
    list.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmBox('Remove this step?', 'The image will be removed from the timeline.', { label: 'Remove' }))) return;
        p.wip = p.wip.filter((x) => x.id !== b.closest('li').dataset.id);
        await save();
        draw();
      };
    });
  };

  const stopPaste = dropzone(body.querySelector('[data-dz]'), {
    onBlob: async (b) => {
      let stage = stageSel.value;
      if (stage === '__other') {
        stage = await modal({
          title: 'Name this stage', body: '<label class="field"><span>Stage</span><input name="s" placeholder="Color test"></label>',
          actions: [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }],
          onAction: (v, root) => (v === 'ok' ? root.querySelector('[name="s"]').value.trim() || 'Step' : null),
        });
        if (!stage) return;
      }
      const blobId = await saveImage(b);
      p.wip.push({ id: uid(), stage, note: noteIn.value.trim(), blobId, date: Date.now() });
      noteIn.value = '';
      const i = stages.indexOf(stage);
      if (i > -1 && i < stages.length - 1) stageSel.value = stages[i + 1];
      await save();
      draw();
      toast('Added to the timeline');
    },
  });

  body.querySelector('[data-play]').onclick = () => slideshow([...p.wip].sort((a, b) => a.date - b.date));
  draw();
  return stopPaste;
}

function slideshow(frames) {
  let i = 0;
  let timer = null;
  modal({
    title: 'Process', wide: true, actions: [],
    body: `<div class="slides"><img alt="" data-full data-slide><div class="slides-bar">
      <button class="icon-btn" data-prev aria-label="Previous">${icon('chevronLeft')}</button>
      <span data-cap></span>
      <button class="icon-btn" data-auto aria-label="Play">${icon('play')}</button>
      <button class="icon-btn" data-next aria-label="Next">${icon('chevronRight')}</button></div></div>`,
    onOpen: (root) => {
      const img = root.querySelector('[data-slide]');
      const cap = root.querySelector('[data-cap]');
      const show = () => {
        const f = frames[i];
        img.dataset.blob = f.blobId;
        hydrate(root);
        cap.textContent = `${i + 1} of ${frames.length}: ${f.stage}`;
      };
      const go = (d) => { i = (i + d + frames.length) % frames.length; show(); };
      root.querySelector('[data-prev]').onclick = () => go(-1);
      root.querySelector('[data-next]').onclick = () => go(1);
      const auto = root.querySelector('[data-auto]');
      auto.onclick = () => {
        if (timer) { clearInterval(timer); timer = null; auto.innerHTML = icon('play'); auto.setAttribute('aria-label', 'Play'); }
        else { timer = setInterval(() => go(1), 1800); auto.innerHTML = icon('pause'); auto.setAttribute('aria-label', 'Pause'); }
      };
      root.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); });
      new MutationObserver((m, obs) => { if (!root.isConnected) { clearInterval(timer); obs.disconnect(); } }).observe(document.body, { childList: true });
      show();
    },
  });
}

// ---------- mockups (logo) ----------
function renderMockups(body, { p, save }) {
  let mode = '';
  let stopPaste = null;
  const draw = async () => {
    stopPaste?.();
    const imgs = (await db.byIndex('items', 'projectId', p.id)).filter((i) => i.type === 'image' && i.blobId);
    const bg = p.palette[0]?.hex || '#4450B8';
    const logo = p.logoBlobId;
    const img = (style = '') => `<img alt="Logo" data-blob="${logo}" data-full style="${style}">`;
    body.innerHTML = `
    <section class="card mock-tools">
      <div class="mock-pick">
        <div class="dz-line" data-dz>${icon('upload', 18)} Drop, paste or click to choose your logo (PNG with a transparent background works best)</div>
        ${imgs.length ? `<p class="muted small">Or pick one from the board:</p><div class="thumb-row">${imgs.slice(0, 12).map((i) => `<button class="thumb ${i.blobId === logo ? 'on' : ''}" data-pick="${i.blobId}" aria-label="Use this image"><img alt="" data-blob="${i.blobId}"></button>`).join('')}</div>` : ''}
      </div>
      ${logo ? `<div class="seg" role="radiogroup" aria-label="Logo test">
        ${[['', 'Original'], ['bw', 'Black and white'], ['sil', 'One color']].map(([k, l]) => `<button role="radio" aria-checked="${mode === k}" class="${mode === k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}
      </div>` : ''}
    </section>
    ${logo ? `<div class="mockups m-${mode}">
      <figure class="mk"><div class="mk-stage stage-paper"><div class="mk-card">${img()}<span>${esc(settings.userName || p.name)}</span></div></div><figcaption>Business card</figcaption></figure>
      <figure class="mk"><div class="mk-stage stage-wall"><div class="mk-sign">${img()}</div></div><figcaption>Shop sign, one color</figcaption></figure>
      <figure class="mk"><div class="mk-stage stage-soft"><div class="mk-app" style="background:${esc(bg)}">${img()}</div><span class="mk-app-name">${esc(p.name.slice(0, 12))}</span></div><figcaption>App icon</figcaption></figure>
      <figure class="mk"><div class="mk-stage stage-soft"><div class="mk-mug">${img()}</div></div><figcaption>Mug</figcaption></figure>
      <figure class="mk mk-wide"><div class="mk-stage stage-paper sizes">${[16, 24, 32, 48, 64, 96].map((s) => `<div>${img(`width:${s}px;height:${s}px`)}<span>${s}px</span></div>`).join('')}</div><figcaption>Small sizes. Is it still clear at 16px?</figcaption></figure>
    </div>` : '<div class="empty small"><p>Choose a logo above to see it on a business card, a sign, an app icon and a mug.</p></div>'}`;
    hydrate(body);
    stopPaste = dropzone(body.querySelector('[data-dz]'), {
      multiple: false,
      onBlob: async (b) => { p.logoBlobId = await saveImage(b); await save(); draw(); },
    });
    body.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = async () => { p.logoBlobId = b.dataset.pick; await save(); draw(); }; });
    body.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { mode = b.dataset.mode; draw(); }; });
  };
  draw();
  return () => stopPaste?.();
}

// ---------- details ----------
async function renderDetails(body, { p, t, save }) {
  const draw = async () => {
    const fb = (await db.all('feedback')).filter((f) => f.projectId === p.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    body.innerHTML = `
    <div class="two-col">
      <section class="card">
        <label class="field"><span>Description</span><textarea rows="5" data-desc placeholder="Who is it for, what should it feel like?">${esc(p.description || '')}</textarea></label>
        <dl class="facts">
          <div><dt>Type</dt><dd>${esc(t.name)}</dd></div>
          <div><dt>Started</dt><dd>${fmtDate(p.created)}</dd></div>
          ${p.finishedAt ? `<div><dt>Finished</dt><dd>${fmtDate(p.finishedAt)}</dd></div>` : ''}
        </dl>
        <div class="section-head"><h3>Feedback on this project</h3><button class="btn btn-sm" data-fb>${icon('plus', 14)} Add feedback</button></div>
        ${fb.length ? `<ul class="feedback-list compact">${fb.map((f) => `<li><button class="feedback-card" data-id="${f.id}">
          <div class="fb-meta"><strong>${esc(f.from || 'Feedback')}</strong><span class="muted small">${fmtDate(f.date)}</span></div>
          ${f.said ? `<p>${esc(f.said)}</p>` : ''}${f.nextTime ? `<div class="fb-next"><span class="fb-label">Next time</span><p>${esc(f.nextTime)}</p></div>` : ''}
        </button></li>`).join('')}</ul>` : '<p class="muted small">Nothing yet. Feedback you add here also appears in Study.</p>'}
      </section>
      <aside class="side-stack">
        ${t.tips?.length ? `<div class="card lemon-card"><h3>Tips for ${esc(t.name.toLowerCase())} projects</h3><ul>${t.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        <div class="card"><h3>Delete project</h3><p class="muted small">Removes the board, palette, checklist and process images of this project.</p>
          <button class="btn btn-danger btn-sm" data-delete>${icon('trash', 14)} Delete project</button></div>
      </aside>
    </div>`;
    const saveDesc = debounce(async (v) => { p.description = v; await save(); }, 500);
    body.querySelector('[data-desc]').oninput = (e) => saveDesc(e.target.value);
    body.querySelector('[data-fb]').onclick = async () => { if (await feedbackDialog(null, { projectId: p.id })) draw(); };
    body.querySelectorAll('[data-id]').forEach((b) => { b.onclick = async () => { if (await feedbackDialog(fb.find((f) => f.id === b.dataset.id))) draw(); }; });
    body.querySelector('[data-delete]').onclick = async () => {
      if (!(await confirmBox(`Delete “${p.name}”?`, 'This can\'t be undone. Export a backup first if you might want it later.'))) return;
      for (const it of await db.byIndex('items', 'projectId', p.id)) await db.del('items', it.id, { silent: true });
      await db.del('projects', p.id);
      toast('Project deleted');
      location.hash = '#/projects';
    };
  };
  draw();
}
