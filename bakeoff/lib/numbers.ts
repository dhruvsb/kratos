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

function isRunToken(tok: string): boolean {
  return tok in UNIT || tok in TENS || SCALE.has(tok) || CONNECTOR.has(tok);
}

/** Evaluate a maximal run of number-ish tokens to a single number, or null. */
function evaluateRun(tokens: string[]): number | null {
  // --- 1. Digit-sequence reading ("one oh five" → 105) ------------------
  const hasOh = tokens.some((t) => t === 'oh' || t === 'o');
  const hasRealUnit = tokens.some((t) => t in UNIT_DIGIT && t !== 'oh' && t !== 'o');
  if (hasOh && hasRealUnit) {
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
    if (ok && digits.length > 0) return Number(digits.join(''));
    // else fall through to additive grammar
  }

  // --- 2. Additive grammar ---------------------------------------------
  let total = 0;
  let current = 0;
  let frac = 0;
  let hasValue = false;
  let decimalMode = false;
  let decimalDigits = '';

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
      decimalMode = false; // non-digit ends the decimal; reprocess below
    }
    if (t === 'half') {
      frac += 0.5;
      hasValue = true;
      continue;
    }
    if (t === 'quarter') {
      frac += 0.25;
      hasValue = true;
      continue;
    }
    if (t === 'and') continue;
    if (t === 'a' || t === 'an') {
      if (current === 0) current = 1; // "a hundred" → 100; bare "a" stays valueless
      continue;
    }
    if (t in UNIT) {
      current += UNIT[t];
      hasValue = true;
      continue;
    }
    if (t in TENS) {
      current += TENS[t];
      hasValue = true;
      continue;
    }
    if (t === 'hundred') {
      current = (current === 0 ? 1 : current) * 100;
      hasValue = true;
      continue;
    }
    if (t === 'thousand') {
      total += (current === 0 ? 1 : current) * 1000;
      current = 0;
      hasValue = true;
      continue;
    }
    if (t === 'million') {
      total += (current === 0 ? 1 : current) * 1000000;
      current = 0;
      hasValue = true;
      continue;
    }
    // unknown token inside the run — ignore
  }

  if (!hasValue) return null;
  const decimal = decimalDigits ? parseFloat('0.' + decimalDigits) : 0;
  return total + current + frac + decimal;
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
      const value = evaluateRun(run);
      if (value !== null) nums.push(value);
    }
    run = [];
  };

  const rawTokens = text.toLowerCase().replace(/[-–—]/g, ' ').split(/\s+/);
  for (const raw of rawTokens) {
    const tok = cleanToken(raw);
    if (!tok) continue;

    // A token that begins with a digit is its own numeric entity ("35",
    // "12.5", "35kg" → 35). Flush any pending spelled-out run first.
    if (/^\d/.test(tok)) {
      const m = tok.match(/^\d+(?:\.\d+)?/);
      if (m) {
        flush();
        nums.push(Number(m[0]));
        continue;
      }
    }

    if (isRunToken(tok)) {
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
