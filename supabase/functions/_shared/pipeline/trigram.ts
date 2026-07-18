// Trigram similarity matching Postgres pg_trgm semantics, used by the
// in-memory catalog so the eval harness scores the same fuzzy behavior the
// production RPC produces. pg_trgm: lowercase, split on non-alphanumerics,
// pad each word with two leading and one trailing space, take 3-grams,
// similarity = |shared| / |union| over the trigram SETS.

function trigramsOf(input: string): Set<string> {
  const grams = new Set<string>();
  const words = input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const word of words) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) {
      grams.add(padded.slice(i, i + 3));
    }
  }
  return grams;
}

export function trigramSimilarity(a: string, b: string): number {
  const ta = trigramsOf(a);
  const tb = trigramsOf(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const gram of ta) if (tb.has(gram)) shared++;
  const union = ta.size + tb.size - shared;
  return union === 0 ? 0 : shared / union;
}
