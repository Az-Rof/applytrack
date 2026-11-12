// Generates the extension icons (16/48/128 px) as PNG files without dependencies.
// Run: node extension/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "icons");
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makeIcon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const radius = size * 0.22;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter type
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      // rounded-rect mask
      const dx = Math.max(radius - x, 0, x - (size - 1 - radius));
      const dy = Math.max(radius - y, 0, y - (size - 1 - radius));
      const inside = dx * dx + dy * dy <= radius * radius;
      const t = y / size;
      if (!inside) {
        raw[i] = raw[i + 1] = raw[i + 2] = raw[i + 3] = 0;
        continue;
      }
      raw[i] = Math.round(47 + (24 - 47) * t); // R
      raw[i + 1] = Math.round(125 + (80 - 125) * t); // G
      raw[i + 2] = Math.round(246 + (176 - 246) * t); // B
      raw[i + 3] = 255;
      // simple white check mark
      const cx = (x + 0.5) / size;
      const cy = (y + 0.5) / size;
      const onStroke =
        (Math.abs(cy - (0.52 + (cx - 0.36) * 1.1)) < 0.07 && cx > 0.3 && cx < 0.48) ||
        (Math.abs(cy - (0.62 - (cx - 0.48) * 1.0)) < 0.075 && cx >= 0.48 && cx < 0.72);
      if (onStroke) {
        raw[i] = raw[i + 1] = raw[i + 2] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(join(outDir, `icon${size}.png`), png);
  console.log(`icon${size}.png written`);
}

[16, 48, 128].forEach(makeIcon);
