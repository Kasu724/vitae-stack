# Dependency policy

Use the frozen pnpm lockfile and exact direct versions. GitHub Actions are pinned to full commit SHAs. The packaged Node runtime version and downloaded archive checksum are fixed in the package builder and verified against Node's official `SHASUMS256.txt`.

Prefer maintained, open-source, locally runnable libraries with no required SaaS. Production dependencies need a concrete product function and license/advisory review. Avoid identity, database-server, container, cloud-storage, telemetry, and provider SDK dependencies when platform APIs or small provider-neutral adapters suffice.

Parser, crypto, network, renderer, SQLite/migration, and provider changes require focused malicious fixtures, integration tests, a production build, and package smoke. Next.js/React/Node upgrades additionally require official documentation review and standalone-output verification. PDFKit, `docx`, PDF.js, Mammoth, and native canvas upgrades require parse-back, injection, fidelity, and pagination checks.

Dependabot covers npm and GitHub Actions. Do not auto-merge major or security-sensitive updates. `pnpm security:check` scans repository secrets/configuration and audits production packages; release review also checks notices, source publication links, checksums, and fixable high/critical advisories.
