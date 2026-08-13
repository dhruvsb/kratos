/**
 * Word Error Rate via word-level Levenshtein edit distance with a backtrace
 * that classifies each edit as a substitution, deletion, or insertion.
 * WER = (sub + del + ins) / refLen. O(n*m) time and space.
 */
export function computeWer(
  refWords: string[],
  hypWords: string[]
): { wer: number; sub: number; del: number; ins: number; refLen: number } {
  const n = refWords.length;
  const m = hypWords.length;

  // dp[i][j] = edit distance between refWords[0..i) and hypWords[0..j).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i; // i deletions
  for (let j = 0; j <= m; j++) dp[0][j] = j; // j insertions

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = refWords[i - 1] === hypWords[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + cost, // match / substitution
        dp[i - 1][j] + 1, // deletion (ref word not in hyp)
        dp[i][j - 1] + 1 // insertion (hyp word not in ref)
      );
    }
  }

  // Backtrace to count the edit types.
  let sub = 0;
  let del = 0;
  let ins = 0;
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = refWords[i - 1] === hypWords[j - 1] ? 0 : 1;
      if (dp[i][j] === dp[i - 1][j - 1] + cost) {
        if (cost === 1) sub++;
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      del++;
      i--;
      continue;
    }
    // remaining case: insertion
    ins++;
    j--;
  }

  const refLen = n;
  const wer = refLen === 0 ? 0 : (sub + del + ins) / refLen;
  return { wer, sub, del, ins, refLen };
}
