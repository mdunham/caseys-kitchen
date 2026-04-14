/**
 * Regenerate raster icons from icon.svg for PWA (Android), favicon, and Apple touch.
 * Run: npm run gen-icons
 */
const sharp = require('sharp');
const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const base = path.resolve(__dirname, '..');
const svgPath = path.join(base, 'icon.svg');
const themeRed = { r: 237, g: 28, b: 36, alpha: 1 };

function pngFromSvg(size) {
  return sharp(svgPath).resize(size, size).png();
}

(async () => {
  await pngFromSvg(192).toFile(path.join(base, 'icon-192.png'));
  await pngFromSvg(512).toFile(path.join(base, 'icon-512.png'));
  await pngFromSvg(180).toFile(path.join(base, 'apple-touch-icon.png'));

  const inner = 360;
  const fgBuf = await sharp(svgPath).resize(inner, inner).png().toBuffer();
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: themeRed,
    },
  })
    .composite([{ input: fgBuf, gravity: 'center' }])
    .png()
    .toFile(path.join(base, 'icon-maskable-512.png'));

  const sizes = [16, 32, 48];
  const bufs = await Promise.all(sizes.map((s) => pngFromSvg(s).toBuffer()));
  const ico = await pngToIco(bufs);
  const outIco = path.join(base, 'favicon.ico');
  fs.writeFileSync(outIco, ico);

  console.log('Wrote icon-192.png, icon-512.png, apple-touch-icon.png, icon-maskable-512.png, favicon.ico');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
