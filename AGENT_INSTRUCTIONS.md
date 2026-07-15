# Instructions for setting up the `morpheus-web` repo

You are an agent creating a **new GitHub repository** that compiles the Morpheus
morphological parser to WebAssembly in CI and serves a **client-side static site**
on GitHub Pages. Everything you need is in this scaffold except the Morpheus source
itself, which you add as a git submodule.

This scaffold is already tested and working — the web app, the WASM glue, and the
build script are copied verbatim from a verified build. Your job is to wire up the
repo, the submodule, and Pages. **Do not rewrite the web app or build.sh from
scratch**; they encode non-obvious fixes (see "How it works" below).

---

## 0. Prerequisites

- `git`, and `gh` (GitHub CLI) or the GitHub web UI.
- For **local** verification (recommended before pushing): Emscripten, Node ≥18,
  and optionally Ruby.
  - Emscripten via **emsdk** (portable, self-configuring):
    ```bash
    git clone https://github.com/emscripten-core/emsdk.git
    cd emsdk && ./emsdk install 6.0.3 && ./emsdk activate 6.0.3
    source ./emsdk_env.sh    # puts emcc/emar/emranlib on PATH
    ```
    (`latest` also works; if a newer clang turns a warning into an error, add the
    matching `-Wno-error=...` flag in `wasm/build.sh`.)
  - On macOS you may instead `brew install emscripten`. ⚠️ Homebrew's auto-generated
    `.emscripten` config is often wrong — it points `LLVM_ROOT`/`BINARYEN_ROOT` at the
    system, not at Emscripten's bundled copies. If `emcc` fails to find `wasm-ld` or
    `wasm-opt`, edit `$(brew --prefix)/Cellar/emscripten/<ver>/libexec/.emscripten` to:
    ```
    LLVM_ROOT     = '/opt/homebrew/Cellar/emscripten/<ver>/libexec/llvm/bin'
    BINARYEN_ROOT = '/opt/homebrew/Cellar/emscripten/<ver>/libexec/binaryen'
    NODE_JS       = '/opt/homebrew/bin/node'
    ```
    emsdk avoids this entirely, so prefer emsdk if unsure.

---

## 1. Create the repo and add this scaffold

```bash
mkdir morpheus-web && cd morpheus-web
git init -b main
# copy ALL files from this scaffold into the repo (preserve the directory layout):
#   AGENT_INSTRUCTIONS.md  README.md  .gitignore
#   .github/workflows/deploy.yml
#   wasm/build.sh  wasm/prepare.sh  wasm/morph_api.c  wasm/pre.js  wasm/test_wasm.rb
#   wasm/patches/fixacc.patch
#   wasm/web/{index.html,app.js,betacode.js,betacode.test.cjs,package.json}
#   wasm/web/vendor/{beta-code.js,beta-code-LICENSE,README.md}
chmod +x wasm/build.sh wasm/prepare.sh
git add . && git commit -m "scaffold: morpheus wasm web app + CI"
```

Then create the empty GitHub repo and set the remote:
```bash
gh repo create <owner>/morpheus-web --public --source . --remote origin
```

## 2. Add Morpheus as a submodule

Morpheus (source + the checked-in stem library, ~26 MB) is a submodule, so it stays
out of your repo. Use the `perseids-tools` fork — it is MPL-2.0 licensed, more recently
maintained than `PerseusDL/morpheus`, and **ships the prebuilt stem indices** (PerseusDL
does not; its `steminds/` is empty, which would force a bootstrap build).

```bash
git submodule add https://github.com/perseids-tools/morpheus.git morpheus
git commit -m "add morpheus submodule (perseids-tools)"
```

The one required source fix (`wasm/patches/fixacc.patch`) is applied to the submodule
working tree at build time by `wasm/prepare.sh` (and by CI) — you do **not** commit a
modified submodule. See "How it works" for why the patch is needed.

> Alternative (cleaner, optional): fork `perseids-tools/morpheus`, apply the patch,
> commit it to the fork, and submodule the fork. Then the fix is durable and you can
> drop the `prepare.sh` step. The patch is a legitimate bug fix worth a PR upstream.

## 3. Build and verify locally

```bash
git submodule update --init --recursive
bash wasm/prepare.sh          # apply fixacc patch to the submodule (idempotent)
bash wasm/build.sh            # ~2–4 min first run (Emscripten compiles its sysroot once)
                              # -> wasm/dist/{cruncher,morpheus}.{js,wasm,data}
```

