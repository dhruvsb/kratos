// Shared primitives, on the LED-instrument theme (tokens.ts). Restyled from the
// old black/white placeholders during the manual-first design pass — every
// Phase-1 screen that leans on Btn/Loading/Empty/ErrorText darkens with this file.
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, radius, space, tracking } from '@/theme/tokens';

export function Btn({
  title,
  onPress,
  disabled,
  small,
  tone = 'neutral',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  small?: boolean;
  tone?: 'neutral' | 'accent' | 'warn';
}) {
  const border = tone === 'accent' ? color.acc35 : color.line2;
  const text = tone === 'accent' ? color.acc : tone === 'warn' ? color.warn : color.t2;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { borderColor: border },
        small && styles.btnSmall,
        pressed && styles.btnPressed,
        disabled && styles.btnDisabled,
      ]}
    >
      <Text style={[styles.btnText, { color: disabled ? color.t3 : text }, small && styles.btnTextSmall]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={color.acc} />
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return <Text style={styles.errorText}>{message}</Text>;
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderRadius: radius.ctl,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.s2,
  },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: radius.keySm },
  btnPressed: { backgroundColor: color.s1 },
  btnDisabled: { borderColor: color.line, backgroundColor: color.s0 },
  btnText: { fontFamily: font.numSemibold, fontSize: 12, letterSpacing: tracking.label },
  btnTextSmall: { fontSize: 10 },
  center: { padding: space.xxl, alignItems: 'center' },
  emptyText: { fontFamily: font.num, fontSize: 12, color: color.t3 },
  errorText: { fontFamily: font.num, fontSize: 12, color: color.warn, padding: space.md },
});
