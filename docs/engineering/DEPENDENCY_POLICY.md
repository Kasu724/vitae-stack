# Dependency policy

Prefer maintained, narrowly scoped, open-source dependencies with compatible licenses, TypeScript support, reproducible releases, security response history, and no mandatory cloud service. Every direct dependency needs an owner/purpose and should sit behind a project interface when it touches auth, database, parser, provider, storage, editor, jobs, or export.

Use pnpm lockfile with frozen CI installs. Pin container images by digest for releases and GitHub Actions by commit. Dependabot groups low-risk patch/minor updates by ecosystem; major/security updates receive focused review. Never auto-merge parser, auth, crypto, network, renderer, ORM/migration, or provider SDK changes without tests.

Review licenses against AGPL distribution, transitive dependencies, install scripts/native binaries, network/telemetry behavior, maintenance cadence, advisories, bundle/runtime cost, and alternatives. Generate SBOM and notices for releases. GPL/AGPL compatibility questions require maintainer/legal review; documentation is not legal advice.

Vulnerabilities are triaged by exploitability and asset exposure. Critical/high reachable issues block release; fixes use patched versions or remove/isolate functionality. Exceptions record CVE, owner, compensating control, expiry, and risk-register entry.

Framework/runtime versions follow supported lines: Node production uses an LTS line (Node's official guidance says production applications should use Active or Maintenance LTS), and React/Next security advisories are applied promptly. M01 verifies exact compatible versions rather than using floating `latest` in committed manifests.

M17 pins PDFKit 0.19.1 and `docx` 9.7.1 behind the export module. They are MIT-licensed, self-hosted libraries with no required network service. Renderer upgrades require PDF/DOCX parse-back, structure/injection fixtures, Poppler metadata, visual pagination review, production build, audit, and manifest-version review; Dependabot changes are never auto-merged for these packages.

M19/M22 workflows pin CodeQL Action 4.36.0, Checkout 7.0.0, Setup Node 6.4.0, Upload Artifact 7.0.1, Download Artifact 8.0.1, Attest 4.1.1, Docker Login 4.2.0, Metadata 6.1.0, Docker Build Push 7.2.0, Docker Setup Buildx 4.1.0, Anchore Scan 7.4.0, and Anchore SBOM 0.24.0 by full commit. Grype scans built images and blocks fixed high/critical findings; Syft creates SPDX JSON. This avoids the Trivy action line affected by the March 2026 supply-chain incident. Action upgrades require official release/signature/history review, full-SHA refresh, and a synthetic workflow run.

The Dockerfile pins the Node 24.17.0 Bookworm Slim multi-platform manifest digest and Compose pins PostgreSQL 18.4 Bookworm by digest. Release images are rebuilt from the signed tag with BuildKit SBOM and maximum provenance attestations; mutable base/image tags alone are not release evidence.
