import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export type AvatarSize = "xs" | "sm" | "md" | "lg";
export type AvatarStatus = "online" | "offline" | "busy";

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** 画像URL。省略時（または読み込み失敗時）はイニシャルを表示する。 */
  src?: string;
  /** 代替テキストおよびイニシャル生成に使う氏名。 */
  name?: string;
  /** イニシャルの明示指定（省略時は `name` から生成）。 */
  initials?: string;
  /** アバターの直径。 */
  size?: AvatarSize;
  /** 円形ではなく角丸の四角形にする。 */
  square?: boolean;
  /** 隅に在席状態のドットを表示する。 */
  status?: AvatarStatus;
}

const initialsFrom = (name?: string) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

/**
 * Avatar — 画像がないときはイニシャルにフォールバックする、ユーザーや組織の画像。
 *
 * 写真には `src` を、代替テキスト／イニシャルのフォールバックには `name` を渡す。
 * 在席状態のドットを付けるには `status` を使う。
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
