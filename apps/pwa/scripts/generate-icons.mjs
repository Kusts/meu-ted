/**
 * Gera os PNGs da identidade "Meu Ted" a partir do recorte oficial
 * `public/brand/app-icon-source.png` (região "ÍCONE DO APP" do sheet de
 * identidade — mascote urso M+check sobre quadrado verde arredondado).
 *
 * - icon-192.png / icon-512.png: recorte redimensionado (propósito "any").
 * - icon-maskable-192.png / icon-maskable-512.png: mesma arte a 80%,
 *   centralizada sobre fundo #0B7A5B (zona de segurança ~10% para máscaras).
 * - apple-touch-icon.png + apple-icon.png (180): mesma composição
 *   (iOS não aceita transparência; o recorte já é opaco).
 * - favicon.png (32): recorte direto.
 *
 * NÃO regenerar a partir de public/logo.svg: o SVG é a marca vetorial do
 * cabeçalho/login, não a arte do ícone do app.
 *
 * Uso: `pnpm --filter pwa icons` (requer sharp como devDependency).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const source = join(root, "brand", "app-icon-source.png");

const BRAND_GREEN = "#0B7A5B";

async function maskable(size, file) {
  const bg = await sharp({
    create: { width: size, height: size, channels: 3, background: BRAND_GREEN },
  })
    .png()
    .toBuffer();
  const inner = Math.round(size * 0.8);
  const fg = await sharp(source).resize(inner, inner, { fit: "cover" }).png().toBuffer();
  const offset = Math.round((size - inner) / 2);
  await sharp(bg).composite([{ input: fg, left: offset, top: offset }]).png().toFile(join(root, file));
  console.log(`ok ${file} (${size}x${size}, maskable)`);
}

const jobs = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "apple-icon.png", size: 180 },
  { file: "favicon.png", size: 32 },
];

for (const { file, size } of jobs) {
  await sharp(source).resize(size, size, { fit: "cover" }).png().toFile(join(root, file));
  console.log(`ok ${file} (${size}x${size})`);
}

await maskable(192, "icon-maskable-192.png");
await maskable(512, "icon-maskable-512.png");
