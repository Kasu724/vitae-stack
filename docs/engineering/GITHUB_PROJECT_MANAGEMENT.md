# GitHub project management

No labels, milestones, issues, branch protection, or Actions have been activated remotely. This document defines the intended setup.

## Label strategy

Use one label from each applicable axis; avoid synonyms.

- Type: `type:bug`, `type:feature`, `type:security`, `type:docs`, `type:maintenance`, `type:research`.
- Area: `area:career-bank`, `area:documents`, `area:jobs`, `area:ai`, `area:ats`, `area:security`, `area:accessibility`, `area:platform`, `area:export`, `area:docs`.
- Priority: `priority:p0` (release/security/data-loss blocker), `p1` (milestone-critical), `p2` (normal), `p3` (later).
- Status: `status:needs-triage`, `status:ready`, `status:blocked`, `status:needs-info`, `status:in-review`.
- Effort/risk: `size:xs/s/m/l`, `risk:security`, `risk:data-migration`, `risk:breaking`, `good-first-issue`, `help-wanted`.

Labels do not encode people or duplicate GitHub open/closed state. Security vulnerabilities stay private; `type:security` is for public hardening work after disclosure is safe.

## Issues and milestones

Issues state user/operational outcome, PR/AC/M milestone IDs, explicit non-scope, acceptance/tests, security/privacy/accessibility/provenance impact, dependencies, and recovery/migration needs. One issue should be independently reviewable; research issues end in a decision/ADR, not production code.

Create GitHub milestones matching M01–M22 only when work begins. The docs plan remains authoritative; GitHub tracks execution. An issue belongs to the earliest milestone that can verify it and links cross-milestone dependencies rather than duplicating work. No fake issue numbers are used in docs.

Triage weekly when active: validate reproduction/scope, remove sensitive data, assign priority/area/status, link requirement/milestone, and close duplicates with context. Milestone completion requires the plan criteria and traceability evidence, not merely all issues closed.
