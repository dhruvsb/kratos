// Loads the two design-system font families (Instrument Sans = f-ui,
// Geist Mono = f-num). The family KEYS here must match the fontFamily
// strings in src/theme/tokens.ts (`font.*`) exactly — that's the contract.
//
// Kept separate from tokens.ts so importing a color/spacing token never drags
// the (heavy) bundled TTFs into a module that doesn't render text.
import { useFonts } from 'expo-font';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import {
  GeistMono_400Regular,
  GeistMono_500Medium,
  GeistMono_600SemiBold,
  GeistMono_700Bold,
} from '@expo-google-fonts/geist-mono';

/** Returns [loaded, error]. The root layout gates first paint on `loaded`. */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    GeistMono_600SemiBold,
    GeistMono_700Bold,
  });
}
