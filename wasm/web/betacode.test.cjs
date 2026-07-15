// Validates betacode.js conversions + parser, driving the real WASM module.
// Run from wasm/dist so morpheus.js finds its .wasm/.data:  node ../web/betacode.test.cjs
const assert = require('assert');
globalThis.BetaCode = require('./vendor/beta-code.js'); // Unicode<->Beta engine
require('./betacode.js');                 // side-effect: sets globalThis.MorphBeta
const B = globalThis.MorphBeta;
const createMorpheus = require('../dist/morpheus.js');

let fails = 0;
function eq(actual, expected, msg) {
  try { assert.strictEqual(actual, expected, msg); console.log(`  ok: ${msg} => ${actual}`); }
  catch (e) { fails++; console.error(`  FAIL: ${msg}\n    expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`); }
}

console.log('== betaToGreek ==');
eq(B.betaToGreek('lo/gos'), 'λόγος', 'lo/gos');
eq(B.betaToGreek('a)/nqrwpos'), 'ἄνθρωπος', 'a)/nqrwpos');
eq(B.betaToGreek('bi/os'), 'βίος', 'bi/os');
eq(B.betaToGreek('e)/lusa'), 'ἔλυσα', 'e)/lusa');
eq(B.betaToGreek('yuxh/'), 'ψυχή', 'yuxh/ (final letter, acute)');
eq(B.betaToGreek('*)aqh=nai'), 'Ἀθῆναι', 'capital with breathing');

console.log('== greekToBeta (round-trip) ==');
eq(B.greekToBeta('λόγος'), 'lo/gos', 'λόγος');
eq(B.greekToBeta('ἄνθρωπος'), 'a)/nqrwpos', 'ἄνθρωπος');
eq(B.betaToGreek(B.greekToBeta('ἄνθρωπος')), 'ἄνθρωπος', 'round-trip ἄνθρωπος');

console.log('== toBetaInput ==');
eq(B.toBetaInput('λόγος', false), 'lo/gos', 'unicode input');
eq(B.toBetaInput('lo/gos', false), 'lo/gos', 'beta input passthrough');
eq(B.toBetaInput('Cactus', true), 'cactus', 'latin lowercased');

console.log('== latinPretty ==');
eq(B.latinPretty('re_x'), 'rēx', 're_x macron');
eq(B.latinPretty('gallus#1'), 'gallus¹', 'homonym superscript');

(async () => {
  console.log('== parse real WASM output (Greek λόγος) ==');
  const G = await createMorpheus();
  const raw = G.ccall('morph_analyze', 'string', ['string', 'number', 'number'],
                      [B.toBetaInput('λόγος', false), 0, 0]);
  console.log('  raw:', JSON.stringify(raw));
  const parsed = B.parseAnalyses(raw, false);
  console.log('  parsed:', JSON.stringify(parsed, null, 2));
  eq(parsed.length >= 1, true, 'at least one analysis');
  eq(parsed[0].lemma, 'λόγος', 'lemma converted');
  eq(parsed[0].posLabel, 'noun / adjective', 'POS label');
  eq(parsed[0].featureList.join(' '), 'masc nom sg', 'features');
  eq(parsed[0].stemtype, 'os_ou', 'stemtype');

  console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
})();
