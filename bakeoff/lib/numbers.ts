/**
 * Numeric-entity extraction and word normalization for the ASR scoring.
 *
 * `extractNumbers` turns a transcript into the ordered list of numeric ENTITIES
 * it contains — a digit run ("35", "12.5") is one entity, and a spelled-out
 * phrase ("thirty-five", "one hundred and five", "twelve and a half") collapses
 * to one entity too. This is what drives the Numeric Entity Error Rate, so the
 * word→number machine below is deliberately explicit rather than clever.
 *
 * Algorithm (word path): walk the tokens accumulating a "run" of number-ish
 * tokens (units/teens/tens/scales + the connectors and/a/oh/point/half). A run
 * is broken by any ordinary word or by a bare digit token. Each run is then
 * evaluated:
 *   1. Digit-sequence reading first — if the run contains "oh"/"o" plus a real
 *      unit word, it is a spoken digit string ("one oh five" → 1,0,5 → 105).
 *   2. Otherwise additive grammar — units/teens add into a hundreds "current",
 *      "hundred" multiplies it by 100, "thousand"/"million" commit it to a
 *      running total, "point"/"and a half" contribute the fractional part.
 * A run with no actual numeric value (e.g. a stray "and") yields nothing.
 */

const UNIT: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

/** Single spoken digits (0–9) used for the "one oh five" digit-sequence path. */
const UNIT_DIGIT: Record<string, number> = {
  zero: 0, oh: 0, o: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9,
};

const SCALE = new Set(['hundred', 'thousand', 'million']);
const CONNECTOR = new Set(['and', 'a', 'an', 'oh', 'o', 'point', 'half', 'quarter']);
const BIGSCALE: Record<string, number> = { thousand: 1000, million: 1_000_000 };

function isRunToken(tok: string): boolean {
  return tok in UNIT || tok in TENS || SCALE.has(tok) || CONNECTOR.has(tok);
}

/** Category of a value-bearing token, for the attach/split grammar below. */
type Cat = 'smallunit' | 'ten' | 'teen' | 'tens' | 'hundred' | 'bigscale' | 'digit';

function categorize(tok: string): { cat: Cat; val: number } | null {
  if (/^\d/.test(tok)) {
    const m = tok.match(/^\d+(?:\.\d+)?/);
    return m ? { cat: 'digit', val: Number(m[0]) } : null;
  }
  if (tok in UNIT) {
    const v = UNIT[tok];
    if (v <= 9) return { cat: 'smallunit', val: v };
    if (v === 10) return { cat: 'ten', val: 10 };
    return { cat: 'teen', val: v }; // 11–19
  }
  if (tok in TENS) return { cat: 'tens', val: TENS[tok] };
  if (tok === 'hundred') return { cat: 'hundred', val: 100 };
  if (tok in BIGSCALE) return { cat: 'bigscale', val: BIGSCALE[tok] };
  return null;
}

/**
 * Evaluate a maximal run of number-ish tokens into ZERO OR MORE numbers.
 *
 * The run can hold several distinct spoken numbers with no separating word,
 * e.g. "twelve sixty" (a rep count then a weight) → [12, 60], so this returns a
 * list. A new number is started whenever the next value token cannot legally
 * extend the current one (see `canAttach`). Two domain-specific rules:
 *   - Colloquial hundreds: a small unit (1–9) directly followed by a tens word
 *     means hundreds — "one twenty" → 120, "two fifty" → 250 (but "twenty one"
 *     stays 21, and "ten"/"teens" never trigger it: "ten sixty" → [10, 60]).
 *   - A fraction/decimal ("and a half", "point five") attaches to the number in
 *     progress even when that number came from a digit token ("67 and a half"
 *     → 67.5), and a bare "a half" is 0.5, never 1.5.
 */
