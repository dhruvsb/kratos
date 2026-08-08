// Bottom nav from the Home mockups: HOME · CALENDAR · HISTORY · SETTINGS, active
// tab carries the LED underline. Presentational only — each caller passes its own
// onPress per tab (SETTINGS now routes to /settings, mockup 18). A tab with no
// onPress is the active/no-op one and reads dim.
import { Pressable, Text, View } from 'react-native';
import { font, radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Tab = { key: string; label: string; onPress?: () => void };

export function TabBar({ active, tabs }: { active: string; tabs: Tab[] }) {
  const { color, shadow } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: color.line,
        backgroundColor: color.s1,
        paddingTop: 12,
        paddingBottom: 26,
      }}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={t.onPress}
            disabled={!t.onPress}
            style={{ flex: 1, alignItems: 'center' }}
          >
            <Text
              style={{
                fontFamily: on ? font.numBold : font.numSemibold,
                fontSize: 13,
                color: on ? color.acc : color.t3,
              }}
            >
              {t.label}
            </Text>
            {on && (
              <View
                style={{
                  width: 20,
                  height: 2,
                  backgroundColor: color.acc,
                  borderRadius: radius.pill,
                  marginTop: 4,
                  ...shadow.glowSm,
                }}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
