# Personal use

Vitae Stack runs only on your computer. It needs no Vitae Stack account, Docker installation, database server, or cloud service.

## Windows

1. Extract the release ZIP to a normal folder.
2. Double-click `Start Vitae Stack.cmd`.
3. Use the page opened at <http://127.0.0.1:3000>.
4. Double-click `Stop Vitae Stack.cmd` when finished.

The release includes its own Node.js runtime. The first start creates `%LOCALAPPDATA%\Vitae Stack` unless `VITAE_DATA_DIR` is explicitly set. Stopping or updating the application does not remove that folder.

## Where data is stored

- `vitae.sqlite`: career entries, evidence, document content, version history, settings metadata, and audit records.
- `files/`: uploaded source documents and generated export files.
- `settings.env`: a generated local key used to encrypt optional model-provider credentials.
- `runtime/`: process identifiers and local logs. Logs must not contain resume content, provider request data, credentials, or model output.

To make a manual backup, stop Vitae Stack and copy the entire `Vitae Stack` data folder. Restore only while the application is stopped, and restore the whole folder as one unit. Before starting an older restore, carry the newest content-free `files/.deletions/` ledger forward from the preserved current folder so confirmed deletions are not revived. The in-product portability export is the provider-neutral way to move user-owned career and document data.

No model is configured automatically. Manual editing and export remain usable without AI, while ATS analysis requires a tested provider/model assigned to AI-11. Ollama at `http://127.0.0.1:11434` is the intended account-free option; remote OpenAI-compatible providers are explicit opt-in choices and receive only the task context disclosed in the UI.

The application listens only on loopback. Do not alter it to listen on a LAN or public address; the local release has no login boundary.
