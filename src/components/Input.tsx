import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Field label shown above the control. */
  label?: string;
  /** Helper text shown below the control when there is no error. */
  hint?: string;
  /** Error message. When set, the control is styled invalid and the hint is
   *  replaced by this message. */
  error?: string;
  /** Marks the field as required (adds a red asterisk to the label). */
  required?: boolean;
}

let uid = 0;
const useId = (override?: string) => {
  const [id] = React.useState(() => override ?? `mrd-input-${++uid}`);
  return id;
};

/**
 * Input — a single-line text field with an optional label, hint, and error.
 *
 * Pass `label` and `hint` for a fully composed field, or use it bare inside a
 * custom layout. Setting `error` switches the control to its invalid state.
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
