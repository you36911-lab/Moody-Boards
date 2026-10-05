import { cleanUnusedImages } from './db.js';
import { loadSettings } from './state.js';
import { registerFileFonts } from './fonts.js';
import { initAutoBackup, autoStatus } from './backup.js';
import { timeAgo, $ } from './util.js';
import * as home from './home.js';
import * as projects from './projects.js';
import * as project from './project.js';
import * as library from './library.js';
import * as study from './study.js';
import * as practice from './practice.js';
import * as portfolio from './portfolio.js';
import * as settingsView from './settings.js';

const routes = {
  home: home.render,
  projects: projects.render,
  project: project.render,
  shelf: projects.renderShelf,
  library: library.render,
  study: study.render,
  practice: practice.render,
  portfolio: portfolio.render,
  settings: settingsView.render,
};
const NAV_OF = { project: 'projects' };

let cleanup = null;
let seq = 0;

async function route() {
  const [name = 'home', ...params] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const view = routes[name] ? name : 'home';
  const mine = ++seq;
  try { cleanup?.(); } catch (e) { console.warn(e); }
  cleanup = null;
  document.querySelectorAll('.modal-back').forEach((m) => m.remove());
  const main = $('#main');
  main.className = 'main';
  main.innerHTML = '';
  const navKey = NAV_OF[view] || view;
  document.querySelectorAll('.sidebar a[data-route]').forEach((a) => {
    const on = a.dataset.route === navKey;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  try {
    const r = await routes[view](main, params.map(decodeURIComponent));
    if (mine !== seq) { if (typeof r === 'function') r(); return; }
    if (typeof r === 'function') cleanup = r;
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="empty"><h2>Something went wrong on this page</h2><p class="muted">${String(e.message || e)}</p><a class="btn" href="#/home">Go home</a></div>`;
  }
  window.scrollTo(0, 0);
}

// small "Saved" signal in the sidebar
let savedTimer;
function flashSaved() {
  const el = $('#save-state');
  el.textContent = 'Saved';
  el.classList.add('on');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove('on'), 1600);
}

async function showBackupState() {
  const el = $('#backup-state');
  const s = await autoStatus();
  if (s.state === 'on') el.innerHTML = `Backed up${s.last ? ' ' + timeAgo(s.last) : ''}`;
  else if (s.state === 'reconnect') el.innerHTML = '<a href="#/settings">Reconnect backup folder</a>';
  else el.innerHTML = '<a href="#/settings">Set up a backup</a>';
}

async function start() {
  await loadSettings();
  registerFileFonts();
  await initAutoBackup();
  window.addEventListener('hashchange', route);
  window.addEventListener('moody:changed', flashSaved);
  window.addEventListener('moody:backup', showBackupState);
  setInterval(showBackupState, 60000);
  showBackupState();
  if (!location.hash) location.replace('#/home');
  route();
  navigator.storage?.persist?.().catch(() => {});
  setTimeout(() => cleanUnusedImages().catch(() => {}), 4000);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker not registered', e));
  }
}

start();
