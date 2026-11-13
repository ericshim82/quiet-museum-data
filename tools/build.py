# Joins every shard's fingerprints (and those kept from earlier runs in emb/) and writes the index the app downloads, the same
# format as the Mac's build_index.py: "QMFX", 1, n, 128, 512, mean, projection, scale, int8 codes, ids.
import os, glob, json, struct, datetime, numpy as np
got = {}
for p in sorted(glob.glob('prev/*.npz')) + sorted(glob.glob('parts/**/emb.npz', recursive=True)):
    z = np.load(p)
    for i, v in zip(z['ids'], z['E']): got[str(i)] = v
ids = sorted(got, key=lambda s: int(s[1:])); E = np.stack([got[i] for i in ids]).astype(np.float32); n = len(ids)
np.savez_compressed('emb-all.npz', ids=np.array(ids), E=E.astype(np.float16))
rng = np.random.default_rng(0); S = E[rng.choice(n, min(n, 60000), replace=False)]
mu = S.mean(0); _, _, Vt = np.linalg.svd(S - mu, full_matrices=False); P = Vt[:128].T.astype(np.float32)
Y = (E - mu) @ P; Y /= np.linalg.norm(Y, axis=1, keepdims=True)
sc = (np.abs(Y).max(1) / 127).astype(np.float32); C = np.round(Y / sc[:, None]).clip(-127, 127).astype(np.int8)
idn = np.array([int(i[1:]) for i in ids], dtype=np.uint32)
stamp = datetime.datetime.utcnow().strftime('%Y%m%d-%H%M'); name = f'index-{stamp}-{n}.qmfx'
with open(name, 'wb') as f:
    f.write(struct.pack('<5I', 0x58464D51, 1, n, 128, 512)); f.write(mu.astype('<f4').tobytes()); f.write(P.astype('<f4').tobytes())
    f.write(sc.astype('<f4').tobytes()); f.write(C.tobytes()); f.write(idn.astype('<u4').tobytes())
json.dump({'v': 1, 'file': f"https://github.com/ericshim82/quiet-museum-data/releases/download/{os.environ.get('TAG', 'fp')}/{name}", 'bytes': os.path.getsize(name), 'n': n, 'built': stamp}, open('manifest.json', 'w'))
print('wrote', name, n)
