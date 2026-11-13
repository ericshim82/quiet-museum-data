# quiet-museum-data

Data files for the **Find a painting** feature of Quiet Museum.

- `index-*.qmfx` (release assets): one fingerprint per painting the app can show, made with the open SSCD copy-detection model
  (facebookresearch/sscd-copy-detection, MIT licence), reduced to 128 numbers and stored at one byte each. No pictures are stored;
  the pictures cannot be rebuilt from these numbers.
- The paintings are public-domain works listed on Wikidata with a picture on Wikimedia Commons.
- The app reads `manifest.json` from its own server, which names the current file here. A new file means new paintings.

How the files are made: see `docs/find-index.md` in the app's repository.
