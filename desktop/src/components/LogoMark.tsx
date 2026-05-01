interface Props {
  size?: number;
  withShadow?: boolean;
}

export function LogoMark({ size = 36, withShadow = true }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={withShadow ? { filter: "drop-shadow(0 4px 12px rgba(41,151,255,0.35))" } : undefined}
    >
      <path
        d="M22 18 h52 a10 10 0 0 1 10 10 v42 a10 10 0 0 1 -10 10 h-24 l-8 10 -4 -10 h-16 a10 10 0 0 1 -10 -10 v-42 a10 10 0 0 1 10 -10 z"
        fill="#2997ff"
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
