/**
 * InkTrick - Icon set
 * Brush-stroke icons inspired by Japanese ink painting (sumi-e): ensō circles, sakura, bamboo,
 * makimono scrolls and Mt. Fuji. All drawn on a 24x24 grid with rounded strokes.
 */
import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

const STROKE = 1.9;

function Base({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

const stroke = (color: string, width = STROKE) => ({
  stroke: color,
  strokeWidth: width,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/** Favorite: sakura blossom (five notched petals). */
export const StarIcon: React.FC<IconProps & { filled?: boolean }> = ({ size = 20, color = '#FFFFFF', filled = false }) => {
  const petal = 'M12 11.2c-1.7-1.6-2.6-3.6-2.1-5.6.3-1.2 1.2-1.9 2.1-1.4.9-.5 1.8.2 2.1 1.4.5 2-.4 4-2.1 5.6Z';
  return (
    <Base size={size}>
      {[0, 72, 144, 216, 288].map(angle => (
        <Path
          key={angle}
          d={petal}
          {...stroke(color, 1.5)}
          fill={filled ? color : 'none'}
          transform={`rotate(${angle} 12 12.4)`}
        />
      ))}
      <Circle cx={12} cy={12.4} r={1.1} fill={filled ? '#0A0A0A' : color} />
    </Base>
  );
};

/** Mark as read: a single brush check stroke. */
export const CheckDoneIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M4.5 12.8c1.6.9 3 2.2 4.2 3.9C11 11.6 14.6 7.6 19.6 5.2" {...stroke(color, 2.1)} />
  </Base>
);

/** Change cover: a framed ink painting of Mt. Fuji. */
export const ImageIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M4 5.5h16v13H4z" {...stroke(color, 1.7)} />
    <Path d="M5.5 17l4.6-6.8 1.5 1.3 1.6-1.4L18.5 17" {...stroke(color, 1.6)} />
    <Path d="M9 11.8l1.1.9 1.5-1.2 1.6 1.2 1-.8" {...stroke(color, 1.2)} />
    <Circle cx={16.6} cy={8.4} r={1.3} {...stroke(color, 1.4)} />
  </Base>
);

/** Folders: a makimono (hand scroll) with its two rollers. */
export const FolderIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M6.5 6.5h11v11h-11z" {...stroke(color, 1.7)} />
    <Path d="M4 5.2v13.6M20 5.2v13.6" {...stroke(color, 2.3)} />
    <Path d="M9.2 10h5.6M9.2 13h3.8" {...stroke(color, 1.4)} />
  </Base>
);

/** Remove: a trash bin drawn with brush strokes. */
export const TrashIcon: React.FC<IconProps> = ({ size = 20, color = '#FF4D4D' }) => (
  <Base size={size}>
    <Path d="M4.5 6.8h15" {...stroke(color, 1.9)} />
    <Path d="M9.5 6.5V4.8h5v1.7" {...stroke(color, 1.6)} />
    <Path d="M6.5 7.5l.9 11.2c.1.8.7 1.3 1.5 1.3h6.2c.8 0 1.4-.5 1.5-1.3l.9-11.2" {...stroke(color, 1.7)} />
    <Path d="M10.3 10.8v5.6M13.7 10.8v5.6" {...stroke(color, 1.4)} />
  </Base>
);

/** Settings: a kamon (family crest) style wheel. */
export const GearIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Circle cx={12} cy={12} r={3.1} {...stroke(color, 1.7)} />
    {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
      <Path key={angle} d="M12 3.6v2.6" {...stroke(color, 2.2)} transform={`rotate(${angle} 12 12)`} />
    ))}
    <Circle cx={12} cy={12} r={6.3} {...stroke(color, 1.5)} />
  </Base>
);

/** Back: a brush chevron. */
export const BackIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M15.2 4.8c-2.6 2.3-4.9 4.6-7 7.2 2.1 2.6 4.4 4.9 7 7.2" {...stroke(color, 2.2)} />
  </Base>
);

