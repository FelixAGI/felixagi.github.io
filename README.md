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

Start with the [capacity demo](https://felixagi.github.io/open/image/), then
download the [native source package](https://felixagi.github.io/felixfs-source.zip),
read the [protocol specification](FELIXFS-SPEC.md), and follow the
[build guide](BUILD.md). The browser builder and bridge are in this repository.

## Web bridge

Publish this directory at the HTTPS host used to build the Android app. A
FelixQR contains:

```text
https://HOST/open/#FX1%7C...encoded payload...
```

The payload is in the URL fragment, so it is never included in the HTTP
request. The published `.well-known/assetlinks.json` only verifies an APK
signed with its listed certificate. A locally built debug APK has a different
certificate; it can still use the web page's `Open in FelixFS` handoff. For
your own verified HTTPS links, publish your certificate fingerprint at your
own host and build the app with:

```text
gradle -PfelixHost=HOST -PfelixCleartext=false assembleDebug
```

The web bridge has no network runtime dependencies. It can also load pasted
FelixQR links, raw FX1 payloads, and local `.fx1` files. `node test-link.js`
runs its link-format checks.

The live site is a static demo, not a file-hosting service. The local file
manager stores selected files in browser IndexedDB and builds exact FelixFS
volumes without uploading them. Small results can be rendered as ordinary QR
images; larger results can be saved locally as `.fx1` files. The Android app
currently accepts `.fx1` imports up to 16 MiB. `node test-builder.js` checks
the browser-side FX1 encoder.
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
