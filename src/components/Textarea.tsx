import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** コントロールの上に表示するラベル。 */
  label?: string;
  /** エラーがないときにコントロールの下に表示する補助テキスト。 */
  hint?: string;
  /** エラーメッセージ。指定するとコントロールが不正状態のスタイルになる。 */
  error?: string;
  /** 必須項目としてマークする（ラベルに赤いアスタリスクを付ける）。 */
  required?: boolean;
}

let uid = 0;
const useId = (override?: string) => {
  const [id] = React.useState(() => override ?? `mrd-textarea-${++uid}`);
  return id;
};

/**
 * Textarea — Input と同じフィールド外枠を共有する複数行テキスト入力。
 *
 * 縦方向にのみ伸縮する（ユーザーがリサイズ可能）。Input と同じ
 * `label` / `hint` / `error` の構成に対応する。
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, hint, error, required, id, className, rows = 4, ...rest },
    ref
  ) {
    const areaId = useId(id);
    const invalid = Boolean(error);
    return (
      <div className="mrd-field">
        {label && (
          <label className="mrd-field__label" htmlFor={areaId}>
            {label}
            {required && <span className="mrd-field__required">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={areaId}
          rows={rows}
          className={cx("mrd-control", "mrd-textarea", invalid && "mrd-control--invalid", className)}
          aria-invalid={invalid || undefined}
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
