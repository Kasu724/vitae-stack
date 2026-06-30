# Documentation index

`docs/` is Vitae Stack's source of truth. M01–M05 are implemented locally; M06–M10 and M12 are in progress; other later milestone documents describe planned behavior unless they explicitly state otherwise. The active execution plan records current validation evidence and outstanding gates.

| Area             | Start here                                                                                                   | Authority                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Product          | [Product requirements](product/PRODUCT_REQUIREMENTS.md), [MVP scope](product/MVP_SCOPE.md)                   | User-visible behavior and boundaries |
| UX               | [UX specification](design/UX_SPECIFICATION.md), [accessibility](design/ACCESSIBILITY.md)                     | Interaction and WCAG requirements    |
| Architecture     | [Architecture overview](../ARCHITECTURE.md), [data model](architecture/DATA_MODEL.md)                        | System boundaries and contracts      |
| AI               | [AI principles](ai/AI_PRINCIPLES.md), [grounding](ai/GROUNDING_AND_PROVENANCE.md)                            | Model use and factual safety         |
| ATS              | [Methodology](ats/ATS_METHODOLOGY.md), [rubric](ats/SCORING_RUBRIC.md)                                       | Estimated compatibility rules        |
| Security/privacy | [Security architecture](security/SECURITY_ARCHITECTURE.md), [threat model](security/THREAT_MODEL.md)         | Trust boundaries and controls        |
| Engineering      | [Repository structure](engineering/REPOSITORY_STRUCTURE.md), [quality gates](engineering/QUALITY_GATES.md)   | Implementation conventions           |
| Decisions        | [ADR index](adr/README.md)                                                                                   | Accepted architectural decisions     |
| Delivery         | [MVP plan](exec-plans/active/MVP_IMPLEMENTATION.md), [traceability](exec-plans/REQUIREMENTS_TRACEABILITY.md) | Sequencing and verification          |

Conflicts are resolved in this order: accepted ADRs for technical decisions; product requirements and acceptance criteria for behavior; security documents for minimum controls; active execution plan for sequencing. Update all affected layers when a decision changes.

Cross-cutting references: [glossary](GLOSSARY.md), [open questions](OPEN_QUESTIONS.md), [risk register](exec-plans/RISK_REGISTER.md), and [non-goals](product/NON_GOALS.md).

The 17 required foundation choices are collected in the [decision summary](architecture/DECISION_SUMMARY.md) and justified by linked ADRs.
