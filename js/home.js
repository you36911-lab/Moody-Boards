import { db, hydrate } from './db.js';
import { icon } from './icons.js';
import { settings } from './state.js';
import { newProjectDialog } from './projects.js';
import { stampToday, streakOf } from './practice.js';
import { esc, daysUntil, dueLabel, todayKey, toast, confetti } from './util.js';

const NUDGES = [
  'One small sketch today counts.',
  'Ten focused minutes is plenty.',
  'Start with the easiest step.',
  'Rough is fine. Finished beats perfect.',
];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export async function render(main) {
  const [projects, library, days] = await Promise.all([db.all('projects'), db.all('library'), db.all('days')]);
  const active = projects.filter((p) => p.status !== 'done').sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const soon = active.filter((p) => p.due && daysUntil(p.due) <= 7).sort((a, b) => a.due.localeCompare(b.due));
  const keys = days.map((d) => d.id);
  const stamped = keys.includes(todayKey());
  const streak = streakOf(keys);
  const dayNo = Math.floor(Date.now() / 86400000);
  const insp = library.length ? library[dayNo % library.length] : null;

  main.innerHTML = `
  <header class="page-head home-head">
    <div><p class="muted">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <h1>${greeting()}, ${esc(settings.userName)}</h1></div>
    <button class="btn btn-primary" data-new>${icon('plus', 16)} New project</button>
  </header>

  ${soon.map((p, i) => `<a class="banner" href="#/project/${p.id}/checklist">
    <span class="banner-icon">${icon('calendar', 18)}</span>
    <span><strong>${esc(p.name)}</strong>: ${esc(dueLabel(p.due).toLowerCase())}. <span class="muted">${NUDGES[(dayNo + i) % NUDGES.length]}</span></span>
    ${icon('chevronRight', 16)}</a>`).join('')}

  <div class="home-grid">
    <section class="insp-card ${insp ? '' : 'empty-insp'}">
      <h2>Today's inspiration</h2>
      ${insp ? `<button class="insp-img" data-lib>${insp.blobId ? `<img alt="${esc(insp.title)}" data-blob="${insp.blobId}">` : `<img alt="" src="${esc(insp.url)}" referrerpolicy="no-referrer">`}</button>
        ${insp.title ? `<p><strong>${esc(insp.title)}</strong></p>` : ''}${insp.description ? `<p class="muted small">${esc(insp.description)}</p>` : ''}`
      : '<p>Save designs you love to your library. One of them shows up here each day.</p><a class="btn btn-sm" href="#/library">Open library</a>'}
    </section>

    <section class="card draw-card">
      <h2>Drawing today</h2>
      <div class="stamp-big ${stamped ? 'on' : ''}" aria-hidden="true">${icon('star', 34)}</div>
      <p>${stamped ? 'Stamped. Nice work.' : 'Did you draw today? Even five minutes counts.'}</p>
      <p class="muted small">${streak ? `${streak} day streak` : 'Start a streak today.'}</p>
      <div class="btn-row center">
        ${stamped ? '' : `<button class="btn btn-primary btn-sm" data-stamp>${icon('star', 14)} Stamp today</button>`}
        <a class="btn btn-sm" href="#/practice/prompt">${icon('dice', 14)} Get a prompt</a>
        <a class="btn btn-sm" href="#/practice/croquis">${icon('timer', 14)} Croquis</a>
      </div>
    </section>

    <section class="card recent-card">
      <div class="section-head"><h2>Continue</h2><a class="link" href="#/projects">All projects</a></div>
      ${active.length ? `<ul class="recent">${active.slice(0, 5).map((p) => {
        const total = p.checklist?.length || 0;
        const done = p.checklist?.filter((c) => c.done).length || 0;
        return `<li><a href="#/project/${p.id}/board"><span class="recent-dot" style="background:${esc(p.palette?.[0]?.hex || 'var(--indigo)')}"></span>
          <span class="recent-name">${esc(p.name)}</span><span class="muted small">${total ? `${done}/${total}` : ''}</span></a></li>`;
      }).join('')}</ul>` : `<p class="muted">No projects yet.</p><button class="btn btn-sm" data-new>${icon('plus', 14)} Start one</button>`}
    </section>
  </div>`;
  hydrate(main);
  main.querySelectorAll('[data-new]').forEach((b) => { b.onclick = newProjectDialog; });
  main.querySelector('[data-lib]')?.addEventListener('click', () => { location.hash = '#/library'; });
  main.querySelector('[data-stamp]')?.addEventListener('click', async () => {
    if (await stampToday()) { confetti(); toast('Stamped. See you tomorrow.'); }
    render(main);
  });
}
