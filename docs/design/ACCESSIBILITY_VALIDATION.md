# Accessibility validation record

**Target:** WCAG 2.2 AA for the release-critical web and exported-document journeys.

## Automated coverage

Playwright/axe suites cover the public shell, authentication, dashboard-linked career bank, career editor, document library/editor, source import, extraction review, pasted/file/URL job ingestion, requirement/evidence matrix, provider settings, resume and cover-letter tailoring review, ATS report, export, and privacy/portability controls. Narrow checks use a 320 CSS px viewport and assert no document-level horizontal overflow. The ATS category table has a labeled card-list alternative below the medium breakpoint.

| WCAG area                               | Implemented evidence                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1.3.1 structure/relationships           | landmarks, one `h1`, labeled sections/forms, table headers/caption, mobile definition lists, export fixtures |
| 1.3.2 meaningful sequence               | DOM reading order, structured document blocks, PDF/DOCX parse-back and heading/list checks                   |
| 1.4.3/1.4.11 contrast/non-text contrast | repository tokens, axe, visible 3 px focus indicator, forced-color system tokens                             |
| 1.4.10 reflow                           | 320 px suites and overflow assertions across core workflows                                                  |
| 2.1.1 keyboard                          | native controls, no drag-only actions, skip navigation, atomic suggestion radio/button review                |
| 2.4.3/2.4.7 focus order/visible focus   | DOM order, global `:focus-visible`, dry-run result focus, keyboard skip-link test                            |
| 2.5.8 target size                       | 44 px shared fields/buttons; native checkbox/radio controls use clickable labels                             |
| 3.3.1/3.3.2 errors/labels               | visible labels, alert/status roles, safe error summaries, typed destructive confirmations                    |
| 4.1.2 name/role/value                   | semantic native inputs/buttons/details, labeled status and selection state, axe checks                       |
| 4.1.3 status messages                   | autosave, operation, import, tailoring, and export `status`/`alert` regions                                  |

The foundation suite additionally emulates forced colors plus reduced motion, verifies skip navigation by keyboard, and reruns axe. Editor unit coverage verifies accessible text-field names, word-count feedback, and browser leave protection for a dirty draft. Browser-native undo/redo is available within focused text fields; immutable version history handles committed recovery. On 2026-07-01 the complete automated suites passed 11/11, and an in-app Chromium check found no document-level horizontal overflow on Career Bank, documents, jobs, or privacy screens at 320 CSS px and a 400%-equivalent viewport.

## Manual release matrix

These checks require human assistive-technology evidence and remain open until M21 release validation. Do not infer them from axe.

| Environment                        | Required journey                                     | Current evidence                                                                       |
| ---------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Keyboard only, Chrome/Firefox      | full primary journey including review/export/delete  | Automated Chromium keyboard cases pass; human Chrome/Firefox sign-off pending          |
| Windows High Contrast              | sign-in, editor claims, ATS findings, destructive UI | Forced-color automation passes; human sign-off pending                                 |
| 200% and 400% browser zoom         | all major pages; no clipped controls/status/evidence | 320 px and 400%-equivalent core-screen checks pass; named-browser human matrix pending |
| NVDA with Firefox and Chrome       | headings/forms/editor/claims/ATS/portability         | Pending                                                                                |
| VoiceOver with Safari              | same core reading and control sequence               | Pending                                                                                |
| PDF viewer and Word/LibreOffice AT | title/language/headings/lists/reading order          | Pending                                                                                |

Record browser/AT versions, viewport/zoom, result, defect ID, and reviewer for every row. Block release on any authentication, evidence approval, editing, suggestion review, export, portability, or deletion barrier; serious/critical axe findings also block.

The 2026-07-01 local Windows validation host has no NVDA, Safari/VoiceOver, Word, or LibreOffice executable. Automated Chromium evidence is recorded above, but the missing named-platform rows cannot be converted into a pass without those external environments and a human reviewer.

## Responsive decision

OQ-07 is resolved: all MVP editor content fields and review controls remain fully available in a single-column layout at 320 CSS px. Drag/reorder is not an MVP interaction, so no narrow-screen substitute is required. Future structured reordering must provide move buttons/menu and retain the 320 px review/edit baseline.
