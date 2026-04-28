import { memo } from "react";
import { avatarBg, avatarInitials } from "../lib/avatar";

interface Props {
  name: string;
  id?: string;
  size?: number;
  speaking?: boolean;
  muted?: boolean;
  color?: string;
  src?: string | null;
}

export const Avatar = memo(function Avatar({ name, id, size = 32, speaking, muted, color, src }: Props) {
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
        style={{
          background: src ? `center / cover no-repeat url("${src}")` : bg,
          fontSize: size * 0.36,
        }}
      >
        {!src && initials}
      </div>
    </div>
  );
});
