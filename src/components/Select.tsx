import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface SelectOption {
  /** Value submitted / reported on change. */
  value: string;
  /** Human-readable label. Defaults to `value`. */
  label?: string;
  /** Disable this single option. */
  disabled?: boolean;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Field label shown above the control. */
  label?: string;
  /** Helper text shown below the control when there is no error. */
  hint?: string;
  /** Error message. When set, the control is styled invalid. */
  error?: string;
  /** Marks the field as required (adds a red asterisk to the label). */
  required?: boolean;
  /** Options to render. You can also pass `<option>` children directly. */
  options?: SelectOption[];
  /** Placeholder shown as a disabled first option when there is no value. */
  placeholder?: string;
}

let uid = 0;
const useId = (override?: string) => {
  const [id] = React.useState(() => override ?? `mrd-select-${++uid}`);
  return id;
};

/**
 * Select — a native dropdown with the Meridian field shell and chevron.
 *
 * Pass `options` for the common case, or `<option>` children for full control.
 * Uses the platform select for accessibility and mobile ergonomics.
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
