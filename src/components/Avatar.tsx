import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export type AvatarSize = "xs" | "sm" | "md" | "lg";
export type AvatarStatus = "online" | "offline" | "busy";

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Image URL. When omitted (or it fails to load) the initials show instead. */
  src?: string;
  /** Full name used for the alt text and to derive initials. */
  name?: string;
  /** Explicit initials override (otherwise derived from `name`). */
  initials?: string;
  /** Avatar diameter. */
  size?: AvatarSize;
  /** Use rounded-square corners instead of a circle. */
  square?: boolean;
  /** Show a presence dot in the corner. */
  status?: AvatarStatus;
}

const initialsFrom = (name?: string) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

/**
 * Avatar — a user or entity image that falls back to initials.
 *
 * Provide `src` for a photo and `name` for the alt text / initials fallback.
 * Add `status` for a presence dot.
 */
export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  function Avatar({ src, name, initials, size = "md", square = false, status, className, ...rest }, ref) {
    const [failed, setFailed] = React.useState(false);
    const showImg = src && !failed;
    const content = (
      <span
        ref={ref}
        className={cx("mrd-avatar", `mrd-avatar--${size}`, square && "mrd-avatar--square", className)}
        {...rest}
      >
        {showImg ? (
          <img src={src} alt={name ?? ""} onError={() => setFailed(true)} />
        ) : (
          <span aria-hidden={!name}>{initials ?? initialsFrom(name)}</span>
        )}
      </span>
    );
    if (!status) return content;
    return (
      <span className="mrd-avatar-wrap">
        {content}
        <span className={cx("mrd-avatar__status", `mrd-avatar__status--${status}`)} />
      </span>
    );
  }
);
