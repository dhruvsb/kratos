// Single source of truth for the app's public web URLs. Centralised so the
// in-app links can never drift from what's entered in App Store Connect (a broken
// in-app Privacy Policy link reads to Apple as a missing policy = 5.1.1 rejection).
//
// These are hosted on GitHub Pages under `/legal/` — the path segment is REQUIRED.
// The Privacy Policy URL here MUST match App Store Connect → App Information →
// Privacy Policy URL exactly.
export const PRIVACY_POLICY_URL = 'https://dhruvsb.github.io/kratos/legal/privacy-policy.html';
export const SUPPORT_URL = 'https://dhruvsb.github.io/kratos/legal/support.html';
