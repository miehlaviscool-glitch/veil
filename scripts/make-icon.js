// Generates the app/tray icons (dependency-free PNG encoder). Run: node scripts/make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// signed distance to a rounded box centered at (cx,cy) with half-size (hx,hy) and radius r
const sdBox = (x, y, cx, cy, hx, hy, r) => {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function draw(size, { background = true } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 3; // supersampling
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let acc = [0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size; // 0..1
      let col = [0, 0, 0, 0];
      const bg = sdBox(x, y, 0.5, 0.5, 0.5, 0.5, 0.22);
      if (!background || bg < 0) {
        if (background) col = [...mix([88, 101, 242], [160, 80, 230], (x + y) / 2), 255];
        // antenna
        const antenna = sdBox(x, y, 0.5, 0.2, 0.014, 0.05, 0.01) < 0 || sdCircle(x, y, 0.5, 0.15, 0.04) < 0;
        // head
        const head = sdBox(x, y, 0.5, 0.52, 0.28, 0.21, 0.09) < 0;
        // ears
        const ears = sdBox(x, y, 0.2, 0.52, 0.025, 0.08, 0.02) < 0 || sdBox(x, y, 0.8, 0.52, 0.025, 0.08, 0.02) < 0;
        const eyes = sdCircle(x, y, 0.39, 0.5, 0.05) < 0 || sdCircle(x, y, 0.61, 0.5, 0.05) < 0;
        const mouth = sdBox(x, y, 0.5, 0.63, 0.1, 0.014, 0.014) < 0;
        if (antenna || head || ears) col = [255, 255, 255, 255];
        if (eyes || mouth) col = background ? [...mix([88, 101, 242], [160, 80, 230], 0.5), 255] : [0, 0, 0, 0];
        if (!background && !(antenna || head || ears)) col = [0, 0, 0, 0];
      }
      acc = acc.map((v, i) => v + col[i]);
    }
    const o = (py * size + px) * 4;
    acc.forEach((v, i) => (buf[o + i] = Math.round(v / (SS * SS))));
  }
  return encodePng(size, size, buf);
}

const out = path.join(__dirname, '..', 'build');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), draw(512));
fs.writeFileSync(path.join(out, 'tray.png'), draw(32));
// Multi-size .ico (PNG-compressed entries) so electron-builder needs no icon conversion tooling.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((n) => draw(n));
const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = 6 + sizes.length * 16;
const dir = sizes.map((n, i) => {
  const e = Buffer.alloc(16);
  e[0] = n === 256 ? 0 : n; e[1] = n === 256 ? 0 : n; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12); offset += pngs[i].length;
  return e;
});
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([head, ...dir, ...pngs]));
console.log('Icons written to build/');
