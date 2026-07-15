// Point Morpheus at the preloaded stem library inside the virtual filesystem.
// The C code reads getenv("MORPHLIB") and then opens $MORPHLIB/{Greek,Latin}/...
// (see src/morphlib/morphpath.c). The build preloads wasm/data at /stemlib.
Module['preRun'] = Module['preRun'] || [];
Module['preRun'].push(function () {
  ENV.MORPHLIB = '/stemlib';
});
