const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation for PNG
const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  }
  table[i] = c;
}

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function makePng(width, height, getPixel) {
  const rowBytes = width * 4;
  const raw = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const offset = y * (rowBytes + 1) + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const chunkCrc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(chunkCrc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = makeChunk('IHDR', header);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// Pixel shader for AWRL6844 Radar Icon
function renderRadarIcon(x, y, w, h, isMaskable = false) {
  // Normalize coords to -1..1
  const nx = (x / w) * 2 - 1;
  const ny = (y / h) * 2 - 1;
  const dist = Math.sqrt(nx * nx + ny * ny);

  // Background color: #0f172a (15, 23, 42)
  let r = 15, g = 23, b = 42, a = 255;

  // Outer rounded container if not maskable
  if (!isMaskable) {
    const cornerRadius = 0.35;
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    if (ax > (1 - cornerRadius) && ay > (1 - cornerRadius)) {
      const dx = ax - (1 - cornerRadius);
      const dy = ay - (1 - cornerRadius);
      if (Math.sqrt(dx * dx + dy * dy) > cornerRadius) {
        return [0, 0, 0, 0]; // transparent outside
      }
    }
  }

  // Scale down graphics inside safe-zone for maskable or standard
  const scale = isMaskable ? 1.4 : 1.15;
  const sx = nx * scale;
  const sy = ny * scale;
  const sdist = Math.sqrt(sx * sx + sy * sy);

  // Radar rings at radii: 0.25, 0.5, 0.75, 0.95
  const rings = [0.3, 0.55, 0.8];
  for (const ringR of rings) {
    const ringDist = Math.abs(sdist - ringR);
    if (ringDist < 0.02) {
      const intensity = 1 - (ringDist / 0.02);
      r = Math.min(255, r + Math.floor(14 * intensity));
      g = Math.min(255, g + Math.floor(165 * intensity));
      b = Math.min(255, b + Math.floor(233 * intensity));
    }
  }

  // Radar crosshairs (subtle)
  if (Math.abs(sx) < 0.015 && sdist < 0.85) {
    g = Math.min(255, g + 80);
    b = Math.min(255, b + 150);
  }
  if (Math.abs(sy) < 0.015 && sdist < 0.85) {
    g = Math.min(255, g + 80);
    b = Math.min(255, b + 150);
  }

  // Radar sweep beam (angle in 30..90 degrees)
  const angle = Math.atan2(sy, sx);
  if (angle > 0.3 && angle < 1.4 && sdist < 0.82) {
    const sweepIntensity = Math.pow((angle - 0.3) / 1.1, 2) * 0.45;
    r = Math.min(255, r + Math.floor(6 * sweepIntensity * 255));
    g = Math.min(255, g + Math.floor(182 * sweepIntensity * 255));
    b = Math.min(255, b + Math.floor(212 * sweepIntensity * 255));
  }

  // Chip square in center: |sx| < 0.28 and |sy| < 0.28
  if (Math.abs(sx) < 0.28 && Math.abs(sy) < 0.28) {
    // Chip body: indigo #1e1b4b / #312e81
    r = 30; g = 27; b = 75;
    // Chip border
    if (Math.abs(sx) > 0.25 || Math.abs(sy) > 0.25) {
      r = 99; g = 102; b = 241; // indigo-500
    } else {
      // Antenna lines inside chip (simulating 4T4R MIMO array)
      const pinX = Math.abs(sx);
      if ((Math.abs(pinX - 0.07) < 0.015 || Math.abs(pinX - 0.17) < 0.015) && Math.abs(sy) < 0.2) {
        r = 56; g = 189; b = 248; // sky-400
      }
    }
  }

  // Blip / Radar target detection dots
  const targets = [
    { x: 0.38, y: -0.32, radius: 0.045 },
    { x: -0.42, y: 0.28, radius: 0.04 },
    { x: 0.22, y: 0.55, radius: 0.035 }
  ];

  for (const target of targets) {
    const tdist = Math.sqrt((sx - target.x) ** 2 + (sy - target.y) ** 2);
    if (tdist < target.radius) {
      r = 52; g = 211; b = 153; // emerald-400
    } else if (tdist < target.radius * 2) {
      const glow = 1 - (tdist - target.radius) / target.radius;
      r = Math.min(255, r + Math.floor(52 * glow));
      g = Math.min(255, g + Math.floor(211 * glow));
      b = Math.min(255, b + Math.floor(153 * glow));
    }
  }

  return [r, g, b, a];
}

const publicDir = path.resolve(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Generate PNG 192x192
console.log('Generating pwa-192x192.png...');
const png192 = makePng(192, 192, (x, y, w, h) => renderRadarIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), png192);

// 2. Generate PNG 512x512
console.log('Generating pwa-512x512.png...');
const png512 = makePng(512, 512, (x, y, w, h) => renderRadarIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), png512);

// 3. Generate maskable 512x512
console.log('Generating pwa-maskable-512x512.png...');
const pngMaskable512 = makePng(512, 512, (x, y, w, h) => renderRadarIcon(x, y, w, h, true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pngMaskable512);

// 4. Generate apple-touch-icon.png (180x180)
console.log('Generating apple-touch-icon.png...');
const pngApple = makePng(180, 180, (x, y, w, h) => renderRadarIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), pngApple);

// 5. Generate favicon.ico (using 32x32 PNG inside standard ICO format)
console.log('Generating favicon.ico...');
const png32 = makePng(32, 32, (x, y, w, h) => renderRadarIcon(x, y, w, h, false));
// Create standard 1-image ICO header wrapping PNG
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // ICO type
icoHeader.writeUInt16LE(1, 4); // 1 image

const icoEntry = Buffer.alloc(16);
icoEntry[0] = 32; // width
icoEntry[1] = 32; // height
icoEntry[2] = 0;  // palette colors
icoEntry[3] = 0;  // reserved
icoEntry[4] = 1;  // color planes
icoEntry[5] = 32; // bits per pixel
icoEntry.writeUInt32LE(png32.length, 8); // size of image data
icoEntry.writeUInt32LE(6 + 16, 12);     // offset to image data

fs.writeFileSync(path.join(publicDir, 'favicon.ico'), Buffer.concat([icoHeader, icoEntry, png32]));

// 6. Generate icon.svg
console.log('Generating icon.svg...');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="100" fill="#0f172a" />
  <!-- Radar circles -->
  <circle cx="256" cy="256" r="200" fill="none" stroke="#0ea5e9" stroke-width="3" stroke-opacity="0.25" />
  <circle cx="256" cy="256" r="140" fill="none" stroke="#0ea5e9" stroke-width="3" stroke-opacity="0.35" />
  <circle cx="256" cy="256" r="80" fill="none" stroke="#0ea5e9" stroke-width="3" stroke-opacity="0.5" />
  <!-- Crosshairs -->
  <line x1="256" y1="46" x2="256" y2="466" stroke="#0ea5e9" stroke-width="2" stroke-opacity="0.3" stroke-dasharray="6,6" />
  <line x1="46" y1="256" x2="466" y2="256" stroke="#0ea5e9" stroke-width="2" stroke-opacity="0.3" stroke-dasharray="6,6" />
  <!-- Sweep gradient -->
  <path d="M 256 256 L 416 136 A 200 200 0 0 1 456 256 Z" fill="url(#sweepGrad)" opacity="0.4" />
  <!-- SoC Die in center -->
  <rect x="206" y="206" width="100" height="100" rx="14" fill="#1e1b4b" stroke="#6366f1" stroke-width="4" />
  <rect x="226" y="226" width="60" height="60" rx="6" fill="#0f172a" stroke="#38bdf8" stroke-width="2" />
  <path d="M 238 238 L 274 238 M 238 248 L 274 248 M 238 258 L 274 258 M 238 268 L 274 268" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" />
  <!-- Radar targets / detections -->
  <circle cx="360" cy="170" r="10" fill="#34d399" />
  <circle cx="360" cy="170" r="18" fill="none" stroke="#34d399" stroke-width="2" opacity="0.6" />
  <circle cx="150" cy="320" r="8" fill="#34d399" />
  <circle cx="310" cy="380" r="7" fill="#38bdf8" />
  <defs>
    <radialGradient id="sweepGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.0" />
    </radialGradient>
  </defs>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svg);

console.log('All PWA assets generated successfully!');
