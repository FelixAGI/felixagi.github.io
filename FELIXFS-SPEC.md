# FelixFS FX1 / FXB1 Specification

Version 1

## 1. Envelope

The QR text is

```text
FX1|BASE64URL(FXB1)|CRC32(FXB1)
```

Base64url is unpadded. CRC32 uses polynomial `0xEDB88320` and is written as
eight lowercase hexadecimal digits. A decoder validates the checksum before
parsing the binary record.

## 2. Primitive encoding

`var` is unsigned LEB128. All counts and VM references are `var` values.

`big` is `var(byte_length)` followed by little-endian base-`2^32` words. Its
canonical zero has byte length zero. Nonzero values have no zero high word.

`word` is:

```text
var(rotation_radix)
var(state_count)
var(state_0) ... var(state_n-1)
```

For UTF-8 names and literal bytes, the radix is 256 and every state is one
byte. State `s` has physical angle `2*pi*s/radix`.

## 3. FXB1 record

```text
"FXB1"
var(version = 1)
var(level_count)
  repeated level_count:
    var(axis_count)
      repeated axis_count:
        var(state_count)
        var(rotation_count)
var(output_channels)
program
root_branch
```

There is no fixed dimension count and addresses use arbitrary-precision
unsigned integers.

## 4. Recursive lattice

Every level is a lattice whose coordinate contains a child lattice at the
next level. Flattening is used only for canonical row-major addressing; the
runtime retains level boundaries.

For axes with radices `n_0 ... n_(D-1)` and channel count `q`, byte address
`A` decomposes as

```text
channel = A mod q
point = floor(A / q)
x_j = point mod n_j, from j = D-1 down to 0
point = floor(point / n_j)
```

The inverse is

```text
point = (((x_0*n_1 + x_1)*n_2 + x_2) ...)
A = point*q + channel
```

Logical bytes are `q * product(n_j)` with no machine-word truncation.

## 5. VM program

The program begins with `var(instruction_count)`, then encoded instructions,
then `var(output_count)` and that many instruction references. One output may
be shared by every channel, or the output count must equal the channel count.
Every operand must reference an earlier instruction.

| Tag | Instruction | Operands |
|---:|---|---|
| 0 | constant | `var(u64)` |
| 1 | flattened coordinate | `var(axis)` |
| 2 | recursive coordinate | `var(level), var(axis)` |
| 3 | channel | none |
| 4 | dimension count | none |
| 5 | recursive level count | none |
| 6 | wrapping add | `a, b` |
| 7 | wrapping subtract | `a, b` |
| 8 | wrapping multiply | `a, b` |
| 9 | unsigned divide | `a, b` |
| 10 | unsigned remainder | `a, b` |
| 11 | XOR | `a, b` |
| 12 | AND | `a, b` |
| 13 | OR | `a, b` |
| 14 | NOT | `a` |
| 15 | wrapping shift left | `a, b` |
| 16 | wrapping shift right | `a, b` |
| 17 | rotate left | `a, b` |
| 18 | rotate right | `a, b` |
| 19 | minimum | `a, b` |
| 20 | maximum | `a, b` |
| 21 | equality | `a, b` |
| 22 | less-than | `a, b` |
| 23 | greater-than | `a, b` |
| 24 | conditional select | `condition, yes, no` |
| 25 | reverse eight bytes | `a` |
| 26 | population count | `a` |
| 27 | SplitMix64 finalizer | `a` |

Division or remainder by zero evaluates to zero. Shifts use the low six bits.
Comparisons evaluate to zero or one. The selected output's low byte is the
coordinate/channel value.

## 6. Executable Phi namespace

A branch is encoded recursively:

```text
var(rotation_state)
var(rotation_radix)
word(name)
content_geometry
var(child_count)
branch child_0 ... branch child_n-1
```

The root has an empty angular name. Sibling names are unique. A file has
content and no children; a directory has children and no content. Resolving a
path walks angular branch states, not a separate inode or allocation table.

Content geometry tags are:

```text
0  directory / no content
1  angular bytes: word(bytes)
2  lattice view: big(start), big(length)
3  orbit view: big(start), big(length), var(chart_bytes), big(stride)
```

For a lattice view, byte offset `y` maps to `start+y`.

For an orbit view:

```text
chart  = floor(y / chart_bytes)
within = y mod chart_bytes
address = start + chart*stride + within
```

This transformation orbit joins geometric charts without an extent list.

### 6.1 Exact file compiler

An encoder may compile uploaded bytes into an existing lattice view and VM
program instead of storing them as angular literals. The reference web compiler
first tests whole-file constant, repeating, linear, quadratic, XOR-ramp, and
translated-orbit models. It then divides more complex files into cells of
`B = 256` bytes:

```text
cell(y)   = floor(y / B)
within(y) = y mod B
byte(y)   = model_cell(y)(within(y)), overridden by correction(y)
```

Each cell independently selects the smallest of those same models. Their closed
forms are:

