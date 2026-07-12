# Vitae Stack

Vitae Stack is a private, evidence-grounded resume and cover-letter tailoring tool. It runs on one computer, requires no account, and saves its data locally. Generated factual claims must cite user-approved evidence; unsupported claims block final export. ATS results are explainable estimates, not guarantees.

## Download-and-run model

The Windows release is a portable ZIP, not an installer. To install and run it:

1. Download the `vitae-stack-personal-<version>-windows-x64.zip` release file.
2. Extract the ZIP to a normal local folder. Do not run the tool directly from inside the ZIP viewer.
3. Open the extracted folder.
4. Double-click `Start Vitae Stack.cmd`.
5. Use the browser page opened at <http://127.0.0.1:3000>.
6. When finished, double-click `Stop Vitae Stack.cmd`. Stopping the process preserves your data.

On first start, the launcher opens the tool at <http://127.0.0.1:3000> and creates:

- `%LOCALAPPDATA%\Vitae Stack\vitae.sqlite` for structured records and history;
- `%LOCALAPPDATA%\Vitae Stack\files\` for uploads and generated documents; and
- `%LOCALAPPDATA%\Vitae Stack\settings.env` for the locally generated credential-encryption key.

No Docker, PostgreSQL server, cloud database, application account, telemetry service, or hosted AI provider is required. To uninstall the application binaries, stop Vitae Stack and delete the extracted application folder. To remove local user data too, delete `%LOCALAPPDATA%\Vitae Stack` after making any backup you want to keep. See [personal use](PERSONAL_README.md).

### Build the ZIP

To build the portable Windows ZIP from a checkout:

1. Install the development prerequisites: Node.js 24.18.0 and Git.
2. Verify Corepack can run the pinned package manager:

   ```text
   corepack pnpm --version
   ```

3. Install dependencies:

   ```text
   corepack pnpm install --frozen-lockfile
   ```

4. Build the portable package:

   ```text
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\personal\package.ps1
   ```

   You can also double-click `Build Personal Bundle.cmd`, which runs the same script.

The build creates `dist\vitae-stack-personal-<version>-windows-x64.zip` and `dist\vitae-stack-personal-<version>-windows-x64.zip.sha256`. The script builds the production Next.js standalone output, bundles the parser and migration runner, downloads and verifies the pinned Node.js runtime, and rejects local data paths before writing the ZIP.

## Development

Node.js 24.18.0 and pnpm 11.9.0 are the supported toolchain.

```text
corepack pnpm install --frozen-lockfile
corepack pnpm db:migrate
corepack pnpm dev
```

Development defaults to `./var/vitae.sqlite` and private artifacts/queues under `./var/private/`. Copy `.env.example` only when overriding defaults. Build the portable Windows package with `scripts/personal/package.ps1` or `Build Personal Bundle.cmd`.

## Architecture and scope

The application is a TypeScript/Next.js modular monolith. SQLite provides transactions, constraints, indexes, and durable document/version/provenance relationships while remaining one ordinary local file. Uploaded and generated binary files stay in a separate local folder. AI providers are optional and sit behind a provider-neutral interface; Ollama and OpenAI-compatible endpoints are supported without making either mandatory.

The release is deliberately local-only and single-user. Remote hosting, shared accounts, team workspaces, job-board scraping, and automated job submission are outside the MVP.

## Status and licensing

Implementation exists, but this README does not claim an unpublished release.

Vitae Stack is licensed under the [MIT License](LICENSE). Security reports should follow [SECURITY.md](SECURITY.md). Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md).
