# Accessibility

Target WCAG 2.2 AA for all MVP flows. Accessibility defects that block authentication, approval, tailoring review, editing, export, portability, or deletion are release blockers.

## Requirements

- Semantic landmarks and one descriptive `h1`; heading levels reflect structure.
- Every control has an accessible name, purpose, state, and programmatic error association. Placeholder text is not a label.
- Logical keyboard order, no traps outside modal patterns, visible focus, skip link, and focus restoration after dialogs/jobs.
- Reflow at 320 CSS px and 200% zoom without two-dimensional scrolling except intrinsically tabular matrix content, which gets a list alternative.
- Pointer targets meet WCAG 2.2 target-size requirements; drag actions have button/menu alternatives.
- Status, evidence, scores, diffs, and errors do not rely on color, position, or animation alone.
- Live regions announce autosave, background-job completion, suggestion decisions, and validation summaries without repeating every keystroke.
- Editor exposes structured sections, paragraphs, bullets, claim statuses, and suggestion boundaries; shortcuts are documented and remappable when single-character.
- PDF/DOCX templates use headings/lists, meaningful reading order, selectable text, document language/title, and avoid information-only tables.

## Validation

Each component gets semantic unit tests and automated axe checks. Each core flow gets Playwright keyboard and accessibility scans at desktop/mobile. Before release, manually test with keyboard, 200%/400% zoom where applicable, Windows High Contrast, reduced motion, NVDA+Firefox/Chrome, VoiceOver+Safari, and PDF reading order. Automated zero violations is necessary but not sufficient.

Report failures with WCAG criterion, user impact, reproduction, assistive technology, and regression test. See [quality gates](../engineering/QUALITY_GATES.md).
