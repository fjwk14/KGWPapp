import React from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface CardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** ヘッダーに表示する見出し。省略するとボディのみのカードになる。 */
  title?: React.ReactNode;
  /** タイトルの下に表示する控えめな一行。 */
  subtitle?: React.ReactNode;
  /** ヘッダー右側のスロット（Badge やメニューボタンなど）。 */
  action?: React.ReactNode;
  /** フッターの内容（通常はボタン）。控えめなフッターバーに表示される。 */
  footer?: React.ReactNode;
  /** ボーダーの代わりに影を使う。 */
  raised?: boolean;
  /** クリック可能なカード向けに、ホバー時の浮き上がりとポインターカーソルを付ける。 */
  interactive?: boolean;
  /** 既定のボディ余白を取り除く（画像や表を端まで敷き詰める用途）。 */
  flush?: boolean;
}

/**
 * Card — 関連する内容をまとめる面。ヘッダーとフッターの領域は任意。
 *
 * ヘッダーには `title` / `subtitle` / `action`、操作には `footer` を渡す。
 * `children` はすべて余白付きのボディに表示される。表や画像を端まで
 * 敷き詰めるには `flush` を指定する。
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
