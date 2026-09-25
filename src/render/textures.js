import * as THREE from 'three';
import { mulberry32, fbm } from '../utils/noise.js';

// Every texture in the game is painted procedurally on a canvas at load time:
// no external assets, and every blob gets the soft, uneven edge of watercolour.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// Puffy Ghibli cumulus: stacked circles, sunlit cream tops, periwinkle bellies.
export function cloudTexture(seed = 1, palette = {}) {
  const { light = '#fffaf0', mid = '#f3ecf2', shadow = '#9fb3d9', rim = '#ffffff' } = palette;
  return cached(`cloud${seed}${light}${shadow}`, () => {
    const W = 512, H = 320;
    const [c, g] = canvas(W, H);
    const r = mulberry32(seed * 977);
    const blobs = [];
    const n = 18 + Math.floor(r() * 10);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = W * (0.14 + 0.72 * t + (r() - 0.5) * 0.1);
      const hump = Math.sin(t * Math.PI);
      const rad = 34 + hump * 80 * (0.55 + r() * 0.6);
      const y = H * 0.8 - rad * (0.5 + hump * 0.6) - r() * 20;
      blobs.push({ x, y, rad });
    }
    // extra little puffs on top
    for (let i = 0; i < 8; i++) {
      const b = blobs[Math.floor(r() * blobs.length)];
      blobs.push({ x: b.x + (r() - 0.5) * b.rad, y: b.y - b.rad * 0.6, rad: b.rad * (0.4 + r() * 0.3) });
    }
    // shadow pass
    for (const b of blobs) {
      const gr = g.createRadialGradient(b.x, b.y + b.rad * 0.35, b.rad * 0.1, b.x, b.y + b.rad * 0.2, b.rad * 1.05);
      gr.addColorStop(0, shadow); gr.addColorStop(0.85, shadow); gr.addColorStop(1, 'rgba(159,179,217,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, b.rad, 0, Math.PI * 2); g.fill();
    }
    // lit pass, offset up-left like afternoon sun
    for (const b of blobs) {
      const gr = g.createRadialGradient(b.x - b.rad * 0.3, b.y - b.rad * 0.45, b.rad * 0.05, b.x - b.rad * 0.15, b.y - b.rad * 0.2, b.rad * 0.95);
      gr.addColorStop(0, rim); gr.addColorStop(0.35, light); gr.addColorStop(0.75, mid); gr.addColorStop(1, 'rgba(243,236,242,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(b.x - b.rad * 0.08, b.y - b.rad * 0.12, b.rad * 0.9, 0, Math.PI * 2); g.fill();
    }
    // flatten base + fade bottom like distant haze
    const fadeG = g.createLinearGradient(0, H * 0.62, 0, H * 0.84);
    fadeG.addColorStop(0, 'rgba(0,0,0,0)'); fadeG.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = fadeG; g.fillRect(0, H * 0.62, W, H);
    // speckled watercolour granulation
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.25})`;
      g.fillRect(r() * W, r() * H, 2, 2);
    }
    g.globalCompositeOperation = 'source-over';
    return tex(c);
  });
}

export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  return cached(`glow${inner}${outer}${size}`, () => {
    const [c, g] = canvas(size, size);
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, inner); gr.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)')); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return tex(c);
  });
}

export function sparkleTexture() {
  return cached('sparkle', () => {
    const S = 128;
    const [c, g] = canvas(S, S);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,250,230,0.8)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(S / 2, 4); g.quadraticCurveTo(S / 2, S / 2, S - 4, S / 2); g.quadraticCurveTo(S / 2, S / 2, S / 2, S - 4);
    g.quadraticCurveTo(S / 2, S / 2, 4, S / 2); g.quadraticCurveTo(S / 2, S / 2, S / 2, 4); g.fill();
    return tex(c);
  });
}

// Painted equirectangular planet, loosely like the watercolour Earth reference:
// turquoise seas, ochre/green continents, swirling cloud bands.
export function planetTexture(seed, pal) {
  return cached(`planet${seed}${pal.sea}`, () => {
    const W = 1024, H = 512;
    const [c, g] = canvas(W, H);
    const img = g.createImageData(W, H);
    const col = (hex) => new THREE.Color(hex);
    const sea = col(pal.sea), deep = col(pal.deep), land = col(pal.land), land2 = col(pal.land2), sand = col(pal.sand || '#e8d49a');
    const cloud = col('#ffffff');
    const tmp = new THREE.Color();
    for (let y = 0; y < H; y++) {
      const lat = y / H;
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const nx = Math.cos(u * Math.PI * 2) * 2.2, nz = Math.sin(u * Math.PI * 2) * 2.2;
        const e = fbm(nx + seed * 3.1 + lat * 5.1, nz + lat * 4.3, 5);
        const e2 = fbm(nx * 2.2 + 9, nz * 2.2 + lat * 8, 3);
        if (e > pal.level) {
          tmp.copy(land).lerp(land2, Math.min(1, (e - pal.level) * 5 + e2 * 0.4));
          if (e < pal.level + 0.02) tmp.lerp(sand, 0.6);
        } else {
          tmp.copy(deep).lerp(sea, Math.min(1, (e / pal.level) * 1.25 + e2 * 0.2));
        }
        // cloud swirls
        const cl = fbm(nx * 1.6 + lat * 9 + e2 * 2.5, nz * 1.6 + 40, 5);
        const cw = Math.max(0, (cl - 0.52) * 3.2);
        tmp.lerp(cloud, Math.min(0.92, cw));
        // polar caps
        const pole = Math.max(0, Math.abs(lat - 0.5) * 2 - 0.82) * 6;
        tmp.lerp(cloud, Math.min(1, pole));
        const i = (y * W + x) * 4;
        img.data[i] = tmp.r * 255; img.data[i + 1] = tmp.g * 255; img.data[i + 2] = tmp.b * 255; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // brush dabs for painterly texture
    const r = mulberry32(seed * 31);
    for (let i = 0; i < 1400; i++) {
      const x = r() * W, y = r() * H;
      g.fillStyle = `rgba(255,255,255,${r() * 0.12})`;
      g.beginPath(); g.ellipse(x, y, 2 + r() * 7, 1 + r() * 2.5, r() * 0.6 - 0.3, 0, Math.PI * 2); g.fill();
    }
    return tex(c);
  });
}

export function nebulaTexture(seed, colors) {
  return cached(`neb${seed}${colors.join()}`, () => {
    const S = 512;
    const [c, g] = canvas(S, S);
    const r = mulberry32(seed);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * S * 0.33;
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.6;
      const rad = 30 + r() * 110;
      const colr = colors[Math.floor(r() * colors.length)];
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, colr.replace('ALPHA', (0.06 + r() * 0.1).toFixed(2)));
      gr.addColorStop(1, colr.replace('ALPHA', '0'));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    // fade edges
    g.globalCompositeOperation = 'destination-in';
    const fg = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S / 2);
    fg.addColorStop(0, 'rgba(0,0,0,1)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fg; g.fillRect(0, 0, S, S);
    return tex(c);
  });
}

// Accretion-disk / cosmic-ring strip: bright core band with painted streaks.
export function streakTexture(seed, core = [255, 236, 190], edge = [242, 112, 60]) {
  return cached(`streak${seed}${core}${edge}`, () => {
    const W = 1024, H = 128;
    const [c, g] = canvas(W, H);
    const r = mulberry32(seed);
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1);
      const band = Math.pow(Math.sin(v * Math.PI), 1.6);
      for (let x = 0; x < W; x++) {
        const n = fbm(x / 60, y / 6 + seed, 4);
        const s = band * (0.45 + 0.9 * n);
        const k = Math.min(1, Math.pow(band, 3) * 1.3);
        const i = (y * W + x) * 4;
        img.data[i] = edge[0] + (core[0] - edge[0]) * k;
        img.data[i + 1] = edge[1] + (core[1] - edge[1]) * k;
        img.data[i + 2] = edge[2] + (core[2] - edge[2]) * k;
        img.data[i + 3] = Math.min(255, s * 255);
      }
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = `rgba(255,248,225,${r() * 0.35})`;
      g.lineWidth = r() * 2 + 0.5;
      const y = H * (0.2 + r() * 0.6), x = r() * W;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + r() * 140, y + (r() - 0.5) * 3); g.stroke();
    }
    const t = tex(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}

export function crackTexture() {
  return cached('crack', () => {
    const S = 512;
    const [c, g] = canvas(S, S);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
    const r = mulberry32(7);
    g.strokeStyle = 'rgba(70,50,60,0.3)';
    for (let i = 0; i < 140; i++) {
      let x = r() * S, y = r() * S;
      g.lineWidth = 0.6 + r() * 1.8;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

export function glyphTexture(seed = 1, color = '#9ff4ff') {
  return cached(`glyph${seed}${color}`, () => {
    const W = 256, H = 256;
    const [c, g] = canvas(W, H);
    const r = mulberry32(seed);
    g.fillStyle = 'rgba(120,220,255,0.10)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2;
    g.strokeRect(6, 6, W - 12, H - 12);
    for (let row = 0; row < 9; row++) {
      let x = 20;
      while (x < W - 30) {
        const w = 6 + r() * 26;
        g.globalAlpha = 0.4 + r() * 0.6;
        g.fillRect(x, 26 + row * 24, w, 5);
        x += w + 6;
      }
    }
    g.globalAlpha = 1;
    g.beginPath(); g.arc(W * 0.75, H * 0.72, 30, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(W * 0.75, H * 0.72, 18, 0, Math.PI * 1.4); g.stroke();
    return tex(c);
  });
}

export function textSprite(text, { color = '#fff7ea', font = '600 44px "Zen Maru Gothic", sans-serif', scale = 1 } = {}) {
  const [c, g] = canvas(1024, 128);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(40,20,60,0.6)'; g.shadowBlur = 12;
  g.fillStyle = color; g.fillText(text, 512, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(c), transparent: true, depthWrite: false, fog: false }));
  s.scale.set(8 * scale, 1 * scale, 1);
  return s;
}
