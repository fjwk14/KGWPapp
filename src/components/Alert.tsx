import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export type AlertTone = "info" | "success" | "warning" | "danger";

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Severity — sets the color and default icon. */
  tone?: AlertTone;
  /** Bold heading line. */
  title?: React.ReactNode;
  /** Override the default tone icon. Pass `null` to hide the icon entirely. */
  icon?: React.ReactNode | null;
}

const ICONS: Record<AlertTone, React.ReactNode> = {
  info: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 11-2 0 1 1 0 012 0zm-1 3a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path fillRule="evenodd" d="M8.3 2.9c.8-1.3 2.7-1.3 3.4 0l6 10.5c.8 1.3-.2 3-1.7 3H4c-1.5 0-2.5-1.7-1.7-3l6-10.5zM10 7a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  ),
  danger: (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 10-1.4-1.4L10 8.6 8.7 7.3z" clipRule="evenodd" />
    </svg>
  ),
};

/**
 * Alert — an inline, non-dismissable message that draws attention to a state
 * or outcome.
 *
 * Pick a `tone` for severity; an icon is chosen automatically. Provide a
 * `title` for the headline and `children` for the supporting detail.
 */
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { tone = "info", title, icon, className, children, ...rest },
  ref
) {
  const showIcon = icon !== null;
  return (
    <div ref={ref} role="alert" className={cx("mrd-alert", `mrd-alert--${tone}`, className)} {...rest}>
      {showIcon && <span className="mrd-alert__icon">{icon ?? ICONS[tone]}</span>}
      <div className="mrd-alert__body">
        {title != null && <span className="mrd-alert__title">{title}</span>}
        {children != null && <span className="mrd-alert__desc">{children}</span>}
      </div>
    </div>
  );
});
