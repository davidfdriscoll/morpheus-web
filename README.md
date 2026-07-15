# morpheus-web

Client-side Ancient Greek & Latin morphological analysis. The [Morpheus](https://github.com/perseids-tools/morpheus)
parser (Perseus Project) is compiled to WebAssembly with Emscripten and runs
entirely in the browser — no server. Deployed as a static site to GitHub Pages,
built in CI.

- `morpheus/` — the Morpheus C source + stem library (git submodule).
- `wasm/` — build tooling (`build.sh`, `prepare.sh`), the browser entry point
  (`morph_api.c`), and the web app (`wasm/web/`).
- `.github/workflows/deploy.yml` — builds the WASM and deploys the site to Pages.

## Build locally

```bash
git submodule update --init --recursive
# emscripten must be on PATH (emsdk, or `brew install emscripten` on macOS)
bash wasm/prepare.sh      # apply the required source patch to the submodule
bash wasm/build.sh        # -> wasm/dist/{cruncher,morpheus}.{js,wasm,data}
# serve and open the app:
python3 -m http.server 8099   # then open http://localhost:8099/wasm/web/
```

See **AGENT_INSTRUCTIONS.md** for full setup, deployment, and background.
