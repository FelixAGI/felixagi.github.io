# FelixQR

FelixQR turns an ordinary, camera-readable QR scan into a deterministic,
random-access FelixFS volume. The working sample includes a seekable 1 TiB file
and a `2^98`-byte geometric address space. Standard camera apps open the HTTPS
link; FelixFS performs the geometric decoding and presents the result as a
read-only drive.

Live site: `https://felixagi.github.io/`

Created by [FelixAGI](https://github.com/FelixAGI). Please cite the original
project using [CITATION.cff](CITATION.cff) when you build on it.

[Support FelixQR](https://ko-fi.com/rammibean)

The exact-image demonstration stores `goat.png` once and exposes 1,000
byte-identical files, totaling 2.12 GiB of logical file contents. Its QR is a
standard version-4 symbol and independently decodes to the permanent HTTPS
address.

## Web bridge

Publish this directory at the HTTPS host used to build the Android app. A
FelixQR contains:

```text
https://HOST/open/#FX1%7C...encoded payload...
```

The payload is in the URL fragment, so it is never included in the HTTP
request. `.well-known/assetlinks.json` matches the included debug APK. For a
release key, replace the fingerprint using `assetlinks.json.template`, then
build the app with:

```text
gradle -PfelixHost=HOST -PfelixCleartext=false assembleDebug
```

The web bridge has no network runtime dependencies. It can also load pasted
FelixQR links, raw FX1 payloads, and local `.fx1` files. `node test-link.js`
runs its link-format checks.

The local file manager stores selected files in browser IndexedDB and encodes
them into a literal-file FelixFS volume without uploading them. Small volumes
can be rendered as an ordinary QR; every volume can be saved as `.fx1` and
opened in FelixFS. `node test-builder.js` checks the browser-side FX1 encoder.
QR rendering uses the MIT-licensed `qrcode` package; its license is included
beside the browser bundle.

The exact image demonstration lives at `/open/image/`. Its ordinary QR carries
a short HTTPS locator to `goat-1000.fqx`; FelixFS validates that FQX1 envelope
and exposes 1,000 byte-identical PNG entries from one stored source. The host
root redirects to `/open/`, and `.nojekyll` publishes the prebuilt static files
unchanged.

The permanent public site is `https://felixagi.github.io`. The repository is a
static GitHub Pages user site; no server process is required after publication.

## License

FelixQR and FelixFS are available under the MIT License. See `LICENSE`.
