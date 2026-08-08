// Theme provider + hooks (#17). Resolves the active { color, shadow } from the
// user's preference (system / light / dark) and the OS appearance, and exposes it
// via useTheme(). Phase 1 wires the plumbing only: the light palette is still a
// dark clone (see tokens.ts), so nothing changes visually yet; Phase 2 migrates the
// screens' StyleSheets from the static `color`/`shadow` imports to useTheme().
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, type ColorSchemeName } from 'react-native';
import { themes, type Theme, type ThemeName } from './tokens';
import { useSettings, useUpdateSettings, type ThemeMode } from '@/data/settings';

type ThemeContextValue = {
  /** The resolved palette to render with. */
  theme: Theme;
  /** The resolved theme actually in effect ('light' | 'dark'). */
  name: ThemeName;
  /** The stored preference ('system' | 'light' | 'dark'). */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveName(mode: ThemeMode, system: ColorSchemeName | null): ThemeName {
  if (mode === 'system') return system === 'light' ? 'light' : 'dark';
  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const { mutate: updateSettings } = useUpdateSettings();
  const mode: ThemeMode = settings.data?.themeMode ?? 'system';

  // Appearance.getColorScheme() is synchronous, so first paint already resolves the
  // system branch correctly; the listener keeps it live if the OS theme flips.
  const [system, setSystem] = useState<ColorSchemeName | null>(Appearance.getColorScheme() ?? null);
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme ?? null));
    return () => sub.remove();
  }, []);

  const name = resolveName(mode, system);
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themes[name],
      name,
      mode,
      setMode: (m) => updateSettings({ themeMode: m }),
    }),
    [name, mode, updateSettings]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The active palette. Falls back to dark outside the provider (matches the static
 *  `color`/`shadow` imports) rather than throwing, so a stray consumer can't crash. */
export function useTheme(): Theme {
  return useContext(ThemeContext)?.theme ?? themes.dark;
}

/** The resolved theme name — for the status bar / one-off light-vs-dark branches. */
export function useThemeName(): ThemeName {
  return useContext(ThemeContext)?.name ?? 'dark';
}

/** Read + change the preference — for the Settings control (#17 Phase 3). */
export function useThemeMode(): { mode: ThemeMode; setMode: (m: ThemeMode) => void } {
  const ctx = useContext(ThemeContext);
  return { mode: ctx?.mode ?? 'system', setMode: ctx?.setMode ?? (() => {}) };
}
