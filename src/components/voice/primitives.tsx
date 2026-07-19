// LED-instrument primitives for the voice-first screens. Every atom here is a
// direct translation of a treatment in the "RepVoice Voice-First" mockup:
// ghost-segment digits, the level meter, the drain bar, physical keycaps, the
// listening pip, tick rules and parse chips. Colors/timing come from tokens.
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color, font, radius, shadow, tracking } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// LedDigits — a lit value floating over its own dim "ghost segments" (--acc-07
// under --acc), the way a real 7-segment display shows unlit segments.
// ---------------------------------------------------------------------------
export function LedDigits({
  value,
  ghost,
  size,
  lit = color.t1,
  glow = true,
  style,
}: {
  value: string;
  /** The all-segments-lit backdrop. Defaults to value with digits→8. */
  ghost?: string;
  size: number;
  lit?: string;
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const ghostText = ghost ?? value.replace(/[0-9]/g, '8');
  const base: TextStyle = {
    fontFamily: font.numBold,
    fontSize: size,
    lineHeight: size,
    letterSpacing: size > 80 ? tracking.tight : 0.4,
    includeFontPadding: false,
  };
  return (
    <View style={[{ position: 'relative', alignSelf: 'flex-start' }, style]}>
      <Text style={[base, { color: color.acc07 }]}>{ghostText}</Text>
      <Text
        style={[
          base,
          { position: 'absolute', top: 0, left: 0 },
          {
            color: lit,
            textShadowColor: glow ? color.acc35 : 'transparent',
            textShadowRadius: glow ? size * 0.22 : 0,
            textShadowOffset: { width: 0, height: 0 },
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// LevelMeter — the mic-level bar meter. Bars follow a fixed profile; `level`
// (0–1) lights bars amber up to that amplitude, mimicking the mockup's ramp.
// `animating` gives it a slow breathing pulse while the mic is open.
// ---------------------------------------------------------------------------
const METER_PROFILE = [
  0.2, 0.35, 0.55, 0.8, 1, 0.7, 0.9, 0.5, 0.65, 0.4, 0.3, 0.45, 0.25, 0.18, 0.22, 0.15,
];

export function LevelMeter({
  level,
  height = 30,
  animating = false,
  opacity = 1,
  style,
}: {
  /** 0–1 mic amplitude. Omit for the resting (cold) look. */
  level?: number;
  height?: number;
  animating?: boolean;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animating) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animating, pulse]);

  const barOpacity = animating
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] })
    : opacity;

  return (
    <Animated.View
      style={[
        { flexDirection: 'row', alignItems: 'flex-end', gap: 2.5, height, opacity: barOpacity },
        style,
      ]}
    >
      {METER_PROFILE.map((h, i) => {
        const hot = level != null ? h <= level + 0.05 : h >= 0.6;
        const barColor =
          level != null
            ? hot
              ? color.meterHot
              : color.meterCold
            : h >= 0.6
              ? color.meterHot
              : h >= 0.4
                ? color.meterMid
                : color.meterCold;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: `${Math.round(h * 100)}%`,
              backgroundColor: barColor,
              borderRadius: 1,
            }}
          />
        );
      })}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// DrainBar — the auto-commit countdown. `progress` 0→1 is owned by the caller
// (the voice session), so this stays a dumb, controlled bar.
// ---------------------------------------------------------------------------
export function DrainBar({ progress }: { progress: number }) {
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ height: 2, backgroundColor: color.acc07, borderRadius: 1, overflow: 'hidden' }}>
      <View
        style={{
          width: `${pct * 100}%`,
          height: '100%',
          backgroundColor: color.acc,
          ...shadow.glowSm,
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// KeyCap — a raised physical key (MUTE / FLOOR MODE / SAVE / steppers). Accent
// tone gets an LED border + glow; warn is destructive; neutral is default.
// ---------------------------------------------------------------------------
export function KeyCap({
  label,
  onPress,
  tone = 'neutral',
  size = 'md',
  style,
  labelStyle,
}: {
  label: string;
  onPress?: () => void;
  tone?: 'neutral' | 'accent' | 'warn' | 'ghost';
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}) {
  const border =
    tone === 'accent' ? color.acc : tone === 'ghost' ? color.line : color.line2;
  const text =
    tone === 'accent' ? color.acc : tone === 'warn' ? color.warn : tone === 'ghost' ? color.t3 : color.t2;
  const pad = size === 'sm' ? { paddingVertical: 6, paddingHorizontal: 11 } : { paddingVertical: 10, paddingHorizontal: 14 };

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      {({ pressed }) => (
        <LinearGradient
          colors={pressed ? [color.s1, color.sin] : [color.s2, color.s1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[
            {
              borderWidth: 1,
              borderColor: border,
              borderRadius: radius.key,
              alignItems: 'center',
              justifyContent: 'center',
            },
            pad,
            tone === 'ghost' ? null : shadow.key,
            tone === 'accent' ? shadow.glowSm : null,
            pressed && { transform: [{ translateY: 1 }] },
            style,
          ]}
        >
          <Text
            style={[
              {
                fontFamily: font.numSemibold,
                fontSize: size === 'sm' ? 9.5 : 11,
                letterSpacing: tracking.label,
                color: text,
              },
              labelStyle,
            ]}
          >
            {label}
          </Text>
        </LinearGradient>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// StatusPip — the "● LISTENING" affordance. `on` gives the dot its LED bloom.
// ---------------------------------------------------------------------------
export function StatusPip({
  label,
  tone = color.acc,
  on = true,
  spacing = tracking.wide,
}: {
  label: string;
  tone?: string;
  on?: boolean;
  spacing?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: radius.pill,
          backgroundColor: tone,
          ...(on ? { shadowColor: tone, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } } : null),
        }}
      />
      <Text
        style={{
          fontFamily: font.numSemibold,
          fontSize: 9,
          letterSpacing: spacing,
          color: tone,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// TickRule — the fine measurement rule under the floor-mode timer. Approximates
// the mockup's repeating-linear-gradient with evenly spaced 1px marks.
// ---------------------------------------------------------------------------
export function TickRule({ width = 200, marks = 28 }: { width?: number; marks?: number }) {
  return (
    <View style={{ width, height: 2, flexDirection: 'row', justifyContent: 'space-between' }}>
      {Array.from({ length: marks }).map((_, i) => (
        <View key={i} style={{ width: 1, height: 2, backgroundColor: color.tick }} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// ParseChip — a lit slot token (BENCH / 80.0 KG / × 8). `dashed` = still-empty
// slot the CLARIFY step is asking about.
// ---------------------------------------------------------------------------
export function ParseChip({
  label,
  state = 'lit',
}: {
  label: string;
  state?: 'lit' | 'dashed' | 'idle';
}) {
  const lit = state === 'lit';
  return (
    <View
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: radius.chip,
        borderWidth: 1,
        borderColor: lit ? color.acc : color.line2,
        borderStyle: state === 'dashed' ? 'dashed' : 'solid',
        ...(lit ? shadow.glowSm : null),
      }}
    >
      <Text
        style={{
          fontFamily: font.numBold,
          fontSize: 13,
          letterSpacing: 0.4,
          color: lit ? color.acc : color.t3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// A recessed inset well (the SESSION TAPE / stepper backdrop): dark inset tint +
// hairline. Stands in for CSS inset box-shadow, which RN can't render.
export function InsetWell({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: color.sin,
          borderWidth: 1,
          borderColor: color.line,
          borderRadius: radius.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
