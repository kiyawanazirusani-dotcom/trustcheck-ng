// Generates the PWA icons (PNG) for TrustCheck NG from an SVG.
// Run: `node scripts/gen-icons.mjs`
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const OUT = "public";

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#8b5a2b"/>
  <rect x="112" y="112" width="288" height="288" rx="28" fill="#f5e9d4" stroke="#3a2a1a" stroke-width="10" stroke-dasharray="18 14"/>
  <text x="256" y="302" font-family="Georgia, 'Times New Roman', serif" font-size="150" font-weight="bold" text-anchor="middle" fill="#3a2a1a">TC</text>
</svg>`;

async function gen(size, name) {
  await sharp(Buffer.from(svg(size))).png().toFile(`${OUT}/${name}`);
  console.log(`wrote ${OUT}/${name} (${size}x${size})`);
}

mkdirSync(OUT, { recursive: true });
await gen(512, "icon-512.png");
await gen(192, "icon-192.png");
await gen(180, "apple-icon-180.png");
await sharp(Buffer.from(svg(32))).png().toFile(`${OUT}/favicon-32.png`);
console.log(`wrote ${OUT}/favicon-32.png (32x32)`);
