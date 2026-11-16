// Bundles src/main.js + data/ into a single self-contained bahrain.html (opens by double-click).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const b64 = (f, mime) => `data:${mime};base64,` + readFileSync(root + 'data/' + f).toString('base64');
const out = await build({ entryPoints: [root + 'src/entry.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020' });
const assets = {
  bounds: JSON.parse(readFileSync(root + 'data/bounds.json', 'utf8')),
  imagery: b64('imagery.jpg', 'image/jpeg'), water: b64('water.png', 'image/png'), height: b64('height.png', 'image/png'),
};
const CITY = { index: ['index.json', 'application/json'], buildings: ['buildings.bin', 'application/octet-stream'], roads: ['roads.bin', 'application/octet-stream'], search: ['search.json', 'application/json'], districts: ['districts.json', 'application/json'], govs: ['govs.json', 'application/json'], places: ['places.json', 'application/json'] };
const page = (city) => readFileSync(root + 'src/page.html', 'utf8')
  + `\n<script>window.__ASSETS__=${JSON.stringify({ ...assets, city })};</script>\n<script>${out.outputFiles[0].text.replace(/<\/script/g, '<\\/script')}</script>\n`;
// published variant: no skeleton, city data fetched from files served next to the page
for (const f of ['buildings', 'roads']) writeFileSync(root + `data/city/${f}.b64.txt`, readFileSync(root + `data/city/${f}.bin`).toString('base64'));
writeFileSync(root + 'bahrain.body.html', page(Object.fromEntries(Object.entries(CITY).map(([k, [f]]) => [k, 'city/' + f.replace('.bin', '.b64.txt')]))));
// local variant: everything inlined so the file opens by double-click
const body = page(Object.fromEntries(Object.entries(CITY).map(([k, [f, m]]) => [k, b64('city/' + f, m)])));
writeFileSync(root + 'bahrain.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n${body}</body>\n</html>\n`);
// hosted variant (Vercel etc.): dist/index.html with every asset as a separate file
const dist = root + 'dist/';
rmSync(dist, { recursive: true, force: true }); mkdirSync(dist + 'city', { recursive: true });
for (const f of ['imagery.jpg', 'water.png', 'height.png']) copyFileSync(root + 'data/' + f, dist + f);
for (const [f] of Object.values(CITY)) copyFileSync(root + 'data/city/' + f, dist + 'city/' + f);
const hosted = readFileSync(root + 'src/page.html', 'utf8')
  + `\n<script>window.__ASSETS__=${JSON.stringify({ bounds: assets.bounds, imagery: 'imagery.jpg', water: 'water.png', height: 'height.png', city: Object.fromEntries(Object.entries(CITY).map(([k, [f]]) => [k, 'city/' + f])) })};</script>\n<script src="app.js"></script>\n`;
writeFileSync(dist + 'app.js', out.outputFiles[0].text);
writeFileSync(dist + 'index.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n${hosted}</body>\n</html>\n`);
console.log('dist/ written');
console.log('bahrain.html', (body.length / 1e6).toFixed(1), 'MB');
