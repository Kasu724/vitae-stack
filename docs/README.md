# Documentation index

`docs/` is Vitae Stack's source of truth. M01–M20 are implemented and locally validated. M21 records passing automated/runtime/recovery evidence and the remaining external manual assistive-technology matrix; M22 records local release preparation and maintainer-controlled publication steps.

| Area             | Start here                                                                                                                                           | Authority                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Product          | [Product requirements](product/PRODUCT_REQUIREMENTS.md), [MVP scope](product/MVP_SCOPE.md)                                                           | User-visible behavior and boundaries |
| UX               | [UX specification](design/UX_SPECIFICATION.md), [accessibility](design/ACCESSIBILITY.md), [validation record](design/ACCESSIBILITY_VALIDATION.md)    | Interaction and WCAG requirements    |
| Architecture     | [Architecture overview](../ARCHITECTURE.md), [data model](architecture/DATA_MODEL.md), [portability](architecture/DATA_PORTABILITY.md)               | System boundaries and contracts      |
| AI               | [AI principles](ai/AI_PRINCIPLES.md), [grounding](ai/GROUNDING_AND_PROVENANCE.md)                                                                    | Model use and factual safety         |
| ATS              | [Methodology](ats/ATS_METHODOLOGY.md), [rubric](ats/SCORING_RUBRIC.md)                                                                               | Estimated compatibility rules        |
| Security/privacy | [Security architecture](security/SECURITY_ARCHITECTURE.md), [threat model](security/THREAT_MODEL.md)                                                 | Trust boundaries and controls        |
| Engineering      | [Repository structure](engineering/REPOSITORY_STRUCTURE.md), [quality gates](engineering/QUALITY_GATES.md)                                           | Implementation conventions           |
| Operations       | [Backup and restore](operations/BACKUP_AND_RESTORE.md), [deployment](architecture/DEPLOYMENT.md), [release readiness](releases/RELEASE_READINESS.md) | Self-hosted operating procedures     |
| Decisions        | [ADR index](adr/README.md)                                                                                                                           | Accepted architectural decisions     |
| Delivery         | [MVP plan](exec-plans/active/MVP_IMPLEMENTATION.md), [traceability](exec-plans/REQUIREMENTS_TRACEABILITY.md)                                         | Sequencing and verification          |

Conflicts are resolved in this order: accepted ADRs for technical decisions; product requirements and acceptance criteria for behavior; security documents for minimum controls; active execution plan for sequencing. Update all affected layers when a decision changes.

Cross-cutting references: [glossary](GLOSSARY.md), [open questions](OPEN_QUESTIONS.md), [risk register](exec-plans/RISK_REGISTER.md), and [non-goals](product/NON_GOALS.md).

The 17 required foundation choices are collected in the [decision summary](architecture/DECISION_SUMMARY.md) and justified by linked ADRs.
