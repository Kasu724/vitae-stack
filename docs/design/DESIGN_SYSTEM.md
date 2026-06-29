# Design system

## Foundations

Use semantic HTML, Tailwind CSS tokens, and a small repository-owned component layer built from accessible headless primitives where useful. Components must not depend on a proprietary design service. Tokens use CSS custom properties so self-hosters can theme without changing component logic.

Token groups: neutral/surface/text/border; action/info/success/warning/danger; focus; evidence statuses; spacing on a 4px base; radii; shadows; typography; motion. Light, dark, forced-colors, and print modes are first-class. Normal text contrast is at least 4.5:1; large text and graphical controls at least 3:1.

## Components

Required primitives include button, link, input, textarea, combobox, checkbox/radio, date range, tabs, dialog, alert dialog, toast/live status, disclosure, tooltip (never sole content), menu, breadcrumb, pagination, data list/table, diff, status badge, progress, skeleton, empty state, file drop zone, and resizable panes.

Evidence-aware patterns:

- `ClaimStatus`: icon + text (`Supported`, `Needs evidence`, `Conflict`, `Nonfactual`), never color alone.
- `EvidenceChip`: stable short label, source type, approval state; opens inspector without navigating unexpectedly.
- `SuggestionCard`: operation, before/after, rationale, requirements, evidence, accept/reject, base-version status.
- `Finding`: severity, deterministic rule ID, affected range, explanation, remediation, score impact.

## Content and motion

Use direct labels (“Approve 4 facts”, “Delete source file”), sentence-case headings, ISO-aware but localized dates, and no success claims before server confirmation. Avoid gamified scoring language. Respect `prefers-reduced-motion`; transitions are optional, under 200ms, and never required to understand state.

Component stories will cover default, focus, disabled, loading, error, long content, narrow viewport, forced colors, and screen-reader names. Visual regression tests complement—not replace—semantic tests.
