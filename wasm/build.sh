#!/usr/bin/env bash
#
# Build Morpheus to WebAssembly.
#
# Reads the Morpheus C source + stem library from the `morpheus/` git submodule
# (override with MORPHEUS_DIR) and writes two builds to wasm/dist/:
#   cruncher.js / .wasm / .data  -> Node CLI build (auto-runs main, reads stdin)
#   morpheus.js / .wasm / .data  -> Browser library build (exposes _morph_analyze)
#
# The browser static site only needs morpheus.{js,wasm,data} (+ wasm/web/).
#
# Requirements: emscripten (emcc/emar/emranlib) on PATH — install emsdk, or
# `brew install emscripten` on macOS. Run `bash wasm/prepare.sh` first so the
# required fixacc patch is applied to the submodule.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MORPHEUS_DIR="${MORPHEUS_DIR:-$ROOT/morpheus}"
SRC="$MORPHEUS_DIR/src"
STEMLIB="$MORPHEUS_DIR/stemlib"
WASM="$ROOT/wasm"
DIST="$WASM/dist"
DATA="$WASM/data"
SHIM="$WASM/shim"

[ -d "$SRC" ] || { echo "Morpheus source not found at $SRC — did you init the submodule?" >&2; exit 1; }
command -v emcc >/dev/null || { echo "emcc not found on PATH (install emsdk or 'brew install emscripten')" >&2; exit 1; }

# Warning-suppression flags required by modern clang for this ~1990s K&R C code.
# (README + PR #9 set, plus non-prototype/int-conversion.) If a newer clang
# promotes another warning to an error, add the matching -Wno-error= here.
WARN="-Wno-return-type -Wno-implicit-function-declaration \
-Wno-error=incompatible-function-pointer-types -Wno-deprecated-non-prototype \
-Wno-error=int-conversion -Wno-error=implicit-int"
CFLAGS_ENV="-std=gnu89 $WARN"          # passed to sub-makefiles (they add -O2 -I)
CFLAGS_DIRECT="-std=gnu89 -O2 -I$SRC/includes $WARN"

# The sub-makefiles hardcode gcc/cc/ar/ranlib. Generate shims that redirect
# those to the emscripten toolchain so `make` builds wasm objects/archives.
EMCC_DIR="$(dirname "$(command -v emcc)")"
mkdir -p "$SHIM"
for t in gcc cc; do printf '#!/bin/sh\nexec "%s/emcc" "$@"\n' "$EMCC_DIR" > "$SHIM/$t"; done
printf '#!/bin/sh\nexec "%s/emar" "$@"\n'     "$EMCC_DIR" > "$SHIM/ar"
printf '#!/bin/sh\nexec "%s/emranlib" "$@"\n' "$EMCC_DIR" > "$SHIM/ranlib"
chmod +x "$SHIM"/*

echo "==> [0/5] Assembling the runtime stem library (wasm/data)"
# cruncher reads only these paths at runtime (verified by tracing MorphFopen over
# the full test fixture). We omit the ~11MB of build-only sources under stemsrc/
# (and conjfile), keeping just the two stemsrc files the runtime actually opens:
# vbs.cmp.ml (compound verbs) and lemlist (Greek dictionary entries; Latin has none).
rm -rf "$DATA"
for lang in Greek Latin; do
  mkdir -p "$DATA/$lang/stemsrc"
  for d in derivs endtables rule_files steminds; do
    cp -R "$STEMLIB/$lang/$d" "$DATA/$lang/$d"
  done
  [ -f "$STEMLIB/$lang/stemsrc/vbs.cmp.ml" ] && cp "$STEMLIB/$lang/stemsrc/vbs.cmp.ml" "$DATA/$lang/stemsrc/"
  [ -f "$STEMLIB/$lang/stemsrc/lemlist" ]    && cp "$STEMLIB/$lang/stemsrc/lemlist"    "$DATA/$lang/stemsrc/"
done
echo "    data size: $(du -sh "$DATA" | cut -f1)"

echo "==> [1/5] Building static archives with the emscripten toolchain"
cd "$SRC"
make clean >/dev/null 2>&1 || true
for lib in greeklib morphlib gkends gkdict gener anal; do
  echo "    - $lib"
  PATH="$SHIM:$PATH" CFLAGS="$CFLAGS_ENV" make -C "$lib" "$lib.a" >/dev/null
done

ARCHIVES="anal/anal.a gener/gener.a gkends/gkends.a gkdict/gkdict.a morphlib/morphlib.a greeklib/greeklib.a"

echo "==> [2/5] Compiling entry points"
emcc $CFLAGS_DIRECT -c -o "$SRC/anal/stdiomorph.o" "$SRC/anal/stdiomorph.c"
emcc $CFLAGS_DIRECT -c -o "$WASM/morph_api.o"      "$WASM/morph_api.c"

mkdir -p "$DIST"
# The nearest package.json up-tree may declare "type":"module"; mark the built
# CommonJS output so `node dist/cruncher.js` / require('dist/morpheus.js') work.
printf '{ "type": "commonjs" }\n' > "$DIST/package.json"

# Common emscripten link flags shared by both builds.
COMMON="-O2 -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 \
--preload-file $WASM/data@/stemlib --pre-js $WASM/pre.js"

echo "==> [3/5] Linking Node CLI build (cruncher.js)"
emcc "$SRC/anal/stdiomorph.o" $ARCHIVES $COMMON \
  -sEXPORTED_RUNTIME_METHODS=callMain,FS,ENV \
  -o "$DIST/cruncher.js"

echo "==> [4/5] Linking browser library build (morpheus.js)"
emcc "$WASM/morph_api.o" $ARCHIVES $COMMON \
  -sMODULARIZE=1 -sEXPORT_NAME=createMorpheus \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 \
  -sEXPORTED_FUNCTIONS=_morph_analyze,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString,FS,ENV \
  -o "$DIST/morpheus.js"

echo "==> [5/5] Done. Artifacts in $DIST:"
ls -la "$DIST"