/** Close: two crossing brush strokes. */
export const CloseIcon: React.FC<IconProps> = ({ size = 22, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M6 6.2c4.1 3.7 8 7.6 12 11.8" {...stroke(color, 2.1)} />
    <Path d="M18 6c-4.2 3.9-8.1 7.9-12 12" {...stroke(color, 2.1)} />
  </Base>
);

/** Refresh: an open ensō circle ending in an arrow tip. */
export const RefreshIcon: React.FC<IconProps> = ({ size = 18, color = '#0A0A0A' }) => (
  <Base size={size}>
    <Path d="M18.6 9.2A7.2 7.2 0 1 0 19 14.4" {...stroke(color, 2.1)} />
    <Path d="M19.4 4.8v4.6h-4.6" {...stroke(color, 2.1)} />
  </Base>
);

/** Ensō: a single open brush circle, thicker where the stroke starts (tutorial). */
export const EnsoIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M14.8 4.6a7.6 7.6 0 1 0 4.9 5.3" {...stroke(color, 2.4)} />
    <Path d="M19.7 9.9c-.3-1.1-.8-2-1.4-2.8" {...stroke(color, 1.2)} />
  </Base>
);

/** Search: an ensō lens with a brush handle. */
export const SearchIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M16.2 10.4a5.9 5.9 0 1 1-2.1-4.5" {...stroke(color, 2)} />
    <Path d="M15.1 15.3l4.6 4.5" {...stroke(color, 2.4)} />
  </Base>
);

/** Reading stats: three bamboo stalks of different heights, with nodes. */
export const ChartIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M6.5 20v-7.5M12 20V4.5M17.5 20v-11" {...stroke(color, 2.3)} />
    <Path d="M5.3 16.4h2.4M10.8 9.6h2.4M10.8 14.8h2.4M16.3 13.8h2.4" {...stroke(color, 1.2)} />
    <Path d="M12 7.2c1.4-.9 2.7-1.2 3.9-.9" {...stroke(color, 1.2)} />
  </Base>
);

/** Continue reading: an open book. */
export const ReadIcon: React.FC<IconProps> = ({ size = 18, color = '#0A0A0A' }) => (
  <Base size={size}>
    <Path d="M12 6.8C9.6 5.2 6.9 4.8 3.8 5.3v12.4c3.1-.5 5.8-.1 8.2 1.5 2.4-1.6 5.1-2 8.2-1.5V5.3c-3.1-.5-5.8-.1-8.2 1.5Z" {...stroke(color, 1.8)} />
    <Path d="M12 6.8v12.4" {...stroke(color, 1.6)} />
  </Base>
);

/** Reorder: two opposite vertical arrows. */
export const SortIcon: React.FC<IconProps> = ({ size = 18, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M8 18.5V5.5M4.8 8.7 8 5.5l3.2 3.2" {...stroke(color, 1.9)} />
    <Path d="M16 5.5v13M12.8 15.3 16 18.5l3.2-3.2" {...stroke(color, 1.9)} />
  </Base>
);

/** Arrow (right by default). */
export const ArrowIcon: React.FC<IconProps & { direction?: 'left' | 'right' }> = ({
  size = 18,
  color = '#FFFFFF',
  direction = 'right',
}) => (
  <Base size={size}>
    <G transform={direction === 'left' ? 'rotate(180 12 12)' : undefined}>
      <Path d="M4.5 12h14M13.5 6.5 19 12l-5.5 5.5" {...stroke(color, 2.1)} />
    </G>
  </Base>
);

/** Bookmark: a hanging ribbon (filled when the page is marked). */
export const BookmarkIcon: React.FC<IconProps & { filled?: boolean }> = ({ size = 20, color = '#FFFFFF', filled = false }) => (
  <Base size={size}>
    <Path d="M7 4.2c3.3-.4 6.7-.4 10 0v15.6l-5-3.7-5 3.7Z" {...stroke(color, 1.8)} fill={filled ? color : 'none'} />
  </Base>
);

/** Table of contents: brush strokes with ink dots, like an index on a scroll. */
export const IndexIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M9.5 6.8c3.2-.3 6.4-.2 9.6.1M9.5 12c3.2-.2 6.4-.1 9.6.1M9.5 17.2c2.3-.2 4.5-.1 6.8.1" {...stroke(color, 1.9)} />
    <Circle cx={5.3} cy={6.8} r={1.3} fill={color} />
    <Circle cx={5.3} cy={12} r={1.3} fill={color} />
    <Circle cx={5.3} cy={17.2} r={1.3} fill={color} />
  </Base>
);

/** Sun / Brightness: a central sun circle with radiating rays. */
export const SunIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Circle cx={12} cy={12} r={4.5} {...stroke(color, 1.8)} />
    <Path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" {...stroke(color, 1.8)} />
  </Base>
);

