# Dependency policy

Prefer maintained, narrowly scoped, open-source dependencies with compatible licenses, TypeScript support, reproducible releases, security response history, and no mandatory cloud service. Every direct dependency needs an owner/purpose and should sit behind a project interface when it touches auth, database, parser, provider, storage, editor, jobs, or export.

Use pnpm lockfile with frozen CI installs. Pin container images by digest for releases and GitHub Actions by commit. Dependabot groups low-risk patch/minor updates by ecosystem; major/security updates receive focused review. Never auto-merge parser, auth, crypto, network, renderer, ORM/migration, or provider SDK changes without tests.

Review licenses against AGPL distribution, transitive dependencies, install scripts/native binaries, network/telemetry behavior, maintenance cadence, advisories, bundle/runtime cost, and alternatives. Generate SBOM and notices for releases. GPL/AGPL compatibility questions require maintainer/legal review; documentation is not legal advice.

Vulnerabilities are triaged by exploitability and asset exposure. Critical/high reachable issues block release; fixes use patched versions or remove/isolate functionality. Exceptions record CVE, owner, compensating control, expiry, and risk-register entry.

Framework/runtime versions follow supported lines: Node production uses an LTS line (Node's official guidance says production applications should use Active or Maintenance LTS), and React/Next security advisories are applied promptly. M01 verifies exact compatible versions rather than using floating `latest` in committed manifests.
