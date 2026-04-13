const sharp = require('sharp');
const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const base = path.resolve(__dirname, '..');
const svgPath = path.join(base, 'icon.svg');
const outPath = path.join(base, 'favicon.ico');

(async () => {
  const sizes = [16, 32, 48];
  const bufs = await Promise.all(
    sizes.map((s) => sharp(svgPath).resize(s, s).png().toBuffer())
  );
  const ico = await pngToIco(bufs);
  fs.writeFileSync(outPath, ico);
  console.log('Wrote', outPath, ico.length, 'bytes');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
