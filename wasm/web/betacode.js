/*
 * Beta Code <-> Unicode conversion and Morpheus PERSEUS-format parsing.
 *
 * The letter/diacritic conversion is delegated to the battle-tested
 * `beta-code-js` library (vendored at vendor/beta-code.js, exposed as
 * globalThis.BetaCode). This file adds only the Morpheus-specific handling the
 * generic library doesn't cover:
 *   - elision apostrophe (ʼ/’) -> Beta Code "'" (the library maps it to ")",
 *     which Morpheus rejects — this is why Anastrophe returns nothing for
 *     elided forms like δʼ, μυρίʼ);
 *   - Morpheus output markers: "_"/"^" (vowel quantity) and "#n"/trailing
 *     digits (homonyms);
 *   - Latin (the library is Greek-only).
 *
 * Pure logic, no DOM/WASM deps. Exposed as globalThis.MorphBeta (and
 * module.exports under CommonJS). In the browser, load vendor/beta-code.js
 * before this file; in Node, set globalThis.BetaCode = require(vendor bundle)
 * first.
 */
(function (root) {
  'use strict';

  function engine() {
    var bc = root.BetaCode || (typeof globalThis !== 'undefined' && globalThis.BetaCode);
    if (!bc) throw new Error('BetaCode engine (vendor/beta-code.js) not loaded');
    return bc;
  }

  var SUPER = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
                '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  var ELISION = /[ʼ’‘']/g;

  // ---- Beta Code -> Greek (for displaying Morpheus output) ----------------
  function betaToGreek(s) {
    if (s == null) return '';
    // Pull off a trailing homonym marker ("#1" or a bare trailing digit).
    var homonym = '';
    s = String(s).replace(/#?([0-9]+)$/, function (_, d) {
      homonym = d.split('').map(function (c) { return SUPER[c]; }).join('');
      return '';
    });
    // Drop vowel-quantity markers (not shown on precomposed Greek); the library
    // would otherwise render "_" as an em-dash.
    s = s.replace(/[_^]/g, '');
    var greek = engine().betaCodeToGreek(s).normalize('NFC');
    return greek + homonym;
  }

  // ---- Latin beta-ish -> Latin, _ -> macron over the preceding vowel ------
  var MACRON = { a: 'ā', e: 'ē', i: 'ī', o: 'ō', u: 'ū', y: 'ȳ',
                 A: 'Ā', E: 'Ē', I: 'Ī', O: 'Ō', U: 'Ū' };
  function latinPretty(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '_') {
        var prev = out.slice(-1);
        if (MACRON[prev]) out = out.slice(0, -1) + MACRON[prev];
      } else if (c === '^') {
        /* short marker: drop */
      } else if (c === '#') {
        i++; var num = '';
        while (i < s.length && s[i] >= '0' && s[i] <= '9') { num += SUPER[s[i]]; i++; }
        i--; out += num;
      } else {
        out += c;
      }
    }
    return out;
  }

  function prettyForm(tok, isLatin) {
    if (tok == null) return '';
    return isLatin ? latinPretty(tok) : betaToGreek(tok);
  }

  // ---- Unicode Greek -> Beta Code (for input to Morpheus) -----------------
  function looksGreek(s) { return /[Ͱ-Ͽἀ-῿]/.test(s); }

  function greekToBeta(s) {
    // Handle elision ourselves: split on apostrophes, convert the Greek
    // segments with the library, rejoin with the Beta Code apostrophe. A
    // trailing apostrophe (δʼ, μυρίʼ) yields a trailing "" segment, so join
    // reproduces the trailing "'" naturally.
    return String(s).split(ELISION).map(function (seg) {
      return seg ? engine().greekToBetaCode(seg) : '';
    }).join("'");
  }

  /* Normalize whatever the user typed into Beta Code for the given language. */
  function toBetaInput(raw, isLatin) {
    var s = (raw || '').trim();
    if (isLatin) return s.toLowerCase();
    if (looksGreek(s)) return greekToBeta(s);
    return s; // already Beta Code
  }

  // ---- Parse Morpheus PERSEUS output --------------------------------------
  var POS = { N: 'noun / adjective', V: 'verb', P: 'participle',
              I: 'indeclinable', E: 'English gloss' };

  function parseAnalyses(raw, isLatin) {
    var out = [];
    if (!raw) return out;
    var re = /<NL>([\s\S]*?)<\/NL>/g, m;
    while ((m = re.exec(raw)) !== null) {
      var inner = m[1];
      var posCh = inner.charAt(0);
      var rest = inner.slice(2); // drop "X "
      var tabs = rest.split('\t');
      var headFeat = tabs[0] || '';
      var dialects = (tabs[1] || '').trim();
      var flags = (tabs[2] || '').trim();
      var stemtype = (tabs[3] || '').trim();

      var sp = headFeat.indexOf(' ');
      var lemmaField = sp === -1 ? headFeat : headFeat.slice(0, sp);
      var features = sp === -1 ? '' : headFeat.slice(sp + 1).trim();

      var surfaceRaw = null, lemmaRaw = lemmaField;
      var comma = lemmaField.indexOf(',');
      if (comma !== -1) {
        surfaceRaw = lemmaField.slice(0, comma);
        lemmaRaw = lemmaField.slice(comma + 1);
      }

      out.push({
        pos: posCh,
        posLabel: POS[posCh] || posCh,
        lemma: prettyForm(lemmaRaw, isLatin),
        lemmaRaw: lemmaRaw,
        surface: surfaceRaw ? prettyForm(surfaceRaw, isLatin) : null,
        surfaceRaw: surfaceRaw,
        features: features,
        featureList: features ? features.split(/\s+/) : [],
        dialects: dialects,
        flags: flags,
        stemtype: stemtype
      });
    }
    return out;
  }

  var API = {
    betaToGreek: betaToGreek,
    latinPretty: latinPretty,
    prettyForm: prettyForm,
    greekToBeta: greekToBeta,
    toBetaInput: toBetaInput,
    looksGreek: looksGreek,
    parseAnalyses: parseAnalyses,
    POS: POS
  };

  root.MorphBeta = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
