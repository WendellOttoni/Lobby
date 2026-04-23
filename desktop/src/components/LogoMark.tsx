interface Props {
  size?: number;
  withShadow?: boolean;
}

export function LogoMark({ size = 36, withShadow = true }: Props) {
  const id = `lobby-lg-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={withShadow ? { filter: "drop-shadow(0 4px 14px rgba(168,85,247,0.4))" } : undefined}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="45%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#e040fb" />
        </linearGradient>
      </defs>
      <path
        d="M22 18 h52 a10 10 0 0 1 10 10 v42 a10 10 0 0 1 -10 10 h-24 l-8 10 -4 -10 h-16 a10 10 0 0 1 -10 -10 v-42 a10 10 0 0 1 10 -10 z"
        fill={`url(#${id})`}
      />
      <path
        d="M25 50 Q32 38, 40 50 T55 50 T72 48"
        stroke="#fff"
        strokeWidth="4.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
