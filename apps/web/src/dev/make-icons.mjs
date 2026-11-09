// Dev tool: rasterises the Shiny Cardboard logo into PNG icons using only Node built-ins.
// Usage: node apps/web/src/dev/make-icons.mjs   (outputs to apps/web/public/icons)
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../public/icons/', import.meta.url));
const SAMPLES = 3; // supersampling per axis for antialiasing

const INK_TOP = [21, 26, 36];
const INK_BOTTOM = [8, 10, 15];
const GOLD_TOP = [243, 210, 127];
const GOLD_BOTTOM = [207, 163, 74];
const DIAMOND = [26, 20, 5];

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Signed distance to a rounded rectangle centred at the origin. */
function roundedBox(x, y, halfW, halfH, radius) {
  const qx = Math.abs(x) - (halfW - radius);
  const qy = Math.abs(y) - (halfH - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Colour at normalised point (u, v in 0..1) of the logo, or null for transparent. */
function shade(u, v, { rounded, scale }) {
  if (rounded && roundedBox(u - 0.5, v - 0.5, 0.5, 0.5, 0.22) > 0) return null;
  const base = mix(INK_TOP, INK_BOTTOM, (u + v) / 2);
  // Card tilted 10 degrees about the centre, scaled for the safe zone.
  const angle = (10 * Math.PI) / 180;
  const dx = (u - 0.5) / scale;
  const dy = (v - 0.5) / scale;
  const x = dx * Math.cos(angle) + dy * Math.sin(angle);
  const y = -dx * Math.sin(angle) + dy * Math.cos(angle);
  if (roundedBox(x, y, 0.207, 0.32, 0.078) > 0) return base;
  const gold = mix(GOLD_TOP, GOLD_BOTTOM, Math.min(1, Math.max(0, (x + y) / 0.9 + 0.5)));
  const inDiamond = Math.abs(x) / 0.11 + Math.abs(y + 0.1) / 0.12 < 1;
  return inDiamond ? mix(gold, DIAMOND, 0.82) : gold;
}

function render(size, options) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // filter type: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const c = shade((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size, options);
          if (c) { r += c[0]; g += c[1]; b += c[2]; hits++; }
        }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      const total = SAMPLES * SAMPLES;
      raw[o] = hits ? Math.round(r / hits) : 0;
      raw[o + 1] = hits ? Math.round(g / hits) : 0;
      raw[o + 2] = hits ? Math.round(b / hits) : 0;
      raw[o + 3] = Math.round((hits / total) * 255);
    }
  }
  return raw;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function png(size, options) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(render(size, options), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-192.png', 192, { rounded: true, scale: 1 }],
  ['icon-512.png', 512, { rounded: true, scale: 1 }],
  ['maskable-512.png', 512, { rounded: false, scale: 0.7 }],
  ['apple-touch-icon.png', 180, { rounded: false, scale: 0.85 }],
];
for (const [name, size, options] of targets) {
  writeFileSync(OUT + name, png(size, options));
  console.log(`wrote ${name}`);
}
