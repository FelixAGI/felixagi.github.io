# Build and verify FelixFS

## Native core

Install Rust 1.85 or newer (the package uses the 2024 edition). On Windows,
use the MSVC toolchain. The Windows API crates are included under `vendor/`.
From this directory:

```sh
cargo test
cargo run -- demo demo
cargo run -- info demo/felix.fx1
cargo run -- ls demo/goat-1000.fqx /files
cargo run -- read demo/goat-1000.fqx /files/goat-0001.png 0 32 first-32.bin
```

`cargo run -- demo demo` generates the geometric FX1 sample and its angular BMP in
`demo/`. The bundled `goat-1000.fqx` is the separate exact-file sample.
`cargo test` checks geometry, random reads, the file tree, scanner, C ABI,
and exact first/last image entries. The binary also provides read-only WebDAV
(`serve`) and the Windows Cloud Files mount commands (`mount-windows` and
`unmount-windows`). The platform launchers are under `adapters/`.

## Android app

Install JDK 17, Gradle 8.7, Android SDK Platform 34, SDK CMake 3.22.1, and
an Android NDK. Set `ANDROID_HOME` and `ANDROID_NDK_HOME` to your SDK and NDK.
Install the Rust targets:

```sh
rustup target add aarch64-linux-android x86_64-linux-android
```

Point `NDK_BIN` at your NDK's `toolchains/llvm/prebuilt/<host>/bin` directory.
On Linux, `<host>` is usually `linux-x86_64`. From this package's root:

```sh
CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$NDK_BIN/aarch64-linux-android26-clang" \
  cargo build --release --target aarch64-linux-android
CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER="$NDK_BIN/x86_64-linux-android26-clang" \
  cargo build --release --target x86_64-linux-android
mkdir -p android/app/src/main/jniLibs/arm64-v8a android/app/src/main/jniLibs/x86_64
cp target/aarch64-linux-android/release/libfelixfs.a android/app/src/main/jniLibs/arm64-v8a/
cp target/x86_64-linux-android/release/libfelixfs.a android/app/src/main/jniLibs/x86_64/
cd android
gradle assembleDebug
```

Gradle builds the JNI shim with CMake and packages both native ABIs. The APK
is at `android/app/build/outputs/apk/debug/app-debug.apk`. Gradle creates its
standard local debug signing key; no project signing key is included. A
locally signed APK will not match the published site's Digital Asset Links
fingerprint, but the normal QR web page and its `Open in FelixFS` handoff can
still be used. To claim HTTPS links directly for your own build, publish the
matching fingerprint at your own host.

The Android project uses AGP 8.6.1. See the official
[AGP compatibility table](https://developer.android.com/build/releases/agp-8-6-0-release-notes)
and [NDK CMake guide](https://developer.android.com/ndk/guides/cmake) for the
required build tools and host-specific toolchain path.

## Web demo

The static site and its tests are in the
[public site repository](https://github.com/FelixAGI/felixagi.github.io).
It does not accept uploads to a server. The image demo's QR links to a bundled
static FQX1 sample; selected visitor files stay in browser storage.
