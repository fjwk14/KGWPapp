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
  /** Semantic color. `neutral` for counts/labels, the rest for status. */
  tone?: BadgeTone;
  /** Show a leading status dot in the current tone color. */
  dot?: boolean;
  /** Use square corners instead of the default pill shape. */
  square?: boolean;
}

/**
 * Badge — a small pill for status, counts, or category labels.
 *
 * Pick a `tone` that matches the meaning (success/warning/danger for status).
 * Add `dot` for a status indicator style.
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
