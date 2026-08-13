// The microphone glyph from the "Voice Logging" design — the FAB icon on Home and
// the big ring icon on the recorder. One source so both stay identical.
import Svg, { Path, Rect } from 'react-native-svg';

export function MicGlyph({
  size = 24,
  color,
  strokeWidth = 1.8,
}: {
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={9.1}
        y={2.6}
        width={5.8}
        height={10.6}
        rx={2.9}
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Path
        d="M5.6 11.1a6.4 6.4 0 0 0 12.8 0"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 17.5v3.9"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
