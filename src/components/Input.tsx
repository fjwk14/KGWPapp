import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** コントロールの上に表示するラベル。 */
  label?: string;
  /** エラーがないときにコントロールの下に表示する補助テキスト。 */
  hint?: string;
  /** エラーメッセージ。指定するとコントロールが不正状態のスタイルになり、
   *  hint の代わりにこのメッセージが表示される。 */
  error?: string;
  /** 必須項目としてマークする（ラベルに赤いアスタリスクを付ける）。 */
  required?: boolean;
}

let uid = 0;
const useId = (override?: string) => {
  const [id] = React.useState(() => override ?? `mrd-input-${++uid}`);
  return id;
};

/**
 * Input — ラベル・補助テキスト・エラーを備えた一行テキスト入力。
 *
 * `label` と `hint` を渡せば完成された入力欄になり、単体でカスタムレイアウト内に
 * 置くこともできる。`error` を指定するとコントロールが不正状態になる。
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { label, hint, error, required, id, className, disabled, ...rest },
    ref
  ) {
    const inputId = useId(id);
    const invalid = Boolean(error);
    return (
      <div className="mrd-field">
        {label && (
          <label className="mrd-field__label" htmlFor={inputId}>
            {label}
            {required && <span className="mrd-field__required">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cx("mrd-control", "mrd-input", invalid && "mrd-control--invalid", className)}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          required={required}
          {...rest}
        />
        {error ? (
          <span className="mrd-field__error">{error}</span>
        ) : hint ? (
          <span className="mrd-field__hint">{hint}</span>
        ) : null}
      </div>
    );
  }
);
