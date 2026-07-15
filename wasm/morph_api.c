/*
 * Browser entry point for the WebAssembly build of Morpheus.
 *
 * cruncher's main() reads words from stdin and streams results to stdout,
 * which is awkward to drive from a long-lived browser session. Instead we
 * expose a single reentrant call, morph_analyze(), that mirrors exactly what
 * main() does for one input line and returns the text cruncher would have
 * printed for that word (the echo line plus <NL>...</NL> analyses in the
 * PERSEUS output format).
 *
 * IMPORTANT: Morpheus selects its language once via set_lang() and then caches
 * index/table data in process-global state keyed only by short filename (see
 * src/morphlib/morphpath.c + the retrentry/endindex loaders). The original
 * batch tool never switches language mid-process, so the caches are only safe
 * for a single language per instance. The browser harness therefore uses one
 * module instance per language (see index.html), and this function always sets
 * the language to match its instance before analyzing.
 */
#define _GNU_SOURCE 1
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <emscripten.h>
#include <prntflags.h>

/* Implemented across the Morpheus static libraries. These are old K&R
 * functions with an implicit `int` return; the return types must match the
 * definitions exactly or wasm-ld emits trapping signature-mismatch stubs. */
extern int   checkstring(char *string, PrntFlags prntflags, FILE *fout);
extern char *anal_buf(void);
extern int   set_lang(int n);
extern int   trimwhite(char *s);
extern int   stripbreath(char *s);
extern int   addbreath(char *s, int c);

/* Defined in stdiomorph.c (the CLI main), which this build omits; checkword.o
 * in anal.a references it via `extern quickflag`. */
int quickflag = 0;

/* trimdigit() is static inside stdiomorph.c; replicate it here. */
static void trim_trailing_digits(char *s)
{
    char *p = s;
    if (!*s) return;
    while (*s) s++;
    s--;
    while (isdigit((unsigned char)*s) && s > p) *s-- = 0;
}

/*
 * word           beta-code word to analyze
 * latin          0 = Greek, nonzero = Latin
 * ignore_accents nonzero mirrors the `-n` flag (IGNORE_ACCENTS + the Greek
 *                breathing-mark retry that main() performs)
 *
 * Returns a heap buffer the JS caller must free() (via Module._free). Empty
 * string means "no analyses" (word not recognized).
 */
EMSCRIPTEN_KEEPALIVE
char *morph_analyze(const char *word, int latin, int ignore_accents)
{
    char line[BUFSIZ * 4];
    char *outbuf = NULL;
    size_t outsize = 0;
    FILE *mem;
    char *p;
    int rval;
    /* Default flags are (PERSEUS_FORMAT|STRICT_CASE); the `-S` option clears
     * STRICT_CASE, which is the mode the README examples and the web UI use. */
    PrntFlags flags = PERSEUS_FORMAT;

    if (!word) return strdup("");

    set_lang(latin ? LATIN : GREEK);
    if (ignore_accents) flags |= IGNORE_ACCENTS;

    strncpy(line, word, sizeof line - 1);
    line[sizeof line - 1] = '\0';

    trimwhite(line);
    if (line[0] == '\0') return strdup("");
    trim_trailing_digits(line);

    /* main() keeps only the first whitespace-delimited token. */
    p = line;
    while (*p && !isspace((unsigned char)*p)) p++;
    *p = '\0';
    if (line[0] == '\0') return strdup("");

    mem = open_memstream(&outbuf, &outsize);
    if (!mem) return strdup("");

    rval = checkstring(line, flags, mem);

    /* Greek + IGNORE_ACCENTS: retry with each breathing mark, exactly as
     * main() does, so unaccented/unbreathed input still resolves. */
    if (!latin && !rval && (flags & IGNORE_ACCENTS)) {
        char tmp[BUFSIZ];
        strncpy(tmp, line, sizeof tmp - 1);
        tmp[sizeof tmp - 1] = '\0';
        stripbreath(tmp);
        addbreath(tmp, ')');
        rval = checkstring(tmp, flags, mem);
        if (!rval) {
            stripbreath(tmp);
            addbreath(tmp, '(');
            rval = checkstring(tmp, flags, mem);
        }
    }

    /* PERSEUS format writes straight to `mem`; anal_buf() is empty in that mode
     * but appending it keeps this correct if the format flags ever change. */
    if (rval)
        fputs(anal_buf(), mem);

    fclose(mem); /* flushes and finalizes outbuf/outsize */

    return outbuf ? outbuf : strdup("");
}
