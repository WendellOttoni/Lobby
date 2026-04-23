import { avatarBg, avatarInitials } from "../lib/avatar";

interface Props {
  name: string;
  id?: string;
  size?: number;
  speaking?: boolean;
  muted?: boolean;
  color?: string;
}

export function Avatar({ name, id, size = 32, speaking, muted, color }: Props) {
  const bg = color ?? avatarBg(id ?? name);
  const initials = avatarInitials(name);
  const classes = ["avatar"];
  if (speaking) classes.push("speaking");
  if (muted) classes.push("muted");
  return (
    <div className={classes.join(" ")} style={{ width: size, height: size }}>
      {speaking && <div className="avatar-ring" />}
      <div
        className="avatar-inner"
        style={{ background: bg, fontSize: size * 0.36 }}
      >
        {initials}
      </div>
    </div>
  );
}
