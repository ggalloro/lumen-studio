import { initials } from '../lib/format';

interface UserAvatarProps {
  name: string;
  color?: string;
  size?: number;
}

/** Round initials badge in the user's avatar colour. */
export function UserAvatar({ name, color = '#6E6E6E', size = 28 }: UserAvatarProps) {
  return (
    <span
      className="user-avatar"
      aria-hidden="true"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials(name)}
    </span>
  );
}
