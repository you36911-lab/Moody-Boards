export const hexToRgb = (hex) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
export function contrastVerdict(ratio) {
  if (ratio >= 7) return { label: 'Very easy to read', level: 'great' };
  if (ratio >= 4.5) return { label: 'Easy to read', level: 'good' };
  if (ratio >= 3) return { label: 'Fine for big text only', level: 'ok' };
  return { label: 'Hard to read', level: 'bad' };
}
export const readableOn = (hex) => (luminance(hex) > 0.45 ? '#2B2724' : '#FFFFFF');

// Weighted RGB distance, close enough to how we see color differences.
export function dist(a, b) {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

const NAMES = [
  ['Cotton Candy', '#F7C6D9'], ['Strawberry Milk', '#F4A6B8'], ['Rose Petal', '#E88AA0'], ['Raspberry Jam', '#B5375A'],
  ['Cherry Pop', '#D7263D'], ['Tomato Soup', '#E2533B'], ['Coral Reef', '#F07C66'], ['Peach Fuzz', '#FFBE98'],
  ['Apricot Glow', '#F5A25D'], ['Pumpkin Spice', '#D9772B'], ['Terracotta Pot', '#B4532E'], ['Honey Drop', '#E8B04B'],
  ['Lemon Sorbet', '#FFF1A6'], ['Butter Toast', '#F6DE8D'], ['Mustard Seed', '#C9A227'], ['Olive Branch', '#7A7F3A'],
  ['Matcha Latte', '#A8C686'], ['Mint Leaf', '#8FD3B0'], ['Seafoam', '#B5EAD7'], ['Sage Tea', '#9CAF88'],
  ['Forest Moss', '#4E6E4A'], ['Pine Needle', '#2F4F3E'], ['Sea Glass', '#A3D9D0'], ['Lagoon', '#3BA3A6'],
  ['Teal Ink', '#1F6F78'], ['Sky Wash', '#BFE0F5'], ['Cornflower', '#6C9BD2'], ['Denim Days', '#3E5F8A'],
  ['Indigo Night', '#4450B8'], ['Midnight Ink', '#1E2350'], ['Lavender Haze', '#C9B8E8'], ['Lilac Dream', '#B39DDB'],
  ['Grape Soda', '#7B4BA3'], ['Plum Jam', '#6E3B6E'], ['Mauve Mood', '#A77B97'], ['Bubblegum', '#F48FB1'],
  ['Cocoa Bean', '#5A3B2E'], ['Cinnamon Roll', '#A0613F'], ['Caramel Drizzle', '#C68E5A'], ['Latte Foam', '#E3CDB3'],
  ['Oat Milk', '#EFE6D8'], ['Paper White', '#FAF8F5'], ['Cloud Puff', '#F2F2F2'], ['Pebble Gray', '#B9B5AE'],
  ['Rainy Day', '#8D949C'], ['Slate Stone', '#59606B'], ['Charcoal Sketch', '#2E2E33'], ['Ink Black', '#121212'],
].map(([n, h]) => [n, hexToRgb(h)]);

export function cuteName(hex) {
  const c = hexToRgb(hex);
  let best = NAMES[0], bd = Infinity;
  for (const n of NAMES) {
    const d = dist(c, n[1]);
    if (d < bd) { bd = d; best = n; }
  }
  return best[0];
}

async function samplePixels(blob, max = 72) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s));
  const h = Math.max(1, Math.round(bmp.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const d = ctx.getImageData(0, 0, w, h).data;
  const px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 127) px.push([d[i], d[i + 1], d[i + 2]]);
  return px;
}

function kmeans(px, k, iter = 12) {
  if (!px.length) return [];
  k = Math.min(k, px.length);
  // farthest-first start, beginning from the average color
  const mean = [0, 1, 2].map((j) => px.reduce((s, p) => s + p[j], 0) / px.length);
  let centers = [px.reduce((b, p) => (dist(p, mean) < dist(b, mean) ? p : b), px[0])];
  while (centers.length < k) {
    let far = px[0], fd = -1;
    for (const p of px) {
      const d = Math.min(...centers.map((c) => dist(p, c)));
      if (d > fd) { fd = d; far = p; }
    }
    centers.push(far);
  }
  let groups = [];
  for (let it = 0; it < iter; it++) {
    groups = centers.map(() => []);
    for (const p of px) {
      let bi = 0, bd = Infinity;
      centers.forEach((c, i) => { const d = dist(p, c); if (d < bd) { bd = d; bi = i; } });
      groups[bi].push(p);
    }
    centers = groups.map((g, i) => (g.length ? [0, 1, 2].map((j) => g.reduce((s, p) => s + p[j], 0) / g.length) : centers[i]));
  }
  return centers.map((c, i) => ({ rgb: c, count: groups[i].length })).filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
}

