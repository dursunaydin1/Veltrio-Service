#!/usr/bin/env node
/**
 * PWA simgelerini üretir (public/icons): gece mavisi zemin, pirinç halka ve kıvrımlı onay işareti (K-051).
 * Harici görsel kütüphanesi gerektirmez; PNG, Node'un yerleşik zlib'i ile yazılır.
 *   node scripts/make-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
fs.mkdirSync(out, { recursive: true });

const BG = [18, 29, 56];
const WHITE = [255, 255, 255];
const BRASS = [200, 164, 100];

// Logo geometrisi (src/components/layout/Logo.tsx ile aynı, 64 birimlik alan)
const SWOOSH_D =
  "M21.5 31.2 L25.2 30.6 C26.5 30.5 27.6 31.3 28.3 32.6 L30.6 37.6 C34.5 28.8 40 21.8 47.5 16 C40.5 23.5 35.5 31.5 31.8 43.6 C31.3 45.3 29 45.6 28.2 44 Z";
const CHIP_D = "M17.8 22.2 L23.4 22.2 L26.6 28.4 L21.2 28.8 Z";
const RING = { cx: 32, cy: 31.5, r: 25, w: 2.2 };

/** Yalnızca M, L, C, Z içeren yolu çokgene çevirir (eğriler 24 parçaya bölünür). */
function toPolygon(d) {
  const tokens = d.match(/[MLCZ]|-?[\d.]+/g);
  const pts = [];
  let i = 0;
  let cmd = "";
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[MLCZ]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === "Z") continue;
    if (cmd === "M" || cmd === "L") pts.push([num(), num()]);
    else if (cmd === "C") {
      const [x0, y0] = pts[pts.length - 1];
      const c = [num(), num(), num(), num(), num(), num()];
      for (let k = 1; k <= 24; k++) {
        const t = k / 24, u = 1 - t;
        pts.push([
          u * u * u * x0 + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * c[4],
          u * u * u * y0 + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5],
        ]);
      }
    }
  }
  return pts;
}
const SWOOSH = toPolygon(SWOOSH_D);
const CHIP = toPolygon(CHIP_D);

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Logo alanında (0-64) noktanın rengi. */
function colorAt(x, y) {
  if (inPolygon(x, y, SWOOSH)) return WHITE;
  if (inPolygon(x, y, CHIP)) return BRASS;
  if (Math.abs(Math.hypot(x - RING.cx, y - RING.cy) - RING.r) <= RING.w / 2) return BRASS;
  return BG;
}

function render(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  // Maskable güvenli alan: halka (yarıçap 25/64) ortadaki %80'lik dairenin içinde kalır
  const scale = size / 64;
  const SS = 4; // kenar yumuşatma için piksel başına 4x4 örnek
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((x + (sx + 0.5) / SS) / scale, (y + (sy + 0.5) / SS) / scale);
          for (let k = 0; k < 3; k++) sum[k] += c[k];
        }
      }
      for (let k = 0; k < 3; k++) raw[row + 1 + x * 3 + k] = Math.round(sum[k] / (SS * SS));
    }
  }
  return raw;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(render(size), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Tarayıcı sekmesi için vektör simge: küçük boyutta halka çizilmez, onay büyütülür
const rgb = (c) => `rgb(${c.join(",")})`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="15" fill="${rgb(BG)}"/>
<g transform="translate(-6.4 -6.2) scale(1.2)">
<path d="${CHIP_D}" fill="${rgb(BRASS)}"/>
<path d="${SWOOSH_D}" fill="#fff"/>
</g>
</svg>
`;
fs.writeFileSync(path.join(out, "favicon.svg"), svg);
console.log("yazıldı: favicon.svg");

for (const [name, size] of [["icon-192x192.png", 192], ["icon-512x512.png", 512], ["apple-touch-icon.png", 180]]) {
  fs.writeFileSync(path.join(out, name), png(size));
  console.log("yazıldı:", name);
}
