interface Props {
  live?: boolean;
  color?: string;
  count?: number;
}

export function WaveBars({ live = false, color = "#fff", count = 5 }: Props) {
  return (
    <div className={`wave-bars${live ? " live" : ""}`}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          style={{
            background: color,
            animationDuration: `${0.7 + i * 0.12}s`,
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}
