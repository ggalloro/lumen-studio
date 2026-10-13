import { useId } from 'react';

interface AppTileProps {
  size?: number;
  /** Accessible label. Pass an empty string when the tile is decorative. */
  title?: string;
}

/**
 * The application tile: white "Ls" on a red gradient rounded square.
 * Mirrors public/favicon.svg; keep the two in sync.
 */
export function AppTile({ size = 32, title = 'Lumen Studio' }: AppTileProps) {
  const gradientId = `app-tile-${useId().replace(/:/g, '')}`;
  const decorative = title === '';
  return (
    <svg
      className="app-tile"
      data-testid="app-tile"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative ? true : undefined}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B30B00" />
          <stop offset="1" stopColor="#FA0F00" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gradientId})`} />
      <text
        x="32"
        y="43"
        textAnchor="middle"
        fontFamily="'Source Sans 3', 'Helvetica Neue', Arial, sans-serif"
        fontSize="30"
        fontWeight="700"
        fill="#FFFFFF"
      >
        Ls
      </text>
    </svg>
  );
}
