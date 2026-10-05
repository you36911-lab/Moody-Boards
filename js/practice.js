import { db, saveImage, hydrate, blobURL } from './db.js';
import { icon } from './icons.js';
import { PROMPT_SUBJECTS, PROMPT_CONSTRAINTS, PROMPT_MINUTES } from './data.js';
import { uid, esc, modal, fieldError, dropzone, toast, todayKey, parseKey, fmtDate, emptyState, confirmBox, confetti } from './util.js';

export async function stampToday() {
  const k = todayKey();
  if (await db.get('days', k)) return false;
  await db.put('days', { id: k, created: Date.now() });
  return true;
}

export function streakOf(keys) {
  const set = new Set(keys);
  let d = new Date();
  if (!set.has(todayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(todayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

export async function render(main, [tab = 'croquis']) {
  const tabs = [['croquis', 'Croquis timer'], ['prompt', 'Prompt'], ['calendar', 'Calendar'], ['growth', 'Growth']];
  if (!tabs.some((t) => t[0] === tab)) tab = 'croquis';
  main.innerHTML = `
    <header class="page-head"><div><h1>Practice</h1><p class="muted">Small, regular drawing practice adds up.</p></div></header>
    <nav class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" href="#/practice/${k}" class="${k === tab ? 'active' : ''}" aria-selected="${k === tab}">${l}</a>`).join('')}</nav>
    <section class="tab-body" data-body></section>`;
  const body = main.querySelector('[data-body]');
  if (tab === 'croquis') return croquis(body);
  if (tab === 'prompt') return prompt(body);
  if (tab === 'calendar') return calendar(body);
  return growth(body);
}

// ---------- croquis ----------
function croquis(body) {
  let files = [];
  let seconds = 60;
  let shuffle = true;
  let session = null;

  const drawSetup = async () => {
    const lib = (await db.all('library')).filter((i) => i.blobId);
    body.innerHTML = `
    <div class="two-col">
      <section class="card">
        <h2>Set up a session</h2>
        <p class="muted">Pick reference images. Each one stays on screen for the time you choose, then the next one appears.</p>
        <div class="dz-line" data-dz>${icon('upload', 18)} Drop, paste or click to add reference images</div>
        <p class="small" data-count>${files.length ? `${files.length} images from your computer` : ''}</p>
        ${lib.length ? `<label class="check-line"><input type="checkbox" data-uselib> Also use ${lib.length} images from your library</label>` : ''}
        <fieldset class="field"><legend>Time per image</legend>
          <div class="seg" role="radiogroup">${[[30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min']].map(([s, l]) => `<button role="radio" aria-checked="${s === seconds}" class="${s === seconds ? 'on' : ''}" data-sec="${s}">${l}</button>`).join('')}</div>
        </fieldset>
        <label class="check-line"><input type="checkbox" data-shuffle ${shuffle ? 'checked' : ''}> Shuffle the order</label>
        <button class="btn btn-primary" data-start>${icon('play', 16)} Start session</button>
      </section>
      <aside class="card lemon-card"><h3>How to croquis</h3><ul>
        <li>Draw the whole pose, not the details.</li><li>Look at the reference more than at the paper.</li><li>Short times force you to see the big shapes.</li></ul></aside>
    </div>`;
    dropzone(body.querySelector('[data-dz]'), {
      onBlob: (b) => { files.push(b); body.querySelector('[data-count]').textContent = `${files.length} images from your computer`; },
    });
    body.querySelectorAll('[data-sec]').forEach((b) => { b.onclick = () => { seconds = +b.dataset.sec; drawSetup(); }; });
    body.querySelector('[data-shuffle]').onchange = (e) => { shuffle = e.target.checked; };
    body.querySelector('[data-start]').onclick = async () => {
      const urls = files.map((f) => URL.createObjectURL(f));
      if (body.querySelector('[data-uselib]')?.checked) for (const i of lib) urls.push(await blobURL(i.blobId, 'full'));
      if (!urls.length) { toast('Add at least one reference image.'); return; }
      if (shuffle) urls.sort(() => Math.random() - 0.5);
      start(urls);
    };
  };

  const start = (urls) => {
    let i = 0;
    let left = seconds;
    let paused = false;
    const t0 = Date.now();
    const ov = document.createElement('div');
    ov.className = 'croquis';
    ov.innerHTML = `
      <div class="croquis-bar">
        <span data-n></span><span class="croquis-time" data-t></span>
        <div class="btn-row">
          <button class="icon-btn" data-pause aria-label="Pause">${icon('pause')}</button>
          <button class="icon-btn" data-skip aria-label="Next image">${icon('skip')}</button>
          <button class="btn btn-sm" data-end>End</button>
        </div>
      </div>
      <div class="croquis-stage"><img alt="Reference" data-img></div>
      <div class="croquis-progress"><span data-p></span></div>`;
    document.body.append(ov);
    const img = ov.querySelector('[data-img]');
    const show = () => {
      img.src = urls[i];
      left = seconds;
      ov.querySelector('[data-n]').textContent = `${i + 1} / ${urls.length}`;
      tick(true);
    };
    const tick = (silent) => {
      ov.querySelector('[data-t]').textContent = fmtTime(left);
      ov.querySelector('[data-p]').style.width = `${100 - (left / seconds) * 100}%`;
      if (!silent && left <= 0) next();
    };
    const next = () => { if (i < urls.length - 1) { i++; show(); } else finish(); };
    const timer = setInterval(() => { if (!paused) { left--; tick(); } }, 1000);
    const end = () => { clearInterval(timer); ov.remove(); document.removeEventListener('keydown', onKey); session = null; };
    const finish = async () => {
      const mins = Math.max(1, Math.round((Date.now() - t0) / 60000));
      const done = i + 1;
      end();
      const r = await modal({
        title: 'Session done',
        body: `<p>${done} drawing${done > 1 ? 's' : ''} in about ${mins} minute${mins > 1 ? 's' : ''}. Nice work.</p>`,
        actions: [{ label: 'Close', value: null }, { label: 'Stamp today', value: 'stamp', primary: true }],
      });
      if (r === 'stamp') { if (await stampToday()) { confetti(); toast('Stamped. See you tomorrow.'); } else toast('Today is already stamped.'); }
    };
    const pauseBtn = ov.querySelector('[data-pause]');
    pauseBtn.onclick = () => {
      paused = !paused;
      pauseBtn.innerHTML = icon(paused ? 'play' : 'pause');
      pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
      ov.classList.toggle('paused', paused);
    };
    ov.querySelector('[data-skip]').onclick = next;
    ov.querySelector('[data-end]').onclick = finish;
    const onKey = (e) => {
      if (e.key === ' ') { e.preventDefault(); pauseBtn.click(); }
      if (e.key === 'ArrowRight') next();
      if (e.key === 'Escape') finish();
    };
    document.addEventListener('keydown', onKey);
    session = { end };
    show();
  };

  drawSetup();
  return () => session?.end();
}

// ---------- prompt ----------
function prompt(body) {
  let timer = null;
  const roll = (a) => a[Math.floor(Math.random() * a.length)];
  let cur = null;
  const draw = async () => {
    const projects = (await db.all('projects')).filter((p) => p.palette?.length);
    if (!cur) cur = { s: roll(PROMPT_SUBJECTS), c: roll(PROMPT_CONSTRAINTS), m: roll(PROMPT_MINUTES), pal: null };
    const pal = cur.pal && projects.find((p) => p.id === cur.pal)?.palette;
    body.innerHTML = `
    <div class="prompt-card">
      <p class="muted">Today, draw</p>
      <p class="prompt-text">${esc(cur.s)}</p>
      <p class="prompt-rule">${pal ? 'Only use this palette' : esc(cur.c[0].toUpperCase() + cur.c.slice(1))}, ${cur.m} minutes.</p>
      ${pal ? `<div class="prompt-pal">${pal.map((c) => `<span style="background:${esc(c.hex)}" title="${esc(c.name)}"></span>`).join('')}</div>` : ''}
      <div class="btn-row center">
        <button class="btn" data-roll>${icon('dice', 16)} New prompt</button>
        <button class="btn btn-primary" data-go>${icon('timer', 16)} Start ${cur.m} min timer</button>
      </div>
      <div class="prompt-timer" data-timer hidden></div>
      ${projects.length ? `<label class="field inline-field"><span>Palette challenge</span><select data-pal><option value="">No palette</option>${projects.map((p) => `<option value="${p.id}" ${cur.pal === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
    </div>`;
    body.querySelector('[data-roll]').onclick = () => { stop(); cur = { ...cur, s: roll(PROMPT_SUBJECTS), c: roll(PROMPT_CONSTRAINTS), m: roll(PROMPT_MINUTES) }; draw(); };
    body.querySelector('[data-pal]')?.addEventListener('change', (e) => { cur.pal = e.target.value || null; draw(); });
    body.querySelector('[data-go]').onclick = () => run(cur.m * 60);
  };
  const stop = () => { clearInterval(timer); timer = null; };
  const run = (total) => {
    stop();
    let left = total;
    let paused = false;
    const box = body.querySelector('[data-timer]');
    box.hidden = false;
    box.innerHTML = `<span class="prompt-time" data-t>${fmtTime(left)}</span>
      <button class="icon-btn" data-p aria-label="Pause">${icon('pause')}</button>
      <button class="btn btn-sm" data-done>I'm done</button>`;
    const pb = box.querySelector('[data-p]');
    pb.onclick = () => { paused = !paused; pb.innerHTML = icon(paused ? 'play' : 'pause'); pb.setAttribute('aria-label', paused ? 'Resume' : 'Pause'); };
    const done = async () => {
      stop();
      box.innerHTML = `<span>Time's up. How did it go?</span><button class="btn btn-sm btn-primary" data-stamp>Stamp today</button>`;
      box.querySelector('[data-stamp]').onclick = async () => {
        if (await stampToday()) { confetti(); toast('Stamped. See you tomorrow.'); } else toast('Today is already stamped.');
      };
    };
    box.querySelector('[data-done]').onclick = done;
    timer = setInterval(() => {
      if (paused) return;
      left--;
      const t = box.querySelector('[data-t]');
      if (t) t.textContent = fmtTime(left);
      if (left <= 0) done();
    }, 1000);
  };
  draw();
  return stop;
}

// ---------- calendar ----------
function calendar(body) {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  const draw = async () => {
    const days = await db.all('days');
    const keys = days.map((d) => d.id);
    const set = new Set(keys);
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const count = new Date(y, m + 1, 0).getDate();
    const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
    const inMonth = keys.filter((k) => k.startsWith(monthKey)).length;
    const today = todayKey();
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push('<span class="cal-cell empty-cell"></span>');
    for (let d = 1; d <= count; d++) {
      const k = `${monthKey}-${String(d).padStart(2, '0')}`;
      const future = k > today;
      cells.push(`<button class="cal-cell ${set.has(k) ? 'stamped' : ''} ${k === today ? 'today' : ''}" data-k="${k}" ${future ? 'disabled' : ''} aria-pressed="${set.has(k)}" aria-label="${fmtDate(k)}${set.has(k) ? ', stamped' : ''}">
        <span class="cal-num">${d}</span>${set.has(k) ? `<span class="stamp" aria-hidden="true">${icon('star', 16)}</span>` : ''}</button>`);
    }
    body.innerHTML = `
    <div class="two-col">
      <section class="card">
        <div class="cal-head">
          <button class="icon-btn" data-prev aria-label="Previous month">${icon('chevronLeft')}</button>
          <h2>${first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
          <button class="icon-btn" data-next aria-label="Next month">${icon('chevronRight')}</button>
        </div>
        <div class="cal-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span class="cal-dow">${d}</span>`).join('')}${cells.join('')}</div>
        <p class="muted small">Tap a day to stamp it, tap again to remove the stamp.</p>
      </section>
      <aside class="side-stack">
        <div class="stat"><span class="stat-num">${streakOf(keys)}</span><span class="muted">day streak</span></div>
        <div class="stat"><span class="stat-num">${inMonth}</span><span class="muted">days this month</span></div>
        <div class="stat"><span class="stat-num">${keys.length}</span><span class="muted">days in total</span></div>
      </aside>
    </div>`;
    body.querySelector('[data-prev]').onclick = () => { m--; if (m < 0) { m = 11; y--; } draw(); };
    body.querySelector('[data-next]').onclick = () => { m++; if (m > 11) { m = 0; y++; } draw(); };
    body.querySelectorAll('[data-k]').forEach((b) => {
      b.onclick = async () => {
        const k = b.dataset.k;
        if (set.has(k)) await db.del('days', k);
        else await db.put('days', { id: k, created: Date.now() });
        draw();
      };
    });
  };
  draw();
}

// ---------- growth ----------
async function growthDialog(subjects) {
  let blobId = null;
  return modal({
    title: 'Add a drawing', wide: true,
    body: `<div class="lib-form">
      <div class="dz-preview tall" data-dz>Drop, paste or click to add your drawing</div>
      <div>
        <label class="field"><span>Subject</span><input name="subject" list="growth-subjects" placeholder="Hands"><datalist id="growth-subjects">${subjects.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>
        <label class="field"><span>Date drawn</span><input type="date" name="date" value="${todayKey()}"></label>
        <label class="field"><span>Note (optional)</span><textarea name="note" rows="2" placeholder="First time trying foreshortening"></textarea></label>
      </div></div>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Save drawing', value: 'save', primary: true }],
    onOpen: (root) => {
      const dz = root.querySelector('[data-dz]');
      dropzone(dz, { multiple: false, onBlob: async (b) => { blobId = await saveImage(b); dz.innerHTML = `<img alt="" data-blob="${blobId}">`; hydrate(dz); } });
    },
    onAction: async (v, root) => {
      if (v !== 'save') return;
      const g = (n) => root.querySelector(`[name="${n}"]`).value.trim();
      if (!blobId) { fieldError(root, 'Add the drawing first.'); return false; }
      if (!g('subject')) { fieldError(root, 'Add a subject, like hands or portraits, so you can compare later.'); return false; }
      await db.put('growth', { id: uid(), subject: g('subject'), date: g('date') || todayKey(), note: g('note'), blobId, created: Date.now() });
      return 'saved';
    },
  });
}

function growth(body) {
  const picked = new Set();
  const draw = async () => {
    const all = (await db.all('growth')).sort((a, b) => a.date.localeCompare(b.date));
    const groups = {};
    all.forEach((g) => { (groups[g.subject] ||= []).push(g); });
    body.innerHTML = `
      <div class="section-head">
        <p class="muted">Draw the same subject again after a few months and put them side by side. Select two drawings to compare.</p>
        <div class="btn-row">
          <button class="btn" data-compare ${picked.size === 2 ? '' : 'disabled'}>${icon('compare', 16)} Compare (${picked.size}/2)</button>
          <button class="btn btn-primary" data-add>${icon('plus', 16)} Add a drawing</button>
        </div>
      </div>
      ${all.length ? Object.entries(groups).map(([s, list]) => `
        <section class="growth-group"><h3>${esc(s)}</h3>
          <div class="growth-row">${list.map((g) => `
            <div class="growth-item ${picked.has(g.id) ? 'on' : ''}">
              <button class="growth-pick" data-id="${g.id}" aria-pressed="${picked.has(g.id)}"><img alt="${esc(s)}, ${fmtDate(g.date)}" data-blob="${g.blobId}"><span class="small">${fmtDate(g.date)}</span></button>
              <button class="icon-btn" data-del="${g.id}" aria-label="Remove">${icon('trash', 14)}</button>
            </div>`).join('')}</div></section>`).join('')
      : emptyState('See how far you\'ve come', 'Save drawings by subject, like hands, faces or cats. In a few months, compare old and new side by side.', '')}`;
    hydrate(body);
    body.querySelector('[data-add]').onclick = async () => { if (await growthDialog(Object.keys(groups))) draw(); };
    body.querySelectorAll('[data-id]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.id;
        if (picked.has(id)) picked.delete(id);
        else { if (picked.size === 2) picked.delete([...picked][0]); picked.add(id); }
        draw();
      };
    });
    body.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmBox('Remove this drawing?', 'It will be removed from your growth collection.', { label: 'Remove' }))) return;
        picked.delete(b.dataset.del);
        await db.del('growth', b.dataset.del);
        draw();
      };
    });
    body.querySelector('[data-compare]').onclick = () => {
      const [a, b] = [...picked].map((id) => all.find((g) => g.id === id)).sort((x, y) => x.date.localeCompare(y.date));
      const months = Math.round((parseKey(b.date) - parseKey(a.date)) / (86400000 * 30.4));
      const gap = months >= 1 ? `${months} month${months > 1 ? 's' : ''} apart` : `${Math.round((parseKey(b.date) - parseKey(a.date)) / 86400000)} days apart`;
      modal({
        title: 'Then and now', wide: true, actions: [],
        body: `<p class="muted center">${gap}</p><div class="compare">
          <figure><img alt="" data-blob="${a.blobId}" data-full><figcaption><strong>${esc(a.subject)}</strong> ${fmtDate(a.date)}${a.note ? `<br><span class="muted small">${esc(a.note)}</span>` : ''}</figcaption></figure>
          <figure><img alt="" data-blob="${b.blobId}" data-full><figcaption><strong>${esc(b.subject)}</strong> ${fmtDate(b.date)}${b.note ? `<br><span class="muted small">${esc(b.note)}</span>` : ''}</figcaption></figure></div>`,
        onOpen: (root) => hydrate(root),
      });
    };
  };
  draw();
}
