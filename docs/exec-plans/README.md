# Execution plans

Execution plans translate requirements and ADRs into independently verifiable work. The [active MVP plan](active/MVP_IMPLEMENTATION.md) is sequencing authority; [traceability](REQUIREMENTS_TRACEABILITY.md) maps requirements to milestones/tests; [risk register](RISK_REGISTER.md) and [technical debt](TECH_DEBT.md) remain live.

Milestone IDs are stable references for issues, commits, and release notes. An implementation PR should normally advance one milestone outcome, declare non-scope, and include the milestone's tests/docs. A milestone moves to `completed/` only after every completion criterion is evidenced; `.gitkeep` reserves that directory now.

Plans are living documents, not evidence of implementation. Update them when facts change, but use ADRs to change accepted architecture and product requirements to change user behavior.
