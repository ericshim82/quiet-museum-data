// Counts the works each source holds, every day on GitHub (2026-11-14, Eric: not on the Mac before each build). Each museum's own count
// from QLever (museums.json "n"), the Wikidata total from their sum, Commons from its search totals and categories, the Met from its
// own search. A count that cannot be had this time keeps the last value, so a slow server never puts a zero in the settings.
// The app and the web read srccounts.json from this repository.
import fs from 'fs';
const UA = { 'User-Agent': 'QuietMuseum/1.0 (counts; https://github.com/ericshim82/quiet-museum-data)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function J(u, h = UA) { for (let t = 0; t < 4; t++) { try { const r = await fetch(u, { headers: h }); const x = await r.text(); await sleep(800); return JSON.parse(x); } catch (e) { await sleep(5000 * (t + 1)); } } return null; }
const mus = JSON.parse(fs.readFileSync('museums.json'));
const rooms = JSON.parse(fs.readFileSync('rooms.json'));
const old = JSON.parse(fs.readFileSync('srccounts.json'));
const out = { ...old };
// each museum's count; a batch QLever cannot answer this time keeps its old numbers
const P = 'PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX wd: <http://www.wikidata.org/entity/> ';
const sq = async q => { const j = await J('https://qlever.dev/api/wikidata?query=' + encodeURIComponent(P + q), { ...UA, Accept: 'application/sparql-results+json' }); return j?.results?.bindings ?? null; };
let changed = 0;
for (let i = 0; i < mus.length; i += 120) {
  const part = mus.slice(i, i + 120), V = part.map(m => 'wd:' + m.q).join(' ');
  const rows = await sq(`SELECT ?m (COUNT(DISTINCT ?w) AS ?n) WHERE { VALUES ?m { ${V} } { ?w wdt:P195 ?m } UNION { ?w wdt:P195 ?c. ?c wdt:P361 ?m } ?w wdt:P31 wd:Q3305213; wdt:P18 ?img } GROUP BY ?m`);
  if (!rows) { console.log('qlever batch', i, 'kept'); continue; }
  const n = {}; for (const x of rows) n[x.m.value.split('/').pop()] = +x.n.value;
  for (const m of part) { const v = n[m.q] || 0; if (v !== m.n) changed++; m.n = v; }
}
fs.writeFileSync('museums.json', JSON.stringify(mus, null, 1));
const wd = mus.reduce((a, m) => a + (m.n || 0), 0); if (wd > 1000) out.wd = wd;
const search = async q => (await J('https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=1&srinfo=totalhits&srsearch=' + encodeURIComponent(q)))?.query?.searchinfo?.totalhits;
const cat = async c => { const j = await J('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=categoryinfo&titles=' + encodeURIComponent('Category:' + c)); return j ? Object.values(j.query.pages)[0].categoryinfo?.files ?? 0 : null; };
const gap = await search('filetype:bitmap incategory:"Google_Art_Project_paintings"'); if (gap > 1000) out.gap = gap;
const met = await J('https://collectionapi.metmuseum.org/public/collection/v1/search?q=painting&hasImages=true&medium=Paintings'); if ((met?.total ?? 0) > 1000) out.met = met.total;
let ph = 0, de = 0, okp = true, okd = true;
for (const r of rooms.photo) { const v = await cat(r.c); if (v == null) okp = false; else ph += v; }
for (const r of rooms.design) { const v = await cat(r.c); if (v == null) okd = false; else de += v; }
if (okp && ph > 1000) out.photo = ph; if (okd && de > 100) out.design = de;
const e = await Promise.all(['Korea', 'China', 'Japan'].map(c => search(`filetype:bitmap deepcat:"Paintings_from_${c}"`)));
if (e.every(x => x > 0)) out.east = e.reduce((a, b) => a + b, 0);
out.at = new Date().toISOString().slice(0, 10);
fs.writeFileSync('srccounts.json', JSON.stringify(out));
console.log('museums changed', changed, JSON.stringify(out));
