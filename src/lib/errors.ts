// One place that decides what an error is allowed to say to a user.
//
// Raw throw sites here are native/SDK/Postgres errors — "UnexpectedException: The
// file "recording-EFE6…m4a" couldn't be opened … (at ExpoModulesCore/
// AsyncFunctionDefinition.swift:126)", "duplicate key value violates unique
// constraint", "Network request failed". Surfacing those verbatim reads as a
// half-built app (and leaks internals), so every user-visible catch routes its
// message through `userMessage()` instead of `e.message`.
//
// The rule: a message is shown ONLY if it already reads like a sentence a person
// wrote. Anything that smells like machine output falls back to the caller's own
// plain-English line.

/** Fragments that mark a message as machine output — never shown to a user. */
const TECHNICAL = [
  /\b(exception|stack|traceback|assert)/i,
  /\b\w+Error\b/, // TypeError, AbortError, PostgrestError…
  /\.(swift|kt|java|m|mm|cpp|ts|tsx|js|jsx):\d+/i, // source locations
  /\b(at|in)\s+\w+\/\w+/, // "at ExpoModulesCore/AsyncFunctionDefinition"
  /\b(null|undefined|NaN)\b/,
  /\b(constraint|violates|duplicate key|SQLSTATE|PGRST|relation|column|row-level)\b/i,
  /\b(HTTP|status(?: code)?\s*\d{3}|\d{3}\s+(Bad|Unauthorized|Forbidden|Not Found|Internal))/,
  /\b(JSON|URI|URL|UUID|API|SDK|token|payload|socket|fetch failed|ECONN|ETIMEDOUT)\b/,
  /[{}<>[\]\\]|https?:\/\/|\/[\w.-]+\/[\w.-]+/, // braces, markup, paths, links
];

/** A human sentence is short, mostly words, and not one of the above. */
function looksHuman(msg: string): boolean {
  if (msg.length < 4 || msg.length > 120) return false;
  if (TECHNICAL.some((re) => re.test(msg))) return false;
  // Mostly letters/spaces/basic punctuation — no hex blobs or identifiers.
  return /^[\p{L}\p{N} ’'"“”,.:;!?()%–—+-]+$/u.test(msg);
}

/** Known raw errors worth translating rather than discarding. */
const TRANSLATIONS: [RegExp, string][] = [
  [/network request failed|offline|internet|ECONN|ETIMEDOUT|timed? ?out/i,
    'No connection. Check your network and try again.'],
  [/(microphone|audio|health|camera)[^.]*\b(permission|denied|not authoriz)|permission[^.]*\b(microphone|audio|health|camera)/i,
    'Kratos doesn’t have access yet. You can grant it in iOS Settings.'],
  [/couldn.t be opened|no such file|file (does not|doesn.t) exist/i,
    'That recording couldn’t be read. Try recording again.'],
  [/rate ?limit|too many requests/i, 'Too many attempts. Wait a moment and try again.'],
];

/**
 * The message to show a user for a caught error.
 * @param e        whatever was caught
 * @param fallback plain-English line to show when the raw error isn't presentable
 */
export function userMessage(e: unknown, fallback: string): string {
  const raw = (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim();
  if (!raw) return fallback;
  for (const [re, msg] of TRANSLATIONS) if (re.test(raw)) return msg;
  return looksHuman(raw) ? raw : fallback;
}
