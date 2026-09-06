/**
 * Gera os PNGs da identidade "Meu Ted" a partir de public/logo.svg.
 *
 * - icon-192.png / icon-512.png: fundo full-bleed em gradiente esmeralda
 *   escuro + marca branca centralizada na safe-zone do maskable (~62% do
 *   canvas). Os mesmos arquivos servem aos propósitos "any" e "maskable"
 *   declarados no manifest (fundo opaco = crop seguro em qualquer máscara).
 * - apple-icon.png (180): mesma composição (iOS não aceita transparência).
 * - favicon.png (32): logo.svg direto sobre transparente.
 *
 * Uso: `pnpm --filter pwa icons` (requer sharp como devDependency).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// Marca branca = balão branco + faísca esmeralda (contraste sem depender
// do fundo). A geometria replica public/logo.svg de propósito: o script é
// a fonte do raster, o SVG é a fonte do vetor.

function sparkEmerald() {
  // Faísca em esmeralda sobre o balão branco = contraste sem depender de fundo.
  return `<path d="M32 14 C33.6 20.6 36.4 23.4 43 25 C36.4 26.6 33.6 29.4 32 36 C30.4 29.4 27.6 26.6 21 25 C27.6 23.4 30.4 20.6 32 14 Z" fill="#0E8C5A"/>
  <path d="M45.5 35.5 C46.1 37.7 47.3 38.9 49.5 39.5 C47.3 40.1 46.1 41.3 45.5 43.5 C44.9 41.3 43.7 40.1 41.5 39.5 C43.7 38.9 44.9 37.7 45.5 35.5 Z" fill="#0E8C5A" opacity="0.85"/>`;
}

function appIconSvg(size, markScale = 0.62) {
  const s = 64 * markScale;
  const offset = (64 - s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
  <defs>
    <linearGradient id="meuted-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0E8C5A"/>
      <stop offset="1" stop-color="#0A3A28"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" fill="url(#meuted-bg)"/>
  <g transform="translate(${offset} ${offset}) scale(${s / 64})">
    <rect x="6" y="7" width="52" height="42" rx="14" fill="#FFFFFF"/>
    <path d="M21 46 L19 57 Q18.7 59 20.7 58 L33 50.5 Z" fill="#FFFFFF"/>
    ${sparkEmerald()}
  </g>
</svg>`;
}

const jobs = [
  { file: "icon-192.png", size: 192, svg: appIconSvg(192) },
  { file: "icon-512.png", size: 512, svg: appIconSvg(512) },
  { file: "apple-icon.png", size: 180, svg: appIconSvg(180) },
];

for (const { file, size, svg } of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(root, file));
  console.log(`ok ${file} (${size}x${size})`);
}

await sharp(join(root, "logo.svg")).resize(32, 32).png().toFile(join(root, "favicon.png"));
console.log("ok favicon.png (32x32)");
