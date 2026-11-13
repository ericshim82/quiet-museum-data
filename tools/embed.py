# Fingerprints for thumbs/*.jpg with SSCD (the same model, resize and GeM as the Mac's build_index.py), saved as emb.npz.
import os, glob, numpy as np, torch, torchvision, warnings
from PIL import Image
warnings.filterwarnings('ignore'); torch.set_num_threads(os.cpu_count())
ts = torch.jit.load('sscd.pt').eval(); sd = ts.state_dict()
r = torchvision.models.resnet50()
bk = [(k, v) for k, v in sd.items() if k.startswith('backbone.') and 'num_batches' not in k]
tk = [(k, v) for k, v in r.state_dict().items() if not k.startswith('fc.') and 'num_batches' not in k]
r.load_state_dict({b: va for (a, va), (b, vb) in zip(bk, tk)}, strict=False)
class S(torch.nn.Module):
    def __init__(s, r, lin): super().__init__(); s.f = torch.nn.Sequential(*list(r.children())[:-2]); s.lin = lin
    def forward(s, x):
        f = s.f(x).clamp(min=1e-6); m = f.amax((2, 3), keepdim=True)
        return torch.nn.functional.normalize(s.lin((f / m).pow(3).mean((2, 3)).pow(1 / 3) * m.flatten(1)), dim=-1)
lin = torch.nn.Linear(2048, 512); lin.weight.data = sd['embeddings.1.weight']; lin.bias.data = sd['embeddings.1.bias']
model = S(r, lin).eval()
MU = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1); SD = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
def load(p):
    try: return np.asarray(Image.open(p).convert('RGB').resize((288, 288), Image.BILINEAR), dtype=np.float32) / 255
    except Exception: return None
fs = sorted(glob.glob('thumbs/*.jpg')); ids, E = [], []
for k in range(0, len(fs), 64):
    arr = [(f, load(f)) for f in fs[k:k + 64]]; arr = [(f, a) for f, a in arr if a is not None]
    if not arr: continue
    x = torch.from_numpy(np.stack([a for _, a in arr])).permute(0, 3, 1, 2)
    with torch.no_grad(): e = model((x - MU) / SD).numpy().astype(np.float32)
    ids += [os.path.basename(f)[:-4] for f, _ in arr]; E.append(e)
np.savez('emb.npz', ids=np.array(ids), E=np.concatenate(E) if E else np.zeros((0, 512), np.float32))
print('fingerprints', len(ids))
