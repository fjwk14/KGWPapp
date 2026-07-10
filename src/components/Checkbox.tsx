import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** ボックスの横に表示する主ラベル。 */
  label?: React.ReactNode;
  /** ラベルの下に表示する補足説明。 */
  description?: React.ReactNode;
  /** 中間（一部選択）状態を表示する。 */
  indeterminate?: boolean;
}

/**
 * Checkbox — 補足説明と中間（一部選択）状態に対応する、ラベル付きの真偽トグル。
 *
 * 行全体がクリック可能。ツリーで「一部選択」を表す親チェックボックスには
 * `indeterminate` を使う。
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { label, description, indeterminate = false, disabled, className, id, ...rest },
    ref
  ) {
    const innerRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);
    React.useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
      <label className={cx("mrd-checkbox", disabled && "mrd-checkbox--disabled", className)}>
        <input
          ref={innerRef}
          type="checkbox"
          className="mrd-checkbox__input"
          disabled={disabled}
          id={id}
          {...rest}
        />
        <span className="mrd-checkbox__box" aria-hidden="true">
          <svg className="mrd-checkbox__check" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2 5 8.5 9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="mrd-checkbox__dash" />
        </span>
        {(label || description) && (
          <span className="mrd-checkbox__body">
            {label && <span className="mrd-checkbox__label">{label}</span>}
            {description && <span className="mrd-checkbox__desc">{description}</span>}
          </span>
        )}
      </label>
    );
  }
);
