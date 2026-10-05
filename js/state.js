import { db } from './db.js';
import { DEFAULTS } from './config.js';

export const settings = { ...DEFAULTS };

export async function loadSettings() {
  const r = await db.get('meta', 'settings');
  Object.assign(settings, r?.value || {});
  applySettings();
}

export async function saveSettings(patch) {
  Object.assign(settings, patch);
  await db.put('meta', { key: 'settings', value: { ...settings } });
  applySettings();
}

export function applySettings() {
  const name = settings.appName?.trim() || DEFAULTS.appName;
  document.title = name;
  document.querySelectorAll('[data-app-name]').forEach((e) => { e.textContent = name; });
  document.querySelectorAll('[data-app-tagline]').forEach((e) => { e.textContent = settings.tagline || ''; });
  document.documentElement.dataset.theme = settings.theme || 'auto';
}