function evaluateRunMulti(tokens: string[]): number[] {
  // --- Digit-sequence reading ("one oh five" → 105), pure-word runs only --
  const hasDigitTok = tokens.some((t) => /^\d/.test(t));
  const hasOh = tokens.some((t) => t === 'oh' || t === 'o');
  const hasRealUnit = tokens.some((t) => t in UNIT_DIGIT && t !== 'oh' && t !== 'o');
  if (!hasDigitTok && hasOh && hasRealUnit) {
    const digits: number[] = [];
    let ok = true;
    for (const t of tokens) {
      if (t in UNIT_DIGIT) digits.push(UNIT_DIGIT[t]);
      else if (t === 'and' || t === 'a' || t === 'an') continue;
      else {
        ok = false;
        break;
      }
    }
    if (ok && digits.length > 0) return [Number(digits.join(''))];
  }

  const results: number[] = [];
  let current = 0;
  let total = 0; // committed thousands/millions
  let frac = 0;
  let decimalDigits = '';
  let hasValue = false;
  let decimalMode = false;
  let lastCat: Cat | null = null;

  const emit = () => {
    if (hasValue) {
      const dec = decimalDigits ? parseFloat('0.' + decimalDigits) : 0;
      results.push(total + current + frac + dec);
    }
    current = 0;
    total = 0;
    frac = 0;
    decimalDigits = '';
    hasValue = false;
    decimalMode = false;
    lastCat = null;
  };

  const canAttach = (cat: Cat): boolean => {
    switch (cat) {
      case 'hundred':
        return lastCat === 'smallunit' || lastCat === 'teen' || lastCat === 'ten';
      case 'bigscale':
        return lastCat !== null;
      case 'smallunit':
        return lastCat === 'tens' || lastCat === 'hundred';
      case 'tens':
        return lastCat === 'smallunit' /* colloquial */ || lastCat === 'hundred';
      case 'teen':
      case 'ten':
        return lastCat === 'hundred';
      default:
        return false; // 'digit' never attaches to a prior number
    }
  };

  for (const t of tokens) {
    if (t === 'point') {
      decimalMode = true;
      continue;
    }
    if (decimalMode) {
      if (t in UNIT_DIGIT) {
        decimalDigits += String(UNIT_DIGIT[t]);
        hasValue = true;
        continue;
      }
      if (/^\d$/.test(t)) {
        decimalDigits += t;
        hasValue = true;
        continue;
      }
      decimalMode = false; // non-digit ends the decimal; reprocess token below
    }
    if (t === 'half') {
      frac += 0.5;
      hasValue = true;
      lastCat = lastCat ?? 'smallunit';
      continue;
    }
    if (t === 'quarter') {
      frac += 0.25;
      hasValue = true;
      lastCat = lastCat ?? 'smallunit';
      continue;
    }
    if (t === 'and' || t === 'a' || t === 'an' || t === 'oh' || t === 'o') continue;

    const c = categorize(t);
    if (!c) continue; // unknown token inside the run — ignore

    if (hasValue && !canAttach(c.cat)) emit();

    if (!hasValue) {
      // start a fresh number
      if (c.cat === 'hundred') current = 100;
      else if (c.cat === 'bigscale') total = c.val;
      else current = c.val;
      hasValue = true;
      lastCat = c.cat;
      continue;
    }

    // attach to the number in progress
    switch (c.cat) {
      case 'smallunit':
        current += c.val;
        lastCat = 'smallunit';
        break;
      case 'tens':
        if (lastCat === 'smallunit') current = current * 100 + c.val; // colloquial
        else current += c.val; // after hundred
        lastCat = 'tens';
        break;
      case 'teen':
      case 'ten':
        current += c.val; // after hundred
        lastCat = c.cat;
        break;
      case 'hundred':
        current = (current === 0 ? 1 : current) * 100;
        lastCat = 'hundred';
        break;
      case 'bigscale':
        total += (current === 0 ? 1 : current) * c.val;
        current = 0;
        lastCat = 'bigscale';
        break;
      case 'digit':
        current = c.val; // unreachable (digit never attaches) but keeps types total
        lastCat = 'digit';
        break;
    }
  }
  emit();
  return results;
}

/** Strip surrounding punctuation while preserving an inner decimal point. */
function cleanToken(raw: string): string {
  return raw
    .replace(/^[^\p{L}\p{N}.]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '');
}

/**
 * Extract every numeric entity from `text`, in order, as canonical numbers.
 * Units and non-number words are ignored (they act as entity boundaries).
 */
export function extractNumbers(text: string): number[] {
  const nums: number[] = [];
  let run: string[] = [];

  const flush = () => {
    if (run.length > 0) {
      for (const value of evaluateRunMulti(run)) nums.push(value);
    }
    run = [];
  };

  const rawTokens = text.toLowerCase().replace(/[-–—]/g, ' ').split(/\s+/);
  for (const raw of rawTokens) {
    const tok = cleanToken(raw);
    if (!tok) continue;

    // Digit tokens ("35", "12.5", "35kg") and spelled-out number words both
    // belong to the run — evaluateRunMulti splits a run into as many numbers as
    // it actually holds, so a trailing "and a half" can attach to "67".
    if (/^\d/.test(tok) || isRunToken(tok)) {
      run.push(tok);
      continue;
    }

    // Ordinary word — boundary.
    flush();
  }
  flush();

  return nums;
}

/**
 * Lowercase, strip punctuation (keeping decimal points inside numbers),
 * collapse whitespace, and split into word tokens for WER.
 */
export function normalizeWords(text: string): string[] {
  const lowered = text.toLowerCase();
  // Replace every non-word char with a space, EXCEPT a '.'/',' sitting between
  // two digits (an inner decimal point), which is normalized to '.' and kept.
  const cleaned = lowered.replace(/[^\p{L}\p{N}\s]/gu, (match: string, offset: number) => {
    if (match === '.' || match === ',') {
      const prev = lowered[offset - 1] ?? '';
      const next = lowered[offset + 1] ?? '';
      if (/\d/.test(prev) && /\d/.test(next)) return '.';
    }
    return ' ';
  });
  return cleaned.trim().split(/\s+/).filter(Boolean);
}
