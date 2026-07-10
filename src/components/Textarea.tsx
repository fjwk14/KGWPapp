import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Field label shown above the control. */
  label?: string;
  /** Helper text shown below the control when there is no error. */
  hint?: string;
  /** Error message. When set, the control is styled invalid. */
  error?: string;
  /** Marks the field as required (adds a red asterisk to the label). */
  required?: boolean;
}

let uid = 0;
const useId = (override?: string) => {
  const [id] = React.useState(() => override ?? `mrd-textarea-${++uid}`);
  return id;
};

/**
 * Textarea — a multi-line text field sharing the Input field shell.
 *
 * Grows vertically only (the user can resize). Supports the same
 * `label` / `hint` / `error` composition as Input.
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
