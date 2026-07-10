import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** トラックの横に表示するラベル。 */
  label?: React.ReactNode;
  /** ラベルをトラックの後ろではなく前に置く。 */
  labelPosition?: "start" | "end";
}

/**
 * Switch — 即座に反映される オン/オフ 設定のためのトグル（送信は不要）。
 *
 * 切り替えた瞬間に効果が及ぶ設定（環境設定など）では Checkbox より優先する。
 * アクセシビリティのためにネイティブの checkbox をレンダリングする。
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
