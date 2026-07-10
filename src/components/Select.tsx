import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface SelectOption {
  /** 選択・変更時に送信／通知される値。 */
  value: string;
  /** 表示ラベル。省略時は `value` を使う。 */
  label?: string;
  /** この選択肢だけを無効化する。 */
  disabled?: boolean;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** コントロールの上に表示するラベル。 */
  label?: string;
  /** エラーがないときにコントロールの下に表示する補助テキスト。 */
  hint?: string;
  /** エラーメッセージ。指定するとコントロールが不正状態のスタイルになる。 */
  error?: string;
  /** 必須項目としてマークする（ラベルに赤いアスタリスクを付ける）。 */
  required?: boolean;
  /** 表示する選択肢。`<option>` を子要素として直接渡すこともできる。 */
  options?: SelectOption[];
  /** 値が未選択のときに先頭へ表示する無効化されたプレースホルダー。 */
  placeholder?: string;
}

let uid = 0;
const useId = (override?: string) => {
  const [id] = React.useState(() => override ?? `mrd-select-${++uid}`);
  return id;
};

/**
 * Select — Meridian のフィールド外枠とシェブロンを備えたネイティブのドロップダウン。
 *
 * よくある用途では `options` を渡し、細かく制御したい場合は `<option>` を
 * 子要素として渡す。アクセシビリティとモバイルの操作性のためにネイティブの
 * select を使用する。
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { label, hint, error, required, options, placeholder, id, className, children, defaultValue, value, ...rest },
    ref
  ) {
    const selectId = useId(id);
    const invalid = Boolean(error);
    const isControlled = value !== undefined;
    return (
      <div className="mrd-field">
        {label && (
          <label className="mrd-field__label" htmlFor={selectId}>
            {label}
            {required && <span className="mrd-field__required">*</span>}
          </label>
        )}
        <span className="mrd-select-wrap">
          <select
            ref={ref}
            id={selectId}
            className={cx("mrd-control", "mrd-select", invalid && "mrd-control--invalid", className)}
            aria-invalid={invalid || undefined}
            required={required}
            value={value}
            defaultValue={isControlled ? undefined : defaultValue ?? (placeholder ? "" : undefined)}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options
              ? options.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.disabled}>
                    {o.label ?? o.value}
                  </option>
                ))
              : children}
          </select>
        </span>
        {error ? (
          <span className="mrd-field__error">{error}</span>
        ) : hint ? (
          <span className="mrd-field__hint">{hint}</span>
        ) : null}
      </div>
    );
  }
);
