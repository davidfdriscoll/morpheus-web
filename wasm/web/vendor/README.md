# Vendored dependency

`beta-code.js` — [beta-code-js](https://www.npmjs.com/package/beta-code-js) v3.1.0
(MIT, zero-dependency). UMD bundle copied verbatim from the package's
`bundle/beta-code.js`. Exposes `window.BetaCode = { greekToBetaCode, betaCodeToGreek }`.

Used by `../betacode.js` as the Unicode⇄Beta Code engine. Morpheus-specific
handling (elision apostrophe, quantity/homonym markers, Latin) wraps it there.
