import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** 意味を表す色。件数やラベルには `neutral`、状態にはそれ以外を使う。 */
  tone?: BadgeTone;
  /** 現在の色調の先頭ステータスドットを表示する。 */
  dot?: boolean;
  /** 既定のピル形状ではなく角のある形にする。 */
  square?: boolean;
}

/**
 * Badge — 状態・件数・カテゴリラベルを表す小さなピル。
 *
 * 意味に合った `tone` を選ぶ（状態には success/warning/danger）。
 * ステータス表示スタイルにするには `dot` を付ける。
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  function Badge({ tone = "neutral", dot = false, square = false, className, children, ...rest }, ref) {
    return (
      <span
        ref={ref}
        className={cx("mrd-badge", `mrd-badge--${tone}`, square && "mrd-badge--square", className)}
        {...rest}
      >
        {dot && <span className="mrd-badge__dot" aria-hidden="true" />}
        {children}
      </span>
    );
  }
);
