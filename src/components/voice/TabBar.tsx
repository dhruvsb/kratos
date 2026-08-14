// Bottom nav — the "RepVoice Home" design (single-line + liquid-glass tabs). A floating
// translucent **glass pill** carrying three tabs (HOME · ROUTINES · SETTINGS), the active
// one lit by a brighter inner glass chip. On Home a separate green-glass `+` FAB sits to
// its right (rendered by HomeQuickStart), so the pill leaves a gap for it (`withFab`).
//
// Glass is real iOS-26 Liquid Glass via expo-glass-effect; on anything older
// `isLiquidGlassAvailable()` is false and we render an opaque token pill (same shape,
// no translucency) so Android / older iOS / the physical iPhone 15 stay coherent.
// Either way the pill floats over the content, which scrolls underneath — every screen
// insets its scroll content by TAB_BAR_HEIGHT so the last row clears the chrome.
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { router } from 'expo-router';
import { type ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { font } from '@/theme/tokens';
import { useTheme, useThemeName } from '@/theme/ThemeProvider';

// Bottom clearance the floating chrome needs (pill sits at bottom:24, ~56 tall). Screens
// add this to their scroll content's paddingBottom.
export const TAB_BAR_HEIGHT = 100;

// Translucent white highlight for the glass chip — a *material* effect (like a shadow),
// not a brand color, so it lives inline rather than as a palette token (cf. the scrim
// rgba in HomeQuickStart). Brighter on light, a faint lift on dark.
const chipGlass = (light: boolean) => (light ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.16)');

type IconProps = { color: string };
function HomeIcon({ color }: IconProps) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3.5 10.4 12 3.8l8.5 6.6V20a1 1 0 0 1-1 1h-4.6v-6.2H9.1V21H4.5a1 1 0 0 1-1-1z" />
    </Svg>
  );
}
function RoutinesIcon({ color }: IconProps) {
  // Dumbbell (decision 2d): outlined plates each side of a filled bar — fitness-native
  // and legible at 23px, distinct from the equalizer it replaces.
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={8.6} width={2.4} height={6.8} rx={1} stroke={color} strokeWidth={1.6} />
      <Rect x={6.4} y={6} width={2.9} height={12} rx={1.2} stroke={color} strokeWidth={1.6} />
      <Rect x={9.3} y={10.9} width={5.4} height={2.2} rx={1} fill={color} />
      <Rect x={14.7} y={6} width={2.9} height={12} rx={1.2} stroke={color} strokeWidth={1.6} />
      <Rect x={18.6} y={8.6} width={2.4} height={6.8} rx={1} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}
function SettingsIcon({ color }: IconProps) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3.5 7h5M12.5 7H20.5M3.5 17h9M16.5 17h4" />
      <Circle cx={10.5} cy={7} r={2.2} />
      <Circle cx={14.5} cy={17} r={2.2} />
    </Svg>
  );
}

type TabKey = 'home' | 'routines' | 'account';
const TABS: { key: TabKey; label: string; route: '/' | '/routines' | '/settings'; Icon: (p: IconProps) => ReactElement }[] = [
  { key: 'home', label: 'Home', route: '/', Icon: HomeIcon },
  { key: 'routines', label: 'Routines', route: '/routines', Icon: RoutinesIcon },
  { key: 'account', label: 'Settings', route: '/settings', Icon: SettingsIcon },
];

// `withFab` (Home only) shrinks the pill's right edge to leave room for the FAB + gap.
export function HomeTabBar({ active, withFab = false }: { active: TabKey; withFab?: boolean }) {
  const { color, shadow } = useTheme();
  const themeName = useThemeName();
  const light = themeName === 'light';
  const glass = isLiquidGlassAvailable();

  const rightInset = withFab ? 96 : 14; // 72 FAB + 10 gap + 14 margin (design "Voice Logging" 1a)

  const items = TABS.map((t) => {
    const on = t.key === active;
    // Quiet until active (decision 2d): inactive tabs sit at secondary ink, the
    // active one lifts to the accent inside its brighter glass chip.
    const tone = on ? color.acc : color.t2;
    const content = (
      <>
        <t.Icon color={tone} />
        <Text
          style={{
            fontFamily: on ? font.uiSemibold : font.uiMedium,
            fontSize: 10.5,
            letterSpacing: 0.1,
            color: tone,
          }}
        >
          {t.label}
        </Text>
      </>
    );
    return (
      <Pressable
        key={t.key}
        onPress={on ? undefined : () => router.replace(t.route as '/')}
        disabled={on}
        style={{
          flex: 1,
          alignItems: 'center',
          gap: 5,
          paddingVertical: 7,
          borderRadius: 22,
          // Active tab: a brighter inner chip. Glass builds → translucent white lift;
          // fallback → the raised s2 surface so the selection still reads.
          backgroundColor: on ? (glass ? chipGlass(light) : color.s2) : 'transparent',
        }}
      >
        {content}
      </Pressable>
    );
  });

  const pillLayout = {
    position: 'absolute' as const,
    left: 14,
    right: rightInset,
    bottom: 24,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 34,
  };

  if (glass) {
    return (
      // isInteractive lets the material react to touch (the liquid morph/highlight),
      // closer to the native tab bar's feel than a static frosted panel.
      <GlassView glassEffectStyle="regular" isInteractive colorScheme={themeName} style={pillLayout}>
        {items}
      </GlassView>
    );
  }
  // Opaque fallback: a solid floating pill (still elevated, just not translucent).
  return (
    <View style={[pillLayout, { backgroundColor: color.s1, borderWidth: 1, borderColor: color.line, ...shadow.cta }]}>
      {items}
    </View>
  );
}

// Back-compat shim: the retired calendar/history routes still import <TabBar>. They map
// to the same 3-tab pill (their active tab is 'home' since they live under Home now).
export function TabBar({ active }: { active: string }) {
  const key: TabKey = active === 'routines' ? 'routines' : active === 'account' ? 'account' : 'home';
  return <HomeTabBar active={key} />;
}
