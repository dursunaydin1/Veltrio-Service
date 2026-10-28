#!/usr/bin/env node
/**
 * PWA simgelerini üretir (public/icons): kırmızı zemin üzerinde beyaz dişli ve "V" (K-046).
 * Harici görsel kütüphanesi gerektirmez; PNG, Node'un yerleşik zlib'i ile yazılır.
 *   node scripts/make-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
fs.mkdirSync(out, { recursive: true });

const BG = [220, 38, 38];
const FG = [255, 255, 255];

// Logo geometrisi (src/components/layout/Logo.tsx ile aynı, 48 birimlik alan):
// 8 dişli dişli + ortada delik + içinde "V".
const GEAR = [];
for (let i = 0; i < 8; i++) {
  for (const [d, r] of [[-15, 15.6], [-9.5, 19.6], [9.5, 19.6], [15, 15.6]]) {
    const t = ((i * 45 + d - 90) * Math.PI) / 180;
    GEAR.push([24 + r * Math.cos(t), 24 + r * Math.sin(t)]);
  }
}
// Onay işareti biçiminde "V"
const V = [[16.8, 23.6], [22.2, 29.6], [31, 18]];

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** Logo alanında (0-48) nokta beyaz mı? */
function onMark(x, y) {
  const r = Math.hypot(x - 24, y - 24);
  if (r > 12 && inPolygon(x, y, GEAR)) return true;
  return distToSegment(x, y, V[0], V[1]) <= 2 || distToSegment(x, y, V[1], V[2]) <= 2;
}

function render(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  // Maskable güvenli alan: işaret ortadaki ~%64'e sığar
  const scale = (size * 0.64) / 48;
  const offset = (size - 48 * scale) / 2;
  const SS = 4; // kenar yumuşatma için piksel başına 4x4 örnek
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const lx = (x + (sx + 0.5) / SS - offset) / scale;
          const ly = (y + (sy + 0.5) / SS - offset) / scale;
          if (onMark(lx, ly)) hits++;
        }
      }
      const a = hits / (SS * SS);
      for (let k = 0; k < 3; k++) raw[row + 1 + x * 3 + k] = Math.round(BG[k] * (1 - a) + FG[k] * a);
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

// Tarayıcı sekmesi için vektör simge (her boyutta net)
const gearPath = "M" + GEAR.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L") + " Z";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
<rect width="48" height="48" rx="11" fill="rgb(${BG.join(",")})"/>
<g transform="translate(4.8 4.8) scale(0.8)" fill="none">
<path d="${gearPath} M36 24 A12 12 0 1 0 12 24 A12 12 0 1 0 36 24 Z" fill="#fff" fill-rule="evenodd"/>
<path d="M${V.map((p) => p.join(" ")).join(" L")}" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</g>
</svg>
`;
fs.writeFileSync(path.join(out, "favicon.svg"), svg);
console.log("yazıldı: favicon.svg");

for (const [name, size] of [["icon-192x192.png", 192], ["icon-512x512.png", 512], ["apple-touch-icon.png", 180]]) {
  fs.writeFileSync(path.join(out, name), png(size));
  console.log("yazıldı:", name);
}
