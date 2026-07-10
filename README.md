# Meridian UI

A calm, professional React design system — slate neutrals, a muted indigo
accent, sharp corners, and restrained elevation. Built for dashboards and
data-dense product surfaces.

## Install

```bash
npm install meridian-ui
```

Peer dependencies: `react >= 18`, `react-dom >= 18`.

## Usage

Import the stylesheet once at your app root, then use the components:

```tsx
import "meridian-ui/styles.css";
import { Button, Card, Badge } from "meridian-ui";

export function Example() {
  return (
    <Card title="Project status" action={<Badge tone="success" dot>Active</Badge>}>
      <p>Everything is running smoothly.</p>
      <Button variant="primary">View details</Button>
    </Card>
  );
}
```

## Design tokens

All visual values are CSS custom properties (prefixed `--mrd-`) defined in
`styles.css`: color scales (`--mrd-slate-*`, `--mrd-primary-*`, semantic
hues), spacing (`--mrd-space-*`), radii (`--mrd-radius-*`), typography, and
elevation. Override them at `:root` or on a container to re-theme.

## Components

Actions — **Button** · Forms — **Input**, **Textarea**, **Select**,
**Checkbox**, **Switch** · Data display — **Badge**, **Avatar** · Layout —
**Card** · Feedback — **Alert**
