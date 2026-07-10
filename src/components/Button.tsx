import React from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis. `primary` for the main action, `secondary` for neutral
   *  actions, `ghost` for low-emphasis toolbar actions, `danger` for
   *  destructive actions. */
  variant?: ButtonVariant;
  /** Control height and padding. */
  size?: ButtonSize;
  /** Stretch to fill the container width. */
  block?: boolean;
  /** Show a spinner and block interaction while an action is in flight. */
  loading?: boolean;
  /** Element rendered before the label (e.g. an icon). */
  leadingIcon?: React.ReactNode;
  /** Element rendered after the label (e.g. an icon). */
  trailingIcon?: React.ReactNode;
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * Button — the primary interactive control for triggering an action.
 *
 * Use `variant` to signal emphasis and `size` to fit the surrounding density.
 * When `loading` is set the button shows a spinner and is disabled so the
 * action can't be triggered twice.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      block = false,
      loading = false,
      leadingIcon,
      trailingIcon,
      disabled,
      className,
      children,
      ...rest
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        className={cx(
          "mrd-btn",
          `mrd-btn--${variant}`,
          `mrd-btn--${size}`,
          block && "mrd-btn--block",
          className
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading && <span className="mrd-btn__spinner" aria-hidden="true" />}
        {!loading && leadingIcon}
        {children}
        {!loading && trailingIcon}
      </button>
    );
  }
);
