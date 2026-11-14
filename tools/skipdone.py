# Leaves out of works.tsv every work already fingerprinted in the published emb-all.npz, so a rerun only fetches what is missing.
import os, numpy as np
done = set(map(str, np.load('prev/emb-all.npz')['ids'])) if os.path.exists('prev/emb-all.npz') else set()
rows = open('works.tsv').read().strip().split('\n'); keep = [r for r in rows if r.split('\t')[0] not in done]
open('works.tsv', 'w').write('\n'.join(keep) + '\n')
print(f'{len(rows)} works, {len(done)} already fingerprinted, {len(keep)} to fetch')
