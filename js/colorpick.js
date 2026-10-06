import { modal, esc, fieldError } from './util.js';
import { cuteName, readableOn, hexToRgb, hexToHsl, hslToHex, rgbToHex } from './color.js';
import { icon } from './icons.js';

// Turns "4450b8", "#4450B8" or "#45b" into "#4450B8". Returns null if it isn't a valid HEX code.
export function normHex(v) {
  let h = String(v || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? '#' + h.toUpperCase() : null;
}

// Reads HEX, RGB or HSL and returns "#RRGGBB", or null.
// Accepts: #F2619C, f2619c, #45b, rgb(242, 97, 156), 242, 97, 156, 242 97 156, hsl(335, 85%, 66%), hsl 335 85 66
export function parseColor(v) {
  const t = String(v || '').trim().toLowerCase();
  const hex = normHex(t);
  if (hex) return hex;
  const nums = (t.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  if (nums.length < 3) return null;
  const [a, b, c] = nums;
  if (t.startsWith('hsl')) {
    if (b > 100 || c > 100 || b < 0 || c < 0) return null;
    return hslToHex(a, b, c);
  }
  if ([a, b, c].some((n) => n < 0 || n > 255)) return null;
  return rgbToHex([a, b, c]);
}
const fmtRgb = (h) => hexToRgb(h).join(', ');
const fmtHsl = (h) => { const [x, y, z] = hexToHsl(h).map(Math.round); return `${x}, ${y}%, ${z}%`; };

// A color picker that starts with a HEX field. Resolves to "#RRGGBB" or null.
export function pickColor({ initial = '#4450B8', swatches = [], title = 'Pick a color' } = {}) {
  let hex = normHex(initial) || '#4450B8';
  const list = [...new Set(swatches.map(normHex).filter(Boolean))].slice(0, 16);
  return modal({
    title,
    body: `
      <div class="cp">
        <div class="cp-preview" data-prev></div>
        <div class="cp-fields">
          <label class="field"><span>HEX, RGB or HSL</span>
            <input class="cp-hex" data-hex value="${esc(hex)}" maxlength="40" spellcheck="false" autocomplete="off" aria-label="Color code"></label>
          <p class="muted small cp-hint">Like #F2619C, 242, 97, 156 or hsl(335, 85%, 66%)</p>
          <dl class="cp-codes"><div><dt>Name</dt><dd data-name></dd></div><div><dt>RGB</dt><dd data-rgb></dd></div><div><dt>HSL</dt><dd data-hsl></dd></div></dl>
          <label class="btn btn-sm color-add">${icon('palette', 14)} Pick visually<input type="color" value="${esc(hex)}" data-native aria-label="Open color picker"></label>
        </div>
      </div>
      ${list.length ? `<div class="field"><span>From this project</span><div class="cp-swatches">${list.map((h) => `<button type="button" class="cp-sw" style="background:${h}" data-sw="${h}" title="${h}" aria-label="${h}"></button>`).join('')}</div></div>` : ''}`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Use color', value: 'ok', primary: true }],
    onOpen: (root) => {
      const input = root.querySelector('[data-hex]');
      const prev = root.querySelector('[data-prev]');
      const name = root.querySelector('[data-name]');
      const native = root.querySelector('[data-native]');
      const show = (h) => {
        prev.style.background = h;
        prev.style.color = readableOn(h);
        prev.textContent = h;
        name.textContent = cuteName(h);
        root.querySelector('[data-rgb]').textContent = fmtRgb(h);
        root.querySelector('[data-hsl]').textContent = fmtHsl(h);
        native.value = h;
      };
      input.addEventListener('input', () => { const h = parseColor(input.value); if (h) { hex = h; show(h); } });
      native.addEventListener('input', () => { hex = native.value.toUpperCase(); input.value = hex; show(hex); });
      root.querySelectorAll('[data-sw]').forEach((b) => { b.onclick = () => { hex = b.dataset.sw; input.value = hex; show(hex); }; });
      show(hex);
      setTimeout(() => { input.focus(); input.select(); }, 0);
    },
    onAction: (v, root) => {
      if (v !== 'ok') return null;
      const h = parseColor(root.querySelector('[data-hex]').value);
      if (!h) { fieldError(root, 'That code wasn\'t recognized. Try #4450B8, 68, 80, 184 or hsl(234, 46%, 49%).'); return false; }
      return h;
    },
  });
}