Verify (optional but recommended):
```bash
# Node CLI sanity check:
cd wasm/dist && echo 'a)/nqrwpos' | node cruncher.js -S    # Greek beta code
cd ../..

# Converter + WASM unit tests:
( cd wasm/dist && node ../web/betacode.test.cjs )          # expect "ALL PASS"

# Full fixture vs Morpheus's expected output:
ruby wasm/test_wasm.rb        # expect "0 content failures" (some order-only diffs are OK)

# The site itself:
python3 -m http.server 8099   # open http://localhost:8099/wasm/web/
#   try: λόγος, ἄνθρωπος, ἔλυσα (Greek); rex, amaverunt (Latin)
```

## 4. Deploy to GitHub Pages

The workflow `.github/workflows/deploy.yml` already: checks out the submodule, sets up
Emscripten, runs `prepare.sh` + `build.sh`, assembles a flat `site/` (the browser build
next to `index.html`, `../dist/` prefixes stripped, `.nojekyll` added), and deploys.

1. Push: `git push -u origin main`
2. In the repo: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. Watch the **Actions** tab. On success the deploy job prints the Pages URL
   (`https://<owner>.github.io/morpheus-web/`).

First run takes a few minutes. Re-runs are faster (Emscripten sysroot is cacheable; add
`actions/cache` on `~/.emscripten_cache` if you want to speed it up).

---

## How it works (read before changing anything)

- **The site is fully static & single-threaded.** No server, no SharedArrayBuffer, so
  **no COOP/COEP headers are needed** — which matters because Pages can't set custom
  headers. GitHub Pages already serves `.wasm` as `application/wasm`. The ~11 MB
  `morpheus.data` (the stem library) downloads once and is browser-cached.

- **Two builds.** `cruncher.*` is a Node CLI (auto-runs `main`, reads stdin) used only
  for testing. `morpheus.*` is the browser library (`MODULARIZE`, exposes
  `morph_analyze` via `ccall`). The site uses only `morpheus.{js,wasm,data}`.

- **The `fixacc.patch` is mandatory for WASM.** `src/morphlib/fixacc.c` calls
  `getsyll`/`getsyll2` with **3** arguments but they are defined with **2**. Native C
  silently ignores the extra arg; WebAssembly **traps** (`RuntimeError: unreachable`) on
  the `call_indirect` signature mismatch. The patch drops the always-ignored 3rd
  argument — behavior-preserving (the native build still passes its test suite). Without
  it, all Greek analysis crashes.

- **Data is pruned.** `build.sh` bundles only the stemlib files `cruncher` opens at
  runtime (`derivs/`, `endtables/`, `rule_files/`, `steminds/`, plus `stemsrc/vbs.cmp.ml`
  and Greek `stemsrc/lemlist`) — ~14 MB instead of 26 MB. Verified by tracing file opens.

- **Unicode ⇄ Beta Code** uses the vendored `beta-code-js` library
  (`wasm/web/vendor/beta-code.js`, MIT). `wasm/web/betacode.js` wraps it for
  Morpheus-specific bits: elision apostrophe (`ʼ`→`'`; the library maps it to `)`, which
  Morpheus rejects), `_`/`^` quantity and `#n` homonym markers, and Latin. Morpheus is
  case-sensitive and wants capitals as `*)a` (marker+diacritics **before** the letter) —
  the library handles this correctly; a hand-rolled converter got it wrong.

- **One WASM instance per language.** Morpheus caches index data in process-global state
  and is single-language per run, so `wasm/web/app.js` creates a separate module instance
  for Greek and for Latin (lazily). Don't merge them.

- **`wasm/web/package.json` (`type: commonjs`)** exists so Node treats the `.js` files as
  CommonJS for the tests (a `type: module` package.json higher up the tree would otherwise
  break `require`). Browsers ignore it. Keep it (CI removes it from the published site).

## Troubleshooting

- **`emcc not found`** → activate emsdk (`source emsdk_env.sh`) or install emscripten.
- **`wasm-ld` / `wasm-opt` not found** (macOS/brew) → fix the `.emscripten` config (see §0).
- **`RuntimeError: unreachable` on Greek words** → the fixacc patch wasn't applied; run
  `bash wasm/prepare.sh`.
- **New clang errors during build** → add the matching `-Wno-error=<name>` to `WARN` in
  `wasm/build.sh`.
- **Pages 404 / raw files** → ensure Pages Source is "GitHub Actions" and the deploy job
  succeeded; the site is the flattened `site/` artifact, not the repo root.
- **Blank page, `morpheus.data` 404 in console** → the flatten step in the workflow didn't
  run or paths weren't stripped; confirm `site/` contains `index.html` + `morpheus.*`
  side by side and that `sed` rewrote `../dist/`.
