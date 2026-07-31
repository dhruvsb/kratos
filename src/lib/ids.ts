// Client-side UUID v4 generation — what lets "start workout" navigate before the
// server answers: the client picks the row ids, seeds the cache with them, and the
// background insert writes the same ids, so everything the user touches references
// rows that will exist. Prefer the platform's CSPRNG (web + modern Hermes); fall
// back to Math.random on runtimes without WebCrypto. That fallback is fine here:
// ids only need uniqueness within one user's rows (RLS scopes by user_id, id
// secrecy is never a security boundary), and the format stays a valid v4 UUID.
export function newUuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}