```text
quadratic(r) = a + b*r + c*r^2                    (mod 256)
xor_ramp(r)  = a XOR (b*r mod 256)
orbit(r)     = P[r mod k] + floor(r/k)*drift      (mod 256)
```

The orbit is a translated stack of k-byte charts: it captures interleaved
channels and repeated shapes that move by a fixed amount on each pass. Cells
with identical models and corrections share one VM branch; cell membership is
an OR of coordinate comparisons. Sparse exceptions are equality/select
operations over the within-cell coordinate.

Compiled files occupy a two-dimensional row-major lattice. The VM reconstructs
the linear address from `(row, column)`, then derives `cell` and `within`. The
whole-file model remains available when it is smaller than the cell lattice.
The encoder uses procedural geometry only when the complete FXB1 record is
smaller than the literal form.

This translation is lossless: every generated byte and correction is evaluated
by the standard version 1 VM, and files without a smaller model remain angular
literals. No additional content tag or decoder extension is required.

### 6.2 Exact repeated-file envelope FQX1

`FQX1` stores one arbitrary source file and projects it repeatedly without
duplicating its bytes. Its text envelope is:

```text
FQX1 | base64url(FQX1_binary) | lowercase_hex_crc32(FQX1_binary)
```

The binary record is:

```text
"FQX1"
u16le(repeat_count)
u16le(utf8_name_length)
u64le(file_length)
utf8_name
file_bytes
```

For source byte string `B` and `1 <= t <= repeat_count`, the generated file is
defined exactly by `file_t[y] = B[y]`. Names insert a zero-padded ordinal before
the source extension. The native decoder shares one immutable byte allocation
across every branch and slices only the requested range.

This is deduplication, not entropy compression: the binary costs
`16 + |name| + |B|` bytes. When the complete FQX1 text does not fit an ordinary
QR, the QR carries a normal HTTPS locator to the checksummed record.

## 7. Angular image carrier FXA1

The physical angular frame is:

```text
"FXA1"
u32le(payload_length)
u32le(CRC32(payload))
payload
```

Each byte becomes two 16-state rotations, high nibble first. A mark is a
directed radial line and asymmetric endpoint rendered in a 32 by 32 cell.
There are 32 cells per row and a 16-pixel margin. Three corner finders orient
the frame.

The scanner builds all 16 legal moving-line templates, correlates each
captured cell against them, selects the minimum-distance angular state,
recombines nibbles, validates `FXA1`, length, and CRC32, and only then passes
the recovered FX1 payload to the volume decoder.

## 8. Native ABI

The static library exports:

```c
FelixHandle *felix_open(const uint8_t *payload, size_t length);
void felix_close(FelixHandle *handle);
int32_t felix_kind(const FelixHandle *handle, const char *path, size_t length);
uint64_t felix_size(const FelixHandle *handle, const char *path, size_t length);
ptrdiff_t felix_list(const FelixHandle *handle, const char *path, size_t length,
                     uint8_t *output, size_t capacity);
ptrdiff_t felix_read(const FelixHandle *handle, const char *path, size_t length,
                     uint64_t offset, uint8_t *output, size_t requested);
```

`kind` returns 0 for missing, 1 for file, and 2 for directory. `list` emits
UTF-8 lines:

```text
KIND|ROTATION_STATE|ROTATION_RADIX|LENGTH|NAME
```

Calling `list` with a null output returns the required byte count.

## 9. Platform projections

The portable desktop adapter is a read-only WebDAV filesystem surface:

- `PROPFIND` calls `Phi::metadata` and `Phi::list`.
- `HEAD` returns geometric metadata.
- ranged `GET` calls `FelixVolume::read(path, offset, length)`.
- mutating methods are rejected.

Linux maps it with `davfs`, and macOS with `mount_webdav`.

Windows uses a native Cloud Files projection. Each executable `Phi` branch is
created as a `CF_PLACEHOLDER_CREATE_INFO`; the full geometric path is its file
identity. `CF_CALLBACK_TYPE_FETCH_DATA` converts the requested 64-bit offset to
`BigNat`, evaluates the same volume reader in chunks, and returns bytes with
`CF_OPERATION_TYPE_TRANSFER_DATA`. The projected root is assigned a drive
letter with `subst`, so `/lattice.bin` is a sparse 1 TiB filesystem node whose
requested regions are generated from geometry.

Android uses `DocumentsProvider`. `queryChildDocuments` calls the native
`list` ABI. `openDocument` returns a seekable proxy descriptor whose
`onRead(offset, size)` calls the native `read` ABI. No file contents are
materialized before the request.

## 10. Verified sample

```text
recursive levels: 3
axes per level: 8
dimensions: 24
states per axis: 16
rotations per axis: 16
channels: 4
logical bytes: 2^98 = 316912650057057350374175801344
VM operation set: 28
VM instructions: 133
FX1 payload bytes: 1193
ordinary QR: Version 24-L
```

The root projection contains:

```text
/README.txt
/lattice.bin                         1 TiB
/recursive/level-0.bin               1 MiB orbit
/recursive/level-1.bin               1 MiB orbit
/recursive/nested/twenty-four-dimensions.bin
```