/** Wi-Fi: signal arcs; `signal` 0..3 dims the arcs that are out of reach. */
export const WifiIcon: React.FC<IconProps & { signal?: number }> = ({ size = 20, color = '#FFFFFF', signal = 3 }) => {
  const arc = (level: number) => ({ ...stroke(color, 2), opacity: signal >= level ? 1 : 0.25 });
  return (
    <Base size={size}>
      <Path d="M4 8.5C8.4 4.8 15.6 4.8 20 8.5" {...arc(3)} />
      <Path d="M6.5 12C9.5 9.5 14.5 9.5 17.5 12" {...arc(2)} />
      <Path d="M9.5 15.5C10.9 14.2 13.1 14.2 14.5 15.5" {...arc(1)} />
      <Circle cx={12} cy={18.5} r={1.2} fill={color} />
    </Base>
  );
};

/** Lock (secured Wi-Fi). */
export const LockIcon: React.FC<IconProps> = ({ size = 16, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M6.5 11h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" {...stroke(color, 1.8)} />
    <Path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" {...stroke(color, 1.8)} />
  </Base>
);

/** Crescent moon (screen sleep). */
export const MoonIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z" {...stroke(color, 1.8)} />
  </Base>
);

/** Battery with visual dynamic fill bar. */
export const BatteryIcon: React.FC<IconProps & { level?: number; charging?: boolean }> = ({
  size = 20,
  color = '#FFFFFF',
  level = 100,
  charging = false,
}) => {
  const clamped = Math.max(0, Math.min(100, level));
  const fillWidth = Math.max(1.5, (clamped / 100) * 11);
  const fillColor = clamped <= 15 ? '#A98BD0' : color; // Low battery: wisteria (no reds in the palette)

  return (
    <Base size={size}>
      {/* Shell */}
      <Rect x={3} y={7} width={15} height={10} rx={2} {...stroke(color, 1.8)} />
      {/* Terminal bump */}
      <Path d="M19.5 10v4" {...stroke(color, 1.8)} />
      {/* Fill bar */}
      <Rect x={4.8} y={8.8} width={fillWidth} height={6.4} rx={1} fill={fillColor} />
      {/* Lightning bolt if charging */}
      {charging ? (
        <Path d="M11.5 6.5 8.5 12h3.2l-1.2 5 4.5-6h-3.5l1.5-4.5Z" fill="#E2B84E" stroke="#0A0A0A" strokeWidth={0.8} />
      ) : null}
    </Base>
  );
};

/** Eye / Eye protection mode: stylized eye contour with iris. */
export const EyeIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M2.5 12c2.5-5 6.5-7.5 9.5-7.5s7 2.5 9.5 7.5c-2.5 5-6.5 7.5-9.5 7.5s-7-2.5-9.5-7.5Z" {...stroke(color, 1.8)} />
    <Circle cx={12} cy={12} r={3.2} {...stroke(color, 1.8)} />
  </Base>
);

/** Rotate / Orientation icon: screen with circular rotation arrows. */
export const RotateIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M4 12a8 8 0 0 1 14.5-4.5M20 7v3.5h-3.5M20 12a8 8 0 0 1-14.5 4.5M4 17v-3.5h3.5" {...stroke(color, 1.8)} />
  </Base>
);

/** USB cable / device icon. */
export const UsbIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M12 2v14M9 5l3-3 3 3M9 13l-4 3 4 3M5 16h4M15 13l4 3-4 3M19 16h-4" {...stroke(color, 1.8)} />
    <Circle cx={12} cy={19} r={2} fill={color} />
  </Base>
);

/** Files / Documents folder icon for device file explorer */
export const FilesFolderIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" {...stroke(color, 1.8)} />
  </Base>
);

/** Google Drive icon with official tri-color geometry. */
export const GoogleDriveIcon: React.FC<IconProps> = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M8.5 3.5l7 12H23l-7-12H8.5z" fill="#FFBA00" />
    <Path d="M1 21.5l3.5-6h14.5l-3.5 6H1z" fill="#2684FC" />
    <Path d="M8.5 3.5L1 16.5l3.5 6L12 9.5l-3.5-6z" fill="#00AC47" />
  </Svg>
);

/** Left chevron / back icon. */
export const ChevronLeftIcon: React.FC<IconProps> = ({ size = 20, color = '#FFFFFF' }) => (
  <Base size={size}>
    <Path d="M15 18l-6-6 6-6" {...stroke(color, 2)} />
  </Base>
);