// Returns [{hex, name}] for the main colors across one or more images.
export async function extractPalette(blobs, k = 5) {
  let px = [];
  for (const b of blobs) {
    try { px = px.concat(await samplePixels(b)); } catch { /* skip unreadable image */ }
  }
  if (px.length > 24000) {
    const step = Math.ceil(px.length / 24000);
    px = px.filter((_, i) => i % step === 0);
  }
  const clusters = kmeans(px, k + 2);
  const picked = [];
  for (const c of clusters) {
    if (picked.every((p) => dist(p.rgb, c.rgb) > 40)) picked.push(c);
    if (picked.length === k) break;
  }
  return picked.map((c) => {
    const hex = rgbToHex(c.rgb);
    return { hex, name: cuteName(hex) };
  });
}

// ---------- HSL & harmonies (pure math, no AI needed) ----------
export function hexToHsl(hex) {
  let [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

export const HARMONIES = [
  ['analogous', 'Neighbors (analogous)'],
  ['complementary', 'Opposites (complementary)'],
  ['triadic', 'Three-way (triadic)'],
  ['split', 'Split opposites'],
  ['mono', 'One color, many shades'],
];

export function harmony(baseHex, mode) {
  const [h, s, l] = hexToHsl(baseHex);
  const L = (v) => Math.max(8, Math.min(94, v));
  let out;
  switch (mode) {
    case 'complementary': out = [[h, s, L(l - 22)], [h, s, l], [h, s * 0.5, L(l + 30)], [h + 180, s, l], [h + 180, s * 0.8, L(l - 18)]]; break;
    case 'triadic': out = [[h, s, l], [h + 120, s, l], [h + 240, s, l], [h, s * 0.35, L(92)], [h, s * 0.6, L(18)]]; break;
    case 'split': out = [[h, s, l], [h + 150, s, l], [h + 210, s, l], [h, s * 0.3, L(93)], [h + 180, s * 0.5, L(20)]]; break;
    case 'mono': out = [[h, s, 18], [h, s, 34], [h, s, 50], [h, s * 0.85, 70], [h, s * 0.6, 89]]; break;
    default: out = [[h - 30, s, l], [h - 15, s, l], [h, s, l], [h + 15, s, l], [h + 30, s, l]];
  }
  return out.map(([a, b, c]) => { const hex = hslToHex(a, b, c); return { hex, name: cuteName(hex) }; });
}

// ---------- rule-based palette check per purpose ----------
export function paletteChecks(purpose, palette) {
  const hexes = palette.map((c) => c.hex);
  const out = [];
  if (!hexes.length) return out;
  const lums = hexes.map(luminance);
  let best = 0;
  for (const a of hexes) for (const b of hexes) best = Math.max(best, contrast(a, b));
  const spread = Math.max(...lums) - Math.min(...lums);
  const hasDark = lums.some((x) => x < 0.12);
  const n = hexes.length;
  const good = (text) => out.push({ ok: true, text });
  const hint = (text) => out.push({ ok: false, text });
  if (purpose === 'logo') {
    n <= 3 ? good(`${n} color${n > 1 ? 's' : ''}. Simple enough for a logo.`) : hint('Logos usually work best with 2 or 3 colors.');
    hasDark ? good('Has a dark color, so a one-color version will work.') : hint('Add a dark color so the logo also works in a single color.');
    best >= 4.5 ? good('Strong contrast between your colors.') : hint('Your colors are close in contrast. The logo may blur at small sizes.');
  } else if (purpose === 'ui') {
    best >= 4.5 ? good(`At least one text and background pair is easy to read (${best.toFixed(1)} : 1).`) : hint('No pair reaches 4.5 : 1. Add a darker text color or a lighter background.');
    n >= 3 ? good('Enough colors for background, text and an action color.') : hint('You need at least a background, a text color and an action color.');
    n > 6 && hint('More than 6 colors can make an interface feel busy.');
  } else if (purpose === 'poster') {
    best >= 7 ? good('High contrast. Headlines will pop.') : hint('Add a much darker or lighter color so the headline stands out from far away.');
    n <= 5 ? good('Focused palette.') : hint('Posters read faster with fewer colors.');
  } else {
    spread >= 0.4 ? good('Good range from light to dark, which gives depth.') : hint('The colors are close in lightness. Add a darker or lighter one for depth.');
    n >= 4 ? good(`${n} colors, enough to work with.`) : hint('Illustrations usually need 4 to 6 colors.');
  }
  return out;
}
