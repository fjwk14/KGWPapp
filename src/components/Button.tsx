import React from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 強調度。主要アクションは `primary`、中立的な操作は `secondary`、
   *  ツールバー等の弱い操作は `ghost`、破壊的な操作は `danger`。 */
  variant?: ButtonVariant;
  /** 高さとパディング（密度）を制御。 */
  size?: ButtonSize;
  /** コンテナ幅いっぱいに広げる。 */
  block?: boolean;
  /** 処理中にスピナーを表示し、操作を無効化する。 */
  loading?: boolean;
  /** ラベルの前に表示する要素（アイコンなど）。 */
  leadingIcon?: React.ReactNode;
  /** ラベルの後に表示する要素（アイコンなど）。 */
  trailingIcon?: React.ReactNode;
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * Button — アクションを実行するための主要な操作コントロール。
 *
 * `variant` で強調度を、`size` で周囲の密度に合わせた大きさを指定する。
 * `loading` を指定するとスピナーを表示して無効化し、二重実行を防ぐ。
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
