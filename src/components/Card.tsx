import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface CardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Heading shown in the card header. Omit for a body-only card. */
  title?: React.ReactNode;
  /** Muted line under the title. */
  subtitle?: React.ReactNode;
  /** Slot rendered on the right of the header (e.g. a Badge or menu button). */
  action?: React.ReactNode;
  /** Footer content — typically buttons. Rendered in a muted footer bar. */
  footer?: React.ReactNode;
  /** Use a shadow instead of a border. */
  raised?: boolean;
  /** Add hover elevation and a pointer cursor for clickable cards. */
  interactive?: boolean;
  /** Remove the default body padding (for edge-to-edge media/tables). */
  flush?: boolean;
}

/**
 * Card — a surface that groups related content, with optional header and
 * footer regions.
 *
 * Pass `title` / `subtitle` / `action` for a header and `footer` for actions;
 * everything in `children` renders in the padded body. Set `flush` for
 * edge-to-edge content like tables or images.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { title, subtitle, action, footer, raised, interactive, flush, className, children, ...rest },
  ref
) {
  const hasHeader = title != null || subtitle != null || action != null;
  return (
    <div
      ref={ref}
      className={cx(
        "mrd-card",
        raised && "mrd-card--raised",
        interactive && "mrd-card--interactive",
        className
      )}
      {...rest}
    >
      {hasHeader && (
        <div
          className="mrd-card__header"
          style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}
        >
          <div>
            {title != null && <h3 className="mrd-card__title">{title}</h3>}
            {subtitle != null && <p className="mrd-card__subtitle">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="mrd-card__body" style={flush ? { padding: 0 } : undefined}>
        {children}
      </div>
      {footer != null && <div className="mrd-card__footer">{footer}</div>}
    </div>
  );
});
