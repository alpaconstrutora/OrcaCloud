/**
 * Generates PWA PNG icons from the SVG source.
 * Run: node scripts/generate-icons.mjs
 * Requires: npm install -D sharp (one-time dev dep)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const svgPath = path.join(root, 'public/icons/icon.svg');
const svg = readFileSync(svgPath);

let sharp;
try {
  const require = createRequire(import.meta.url);
  sharp = require('sharp');
} catch {
  console.error('sharp not found. Run: npm install -D sharp');
  process.exit(1);
}

for (const size of SIZES) {
  const outPath = path.join(root, `public/icons/icon-${size}.png`);
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log(`✓ icon-${size}.png`);
}

// Apple touch icon (180x180)
await sharp(svg).resize(180, 180).png().toFile(path.join(root, 'public/apple-touch-icon.png'));
console.log('✓ apple-touch-icon.png');

// Placeholder screenshot (just a blue rect)
const screenshotSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844"><rect width="390" height="844" fill="#f1f5f9"/><text x="195" y="422" font-family="sans-serif" font-size="24" fill="#64748b" text-anchor="middle">OrçaCloud</text></svg>`);
await sharp(screenshotSvg).resize(390, 844).png().toFile(path.join(root, 'public/icons/screenshot-mobile.png'));
console.log('✓ screenshot-mobile.png');

console.log('\nAll icons generated successfully!');
