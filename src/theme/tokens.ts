// Placeholder theme tokens. Phases 1–3 are intentionally unstyled:
// plain components, default fonts, black/white/grey only.
// A future design phase fills this in and screens migrate to it.
export const tokens = {
  // TODO(design): colors — brand palette, semantic colors (success/danger), dark mode
  colors: {},
  // TODO(design): spacing scale (4/8/12/16...)
  spacing: {},
  // TODO(design): typography — font family, sizes, weights
  typography: {},
} as const;

export type Tokens = typeof tokens;
