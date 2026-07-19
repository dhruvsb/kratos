// Loads the two design-system font families (Space Grotesk = f-ui,
// IBM Plex Mono = f-num). The family KEYS here must match the fontFamily
// strings in src/theme/tokens.ts (`font.*`) exactly — that's the contract.
//
// Kept separate from tokens.ts so importing a color/spacing token never drags
// the (heavy) bundled TTFs into a module that doesn't render text.
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';

/** Returns [loaded, error]. The root layout gates first paint on `loaded`. */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
  });
}
