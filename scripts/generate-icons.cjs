const fs = require("fs/promises");
const path = require("path");

const sharp = require("sharp");
const toIco = require("to-ico");

const rootDir = path.resolve(__dirname, "..");
const sourcePath = path.join(rootDir, "apple-touch-icon.png");
const publicDir = path.join(rootDir, "public");

const pngTargets = [
  { file: "favicon-16x16.png", size: 16 },
  { file: "favicon-32x32.png", size: 32 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "android-chrome-192x192.png", size: 192 },
  { file: "android-chrome-512x512.png", size: 512 },
  { file: "icon.png", size: 512 }
];

async function ensurePublicDir() {
  await fs.mkdir(publicDir, { recursive: true });
}

async function generatePng({ file, size }) {
  const outputPath = path.join(publicDir, file);

  await sharp(sourcePath)
    .resize(size, size, {
      fit: "cover",
      position: "centre"
    })
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(outputPath);

  return outputPath;
}

async function generateIco() {
  const buffers = await Promise.all(
    [16, 32, 48].map((size) =>
      sharp(sourcePath)
        .resize(size, size, {
          fit: "cover",
          position: "centre"
        })
        .png()
        .toBuffer()
    )
  );

  const icoBuffer = await toIco(buffers);
  await fs.writeFile(path.join(publicDir, "favicon.ico"), icoBuffer);
}

async function main() {
  await ensurePublicDir();
  await Promise.all(pngTargets.map(generatePng));
  await generateIco();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});