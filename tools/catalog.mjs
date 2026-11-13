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
fs.writeFileSync('works.tsv', [...works].map(([a, b]) => a + '\t' + b).join('\n') + '\n');
console.log('works', works.size);
