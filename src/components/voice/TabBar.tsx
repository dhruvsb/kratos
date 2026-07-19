// Bottom nav from the Home mockup (2e): HOME · HISTORY · SETTINGS, active tab
// carries the LED underline. Only voice-first screens were restyled this pass,
// so SETTINGS has no destination yet and stays inert (it reads as dim anyway).
import { Pressable, Text, View } from 'react-native';
import { color, font, radius, shadow } from '@/theme/tokens';

type Tab = { key: string; label: string; onPress?: () => void };

export function TabBar({ active, tabs }: { active: string; tabs: Tab[] }) {
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
