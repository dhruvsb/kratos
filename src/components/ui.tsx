// Tiny unstyled primitives. Black/white/grey only — restyled in a future
// design phase via src/theme/tokens.ts.
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export function Btn({
  title,
  onPress,
  disabled,
  small,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        pressed && styles.btnPressed,
        disabled && styles.btnDisabled,
      ]}
    >
      <Text style={[styles.btnText, small && styles.btnTextSmall]}>{title}</Text>
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color="#000" />
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
  return <Text style={styles.errorText}>Error: {message}</Text>;
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  btnSmall: { paddingVertical: 4, paddingHorizontal: 8 },
  btnPressed: { backgroundColor: '#ddd' },
  btnDisabled: { borderColor: '#999', backgroundColor: '#eee' },
  btnText: { color: '#000', fontSize: 16 },
  btnTextSmall: { fontSize: 13 },
  center: { padding: 24, alignItems: 'center' },
  emptyText: { color: '#666' },
  errorText: { color: '#000', padding: 12, fontStyle: 'italic' },
});
