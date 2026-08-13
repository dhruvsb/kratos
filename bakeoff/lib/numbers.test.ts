/**
 * Regression tests for extractNumbers — the NEER scorer rests entirely on this.
 * Run: npx tsx bakeoff/lib/numbers.test.ts  (exit 0 = pass, 1 = fail)
 *
 * Every case here was a real transcript line from the first 10-recording
 * bakeoff. The ones marked BUG were mis-parsed by the original single-number
 * parser and made correct ASR output score as wrong (e.g. Groq's perfect number
 * accuracy showed as 5.6% NEER) until the multi-number/colloquial-hundreds
 * rewrite on 2026-08-13.
 */
import { extractNumbers } from './numbers.ts';

const cases: Array<[string, number[]]> = [
  // BUG: "twelve sixty" was summed to 72; "ten sixty five" to 75.
  ['fifty five for twelve, sixty for ten, sixty five for eight', [55, 12, 60, 10, 65, 8]],
  // BUG: colloquial hundreds "one twenty"/"one forty" parsed as 21/53.
  ['one twenty for twelve, one forty for ten', [120, 12, 140, 10]],
  // BUG: a fraction after a digit token didn't attach ("67 and a half" → 67,1.5).
  ['67 and a half', [67.5]],
  ['65 for 6, actually no wait that second one was 67.5', [65, 6, 1, 67.5]],
  ['sixty five for six, actually no wait, that second one was sixty seven and a half', [65, 6, 1, 67.5]],
  // Standard forms that must keep working.
  ['one hundred and forty kilos for five reps', [140, 5]],
  ['thirty two point five kilos, three sets', [32.5, 3]],
  ['twenty five kilos, two sets of eight', [25, 2, 8]],
  ['thirty-five kilos', [35]],
  ['one hundred and five for five', [105, 5]],
  ['twelve and a half kilos', [12.5]],
  ['one oh five kilos for five', [105, 5]],
  ['eighteen kilos each hand, three sets of ten', [18, 3, 10]],
  ['a hundred for five', [100, 5]],
  ['ninety for eight, then a hundred for five', [90, 8, 100, 5]],
  // "ten"/teens never trigger colloquial hundreds.
  ['ten sixty for eight', [10, 60, 8]],
  ['nineteen ninety', [19, 90]],
  // Bare digit sequences stay separate.
  ['39 for 12, 45 for 10, 50 for 8', [39, 12, 45, 10, 50, 8]],
];

let failed = 0;
for (const [text, expected] of cases) {
  const got = extractNumbers(text);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? '✅' : '❌'} ${JSON.stringify(got)}${ok ? '' : `  want ${JSON.stringify(expected)}`}  «${text}»`);
}
console.log(failed ? `\n${failed} FAILED` : `\n${cases.length} passed`);
process.exit(failed ? 1 : 0);
