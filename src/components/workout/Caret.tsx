// The blinking LED caret (the mockup's `@keyframes led` 1px accent bar). Pulled out
// so any field can drop one in; step(1s) blink keeps it cheap and on-brand.
import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export function Caret({ height = 24, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const { color } = useTheme();
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.35, duration: 550, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);
  return (
    <Animated.View
      style={[{ width: 2, height, backgroundColor: color.acc, opacity: blink, borderRadius: 1 }, style]}
    />
  );
}
