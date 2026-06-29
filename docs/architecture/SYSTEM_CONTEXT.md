# System context

```mermaid
C4Context
  title Vitae Stack system context
  Person(user, "Job seeker", "Owns career data, reviews facts and changes")
  Person(operator, "Self-hosting operator", "Deploys, backs up, and upgrades")
  System(vitae, "Vitae Stack", "Evidence-grounded career document platform")
  System_Ext(ai, "Configured AI provider", "OpenAI-compatible endpoint or Ollama")
  System_Ext(web, "Public job website", "Untrusted job-description content")
  System_Ext(browser, "User browser", "Renders UI and downloads exports")
  Rel(user, vitae, "Manages facts, jobs, documents, reviews, exports", "HTTPS")
  Rel(operator, vitae, "Configures and monitors", "Local/HTTPS")
  Rel(vitae, ai, "Sends disclosed minimal task context", "HTTPS or loopback")
  Rel(vitae, web, "Fetches bounded public content", "Hardened HTTPS fetcher")
  Rel(vitae, browser, "Secure session, typed API, downloads", "HTTPS")
```

## Trust boundaries

Browser input, uploaded files, retrieved URLs, imported archives, templates, and model output are untrusted. The web application is an authorization boundary, not merely a UI backend. The worker has restricted database/storage access and no authority to bypass workspace or claim validation. AI providers are external data processors selected by the user; even loopback models are untrusted output producers.

The reference deployment has no required SaaS. Reverse proxy/TLS, S3-compatible storage, and remote AI endpoints are optional. SMTP is not required for closed personal deployment; operator-assisted password reset is documented until email is configured.
