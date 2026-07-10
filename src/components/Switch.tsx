import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Text label rendered next to the track. */
  label?: React.ReactNode;
  /** Place the label before the track instead of after. */
  labelPosition?: "start" | "end";
}

/**
 * Switch — a toggle for an immediate on/off setting (no submit required).
 *
 * Prefer this over Checkbox when flipping it takes effect at once, like a
 * settings preference. Renders a native checkbox for accessibility.
 */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  function Switch(
    { label, labelPosition = "end", disabled, className, ...rest },
    ref
  ) {
    const track = (
      <>
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          className="mrd-switch__input"
          disabled={disabled}
          {...rest}
        />
        <span className="mrd-switch__track" aria-hidden="true">
          <span className="mrd-switch__thumb" />
        </span>
      </>
    );
    return (
      <label className={cx("mrd-switch", disabled && "mrd-switch--disabled", className)}>
        {label && labelPosition === "start" && <span className="mrd-switch__label">{label}</span>}
        {track}
        {label && labelPosition === "end" && <span className="mrd-switch__label">{label}</span>}
      </label>
    );
  }
);
