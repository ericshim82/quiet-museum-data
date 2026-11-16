// One shard's thumbnails: the works whose number modulo N is K, so no two shards ever ask for the same picture. Two at a time,
// waiting as Wikimedia asks on 429. Stops by itself after LIMIT minutes so the job still has time to fingerprint what it has.
import fs from 'fs'; import crypto from 'crypto';
const [N, K, LIMIT] = [+process.env.N, +process.env.K, +(process.env.LIMIT || 300)];
const UA = { 'User-Agent': 'QuietMuseumIndex/1.0 (https://github.com/ericshim82/quiet-museum-data; shimply.labs at gmail dot com)' };
const th = (n, w) => { n = n.replace(/ /g, '_'); const h = crypto.createHash('md5').update(n).digest('hex'); const e = encodeURIComponent(n); const pre = /\.tiff?$/i.test(n) ? 'lossy-page1-' : /\.(pdf|djvu)$/i.test(n) ? 'page1-' : ''; return 'https://upload.wikimedia.org/wikipedia/commons/thumb/' + h[0] + '/' + h.slice(0, 2) + '/' + e + '/' + pre + w + 'px-' + e + (/\.(tiff?|pdf|djvu)$/i.test(n) ? '.jpg' : /\.webp$/i.test(n) ? '.png' : ''); };
// the last try goes through Commons' own redirect, which knows each file type's thumbnail name (2026-11-14: 91 works never came)
const viaCommons = (n, w) => 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(n.replace(/ /g, '_')) + '?width=' + w;
const sleep = ms => new Promise(s => setTimeout(s, ms));
const todo = fs.readFileSync('works.tsv', 'utf8').trim().split('\n').map(l => l.split('\t')).filter(([id]) => +id.slice(1) % N === K);
fs.mkdirSync('thumbs', { recursive: true });
const t0 = Date.now(); let pause = 0, ok = 0, bad = 0, i = 0;
/* a work still under copyright: its picture comes from the museum's own address (or Wikipedia's), fetched once for the fingerprint
   and never kept. A IIIF address asks for a small size */
async function direct(id, u, hop = 0) {
  u = u.replace(/\/full\/(full|max)\/0\/default\.jpg$/, '/full/400,/0/default.jpg');
  const H = { ...UA, Accept: 'image/avif,image/webp,image/*,text/html;q=0.8,*/*;q=0.5' };
  for (let t = 0; t < 3; t++) {
    let r; try { r = await fetch(u, { headers: H, redirect: 'follow', signal: AbortSignal.timeout(40000) }); } catch (e) { await sleep(2000); continue; }
    if (r.status === 429) { await sleep((+(r.headers.get('retry-after') || 10) + 1) * 1000); continue; }
    if (!r.ok) { await r.arrayBuffer().catch(() => {}); if (r.status >= 500 && t < 2) { await sleep(3000); continue; } console.log(`failed ${id} ${r.status} ${u}`); break; }
    const b = Buffer.from(await r.arrayBuffer());
    const img = b[0] === 0xff && b[1] === 0xd8 || b[0] === 0x89 && b[1] === 0x50 || b.slice(0, 4).toString() === 'RIFF' || b.slice(0, 2).toString() === 'II' || b.slice(0, 2).toString() === 'MM' || b.slice(0, 3).toString() === 'GIF';
    if (img) { if (b.length < 800 || b.length > 40e6) break; fs.writeFileSync(`thumbs/${id}.jpg`, b); ok++; return; }
    /* a page, not a picture: the picture it names for sharing (og:image), once */
    const m = hop === 0 && /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)/i.exec(b.toString('utf8', 0, 300000))
      || hop === 0 && /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i.exec(b.toString('utf8', 0, 300000));
    if (m) { try { return direct(id, new URL(m[1].replace(/&amp;/g, '&'), u).href, 1); } catch (e) {} }
    console.log(`failed ${id} not a picture ${u}`); break;
  }
  bad++;
}
async function one([id, f]) {
  if (/^https?:/.test(f)) return direct(id, f);
  for (let t = 0; t < 4; t++) {
    if (Date.now() < pause) await sleep(pause - Date.now());
    let r; try { r = await fetch(t === 3 ? viaCommons(f, 330) : th(f, t >= 2 ? 250 : 330), { headers: UA, redirect: 'follow' }); } catch (e) { await sleep(2000); continue; }
    if (r.status === 429) { pause = Date.now() + (+(r.headers.get('retry-after') || 10) + 1) * 1000; await r.arrayBuffer().catch(() => {}); continue; }
    if (!r.ok) { if (t === 3) console.log(`failed ${id} ${r.status} ${f}`); await r.arrayBuffer().catch(() => {}); continue; }
    const b = Buffer.from(await r.arrayBuffer()); if (b.length < 800) continue;
    fs.writeFileSync(`thumbs/${id}.jpg`, b); ok++; return;
  }
  bad++;
}
async function worker() { while (i < todo.length && Date.now() - t0 < LIMIT * 60000) { const w = todo[i++]; await one(w); if (i % 250 === 0) console.log(`${i}/${todo.length} tried, ${ok} fetched, ${bad} failed, ${Math.round((Date.now() - t0) / 60000)} min`); } }
await Promise.all([worker(), worker()]);
console.log(`shard ${K}/${N}: ${todo.length} works, ${ok} fetched, ${bad} failed, ${todo.length - i} left for the next run, ${Math.round((Date.now() - t0) / 60000)} min`);
