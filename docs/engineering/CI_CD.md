# CI and release automation

Pull requests and main-branch pushes use pinned GitHub Actions, Node 24.18.0, pnpm 11.9.0 through Corepack, a frozen lockfile, temporary SQLite files, and synthetic fixtures. Quality jobs run static checks, unit/integration/contracts/evals/parsers/security/ATS/exports/portability/deletion/performance, docs/notices/audit, and the production build. Browser jobs migrate an isolated SQLite file and run Playwright. Windows jobs build and smoke-test the portable package.

The Windows package strips duplicate package-manager virtual-store paths from the copied Next.js standalone output before archiving so the ZIP remains extractable by normal PowerShell and Windows archive tooling.

The release workflow runs only for version tags. It requires an annotated tag matching `package.json`, repeats the full gate, creates the Windows ZIP and source archive, records checksums, generates attestations, and opens a draft GitHub release. It does not deploy a hosted service.

Permissions default to `contents: read`; write, attestations, and release permissions are job-specific. Fork pull requests receive no secrets. Artifacts contain synthetic results only and have bounded retention. Caches and logs must not contain user data, local settings, or credentials.

Remote CodeQL/code-scanning is not an automatic repository workflow for the local MVP. Maintainers may run it separately as optional publication evidence when the repository plan and permissions support code scanning; local release readiness is verified by the documented security, audit, parser, SSRF, package, and browser gates.

Remote workflow configuration existing in the repository is not proof it ran. Publication is a maintainer action and not required for local users.
