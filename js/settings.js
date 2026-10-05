import { db } from './db.js';
import { icon } from './icons.js';
import { settings, saveSettings } from './state.js';
import { DEFAULTS } from './config.js';
import { esc, toast, confirmBox, timeAgo } from './util.js';
import { exportToFile, importFromFile, autoSupported, autoStatus, chooseFolder, reconnect, disconnect, backupNow } from './backup.js';

export async function render(main) {
  const draw = async () => {
    const custom = await db.all('templates');
    const auto = await autoStatus();
    let usage = '';
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.usage) usage = `${(est.usage / 1048576).toFixed(1)} MB used on this computer`;
    } catch { /* ignore */ }
    const persisted = await navigator.storage?.persisted?.();
    main.innerHTML = `
    <header class="page-head"><div><h1>Settings</h1></div></header>
    <div class="settings">
      <section class="card">
        <h2>Names</h2>
        <div class="field-row">
          <label class="field"><span>App name</span><input data-k="appName" value="${esc(settings.appName)}" placeholder="${esc(DEFAULTS.appName)}"></label>
          <label class="field"><span>Your name</span><input data-k="userName" value="${esc(settings.userName)}"></label>
        </div>
        <label class="field"><span>Tagline</span><input data-k="tagline" value="${esc(settings.tagline)}"></label>
        <p class="muted small">The name of the installed app icon comes from <code>manifest.json</code>. Change it there too if you rename the app.</p>
      </section>

      <section class="card">
        <h2>Appearance</h2>
        <div class="seg" role="radiogroup" aria-label="Theme">${[['auto', 'Match system'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button role="radio" aria-checked="${settings.theme === k}" class="${settings.theme === k ? 'on' : ''}" data-theme="${k}">${l}</button>`).join('')}</div>
      </section>

      <section class="card">
        <h2>Backup</h2>
        <p>Everything is saved in this browser. If the browser data is cleared, it's gone, so keep a backup.</p>
        <div class="btn-row">
          <button class="btn" data-export>${icon('download', 16)} Export everything</button>
          <label class="btn">${icon('upload', 16)} Import a backup<input type="file" accept="application/json,.json" hidden data-import></label>
        </div>
        <h3>Automatic folder backup</h3>
        ${autoSupported() ? `
          <p class="muted small">Choose a folder once and the app saves a backup there after every change. Pick a Google Drive or OneDrive folder and you have a free cloud backup. The last 14 days are kept.</p>
          ${auto.state === 'off' ? `<button class="btn btn-primary" data-choose>${icon('folderOpen', 16)} Choose backup folder</button>` : ''}
          ${auto.state === 'on' ? `<p class="status ok">${icon('check', 16)} Backing up to <strong>${esc(auto.folder)}</strong>${auto.last ? `, last ${timeAgo(auto.last)}` : ''}</p>
            <div class="btn-row"><button class="btn btn-sm" data-now>Back up now</button><button class="btn btn-sm" data-choose>Change folder</button><button class="btn btn-sm btn-ghost" data-off>Turn off</button></div>` : ''}
          ${auto.state === 'reconnect' ? `<p class="status warn">The browser needs permission again to write to <strong>${esc(auto.folder)}</strong>.</p>
            <div class="btn-row"><button class="btn btn-primary btn-sm" data-reconnect>Allow access</button><button class="btn btn-sm btn-ghost" data-off>Turn off</button></div>` : ''}`
        : '<p class="muted small">Automatic folder backup works in Chrome and Edge. In this browser, use Export everything now and then.</p>'}
        <p class="muted small">${usage}${usage && persisted ? '. ' : ''}${persisted ? 'The browser has agreed to keep this data.' : ''}</p>
      </section>

      <section class="card">
        <h2>Your templates</h2>
        ${custom.length ? `<ul class="plain-list">${custom.map((t) => `<li><span><strong>${esc(t.name)}</strong> <span class="muted small">${t.checklist.length} steps</span></span><button class="icon-btn" data-deltmpl="${t.id}" aria-label="Delete ${esc(t.name)}">${icon('trash', 16)}</button></li>`).join('')}</ul>`
        : '<p class="muted small">Save a project\'s checklist as a template from its Checklist tab.</p>'}
      </section>
    </div>`;
    wire();
  };

  const wire = () => {
    main.querySelectorAll('[data-k]').forEach((i) => {
      i.onchange = async () => {
        const v = i.value.trim() || DEFAULTS[i.dataset.k];
        i.value = v;
        await saveSettings({ [i.dataset.k]: v });
        toast('Saved');
      };
    });
    main.querySelectorAll('[data-theme]').forEach((b) => { b.onclick = async () => { await saveSettings({ theme: b.dataset.theme }); draw(); }; });
    main.querySelector('[data-export]').onclick = async () => { toast('Preparing your backup…'); await exportToFile(); };
    main.querySelector('[data-import]').onchange = async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!(await confirmBox('Import this backup?', 'Everything currently in the app will be replaced by the backup.', { label: 'Replace and import' }))) return;
      try {
        await importFromFile(f);
        toast('Backup imported');
        setTimeout(() => location.reload(), 600);
      } catch (err) {
        toast(err.message || 'That file could not be imported.');
      }
    };
    main.querySelectorAll('[data-choose]').forEach((b) => {
      b.onclick = async () => {
        try { await chooseFolder(); toast('Backup folder set'); draw(); }
        catch (err) { if (err.name !== 'AbortError') toast('The folder could not be used. Try another one.'); }
      };
    });
    main.querySelector('[data-now]')?.addEventListener('click', async () => { if (await backupNow()) { toast('Backed up'); draw(); } });
    main.querySelector('[data-reconnect]')?.addEventListener('click', async () => { if (await reconnect()) { toast('Backup is on again'); draw(); } });
    main.querySelector('[data-off]')?.addEventListener('click', async () => { await disconnect(); toast('Automatic backup turned off'); draw(); });
    main.querySelectorAll('[data-deltmpl]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmBox('Delete this template?', 'Projects made with it stay as they are.'))) return;
        await db.del('templates', b.dataset.deltmpl);
        draw();
      };
    });
  };
  draw();
}
