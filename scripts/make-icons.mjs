#!/usr/bin/env node
/**
 * PWA simgelerini üretir (public/icons): koyu zemin üzerinde turuncu "V" işareti.
 * Harici görsel kütüphanesi gerektirmez; PNG, Node'un yerleşik zlib'i ile yazılır.
 *   node scripts/make-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
fs.mkdirSync(out, { recursive: true });

const BG = [28, 28, 30];
const FG = [245, 124, 0];

/** Noktanın üçgen içinde olup olmadığı (işaret çizimi için). */
function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = d(px, py, ax, ay, bx, by);
  const d2 = d(px, py, bx, by, cx, cy);
  const d3 = d(px, py, cx, cy, ax, ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function render(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const u = size / 100;
  // "V": iki eğik kol (maskable güvenli alan: orta %60)
  const arms = [
    [[22 * u, 24 * u], [37 * u, 24 * u], [50 * u, 62 * u]],
    [[22 * u, 24 * u], [50 * u, 62 * u], [42 * u, 76 * u]],
    [[78 * u, 24 * u], [63 * u, 24 * u], [50 * u, 62 * u]],
    [[78 * u, 24 * u], [50 * u, 62 * u], [58 * u, 76 * u]],
  ];
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const on = arms.some((t) => inTriangle(x + 0.5, y + 0.5, t[0], t[1], t[2]));
      const c = on ? FG : BG;
      raw[row + 1 + x * 3] = c[0];
      raw[row + 2 + x * 3] = c[1];
      raw[row + 3 + x * 3] = c[2];
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

for (const [name, size] of [["icon-192x192.png", 192], ["icon-512x512.png", 512], ["apple-touch-icon.png", 180]]) {
  fs.writeFileSync(path.join(out, name), png(size));
  console.log("yazıldı:", name);
}
