// Every painting with a picture in the app's museums (as the app asks: the collection, or a part of the museum), from Wikidata
// through the QLever mirror (fast and not rate limited). Output: works.tsv  "Q123<TAB>File_name.jpg", one line per work.
import fs from 'fs';
const mus = JSON.parse(fs.readFileSync(new URL('../museums.json', import.meta.url)));
const P = 'PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX wd: <http://www.wikidata.org/entity/> ';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sq(q) {
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch('https://qlever.dev/api/wikidata', { method: 'POST', headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'query=' + encodeURIComponent(P + q) });
      return (await r.json()).results.bindings;
    } catch (e) { console.error('retry', e.message); await sleep(10000 * (t + 1)); }
  }
  throw new Error('qlever failed');
}
const works = new Map();
for (let i = 0; i < mus.length; i += 60) {
  const V = mus.slice(i, i + 60).map(m => 'wd:' + m.q).join(' ');
  const rows = await sq(`SELECT ?w (SAMPLE(?img) AS ?im) WHERE { VALUES ?m { ${V} } { ?w wdt:P195 ?m } UNION { ?w wdt:P195 ?c . ?c wdt:P361 ?m } ?w wdt:P31 wd:Q3305213 ; wdt:P18 ?img } GROUP BY ?w`);
  for (const x of rows) { const id = x.w.value.split('/').pop(); const f = decodeURIComponent(x.im.value.split('/').pop()).replace(/ /g, '_'); if (!works.has(id)) works.set(id, f); }
  console.log(i + 60, 'museums', works.size, 'works');
}
/* paintings still under copyright (2026-11-16, Eric: a photo of "Em Thúy", 1943, in the Vietnam National Museum of Fine Arts, was
   not found on the device): no free picture on Wikidata, but the museum's own picture address (P6500, non-free artwork image URL)
   or the English Wikipedia article's picture. Only the fingerprint is kept, never the picture; the app shows the work from the
   address when someone finds it. The line's second column is then the address itself */
const PS = P + 'PREFIX schema: <http://schema.org/> ';
const titles = new Map();
/* every such painting on Wikidata, not only in the app's museums (2026-11-16, Eric: "다른 곳들의 이런 작품도 다"): about 12,000 */
{
  let rows = [];
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch('https://qlever.dev/api/wikidata', { method: 'POST', headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'query=' + encodeURIComponent(PS + `SELECT ?w (SAMPLE(?t) AS ?title) (SAMPLE(?u) AS ?url) WHERE { ?w wdt:P31 wd:Q3305213 . FILTER NOT EXISTS { ?w wdt:P18 ?x } OPTIONAL { ?w wdt:P6500 ?u } OPTIONAL { ?a schema:about ?w ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?t } FILTER(BOUND(?u) || BOUND(?t)) } GROUP BY ?w`) });
      rows = JSON.parse(await r.text()).results.bindings; break;
    } catch (e) { console.error('retry', e.message); await sleep(15000 * (t + 1)); }
  }
  for (const x of rows) {
    const id = x.w.value.split('/').pop(); if (works.has(id)) continue;
    if (x.url) works.set(id, x.url.value); else if (x.title) titles.set(x.title.value, id);
  }
  console.log('with copyrighted', works.size, 'and', titles.size, 'Wikipedia articles to look up');
}
/* the English Wikipedia article's own picture, 50 articles a request */
const tl = [...titles.keys()];
for (let i = 0; i < tl.length; i += 50) {
  const u = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '400', pilicense: 'any', titles: tl.slice(i, i + 50).join('|'), format: 'json', redirects: '1' });
  try {
    const j = await (await fetch(u, { headers: { 'User-Agent': 'QuietMuseumIndex/1.0 (https://github.com/ericshim82/quiet-museum-data)' } })).json();
    const back = new Map(); ((j.query || {}).redirects || []).concat((j.query || {}).normalized || []).forEach(r => back.set(r.to, r.from));
    Object.values((j.query || {}).pages || {}).forEach(p => { const t = back.get(p.title) || p.title; const id = titles.get(t); if (id && p.thumbnail && !works.has(id)) works.set(id, p.thumbnail.source); });
  } catch (e) { console.error('enwiki', e.message); }
  await sleep(300);
}
fs.writeFileSync('works.tsv', [...works].map(([a, b]) => a + '\t' + b).join('\n') + '\n');
console.log('works', works.size);
