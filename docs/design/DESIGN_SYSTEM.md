# Design system

## Foundations

Use semantic HTML, Tailwind CSS tokens, and a small repository-owned component layer built from headless primitives where useful. Components must not depend on a proprietary design service. Tokens use CSS custom properties so self-hosters can theme without changing component logic.

Token groups: neutral/surface/text/border; action/info/success/warning/danger; evidence statuses; spacing on a 4px base; radii; shadows; typography; and print behavior. Light and dark modes are supported.

## Components

Required primitives include button, link, input, textarea, combobox, checkbox/radio, date range, tabs, dialog, alert dialog, toast/live status, disclosure, tooltip (never sole content), menu, breadcrumb, pagination, data list/table, diff, status badge, progress, skeleton, empty state, file drop zone, and resizable panes.

Evidence-aware patterns:

- `ClaimStatus`: icon + text (`Supported`, `Needs evidence`, `Conflict`, `Nonfactual`), never color alone.
- `EvidenceChip`: stable short label, source type, approval state; opens inspector without navigating unexpectedly.
- `SuggestionCard`: operation, before/after, rationale, requirements, evidence, accept/reject, base-version status.
- `Finding`: AI severity, affected-location hint, explanation, and remediation; it carries no grounding or export authority.

## Content and motion

Use direct labels (“Approve 4 facts”, “Delete source file”), sentence-case headings, ISO-aware but localized dates, and no success claims before server confirmation. Avoid gamified scoring language. Motion uses repository-owned duration and easing tokens. Entrances, hover feedback, focus movement, and state transitions stay under 200ms, use only opacity and small transforms where practical, and are never required to understand state. `prefers-reduced-motion: reduce` disables meaningful animation, delays, and smooth scrolling globally.

Component stories will cover default, disabled, loading, error, long content, and narrow viewport. Visual regression tests complement interaction tests.
