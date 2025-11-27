# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Build for production
npm run lint     # Run ESLint
npm run start    # Start production server
```

## Environment Setup

Copy `.env.example` to `.env.local` and configure:
- `AZURE_OPENAI_API_KEY` - Required for Azure OpenAI
- `AZURE_OPENAI_ENDPOINT` - Azure OpenAI endpoint URL
- `AZURE_OPENAI_API_VERSION` - API version (default: 2024-12-01-preview)
- `AZURE_OPENAI_DEPLOYMENT` - Deployment name (default: gpt-4o)
- `BROWSERBASE_API_KEY` - Optional, for cloud browser automation (defaults to local Chrome)
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` - Optional, custom Chromium path for Stagehand

## Architecture

Next.js 16 (App Router) monolith with React 19 and Tailwind CSS 4. This is the "Warsaw Judge" - an AI agent security auditing platform that autonomously tests web applications for vulnerabilities.

### Agentic Architecture

```
Frontend (React) → API Route → OpenAI Agent → Stagehand (Browser) → Target App
     ↑                              ↓
     └──────── Polling ◄── Results ─┘
```

The audit flow:
1. **POST `/api/audit`** - Initiates audit, returns `auditId`, runs `runAudit()` in background
2. **Agent Execution** - OpenAI Agent executes protocol phases using browser tools
3. **GET `/api/audit?auditId=X`** - Frontend polls for status, logs, tool calls, screenshot
4. **In-memory Store** - `auditStore` Map holds audit state (use Redis/DB in production)

### Key Structure

- **`app/`** - Next.js App Router
  - `page.tsx` - Renders `WarsawJudgeDashboard`
  - `api/audit/route.ts` - POST: initiates audit, GET: polls status
  - `globals.css` - OKLCH color system with Tailwind v4
- **`components/warsaw-judge-dashboard.tsx`** - Main dashboard (1600+ lines, client component)
- **`components/ui/`** - shadcn/ui components (Radix primitives)
- **`lib/tools.ts`** - 10 Stagehand browser automation tools wrapped as OpenAI Agent function tools
- **`lib/agent-config.ts`** - Protocol definitions, system prompts, scoring logic, attack payloads
- **`lib/audit-logger.ts`** - Centralized logging system with callbacks
- **`public/traps/`** - Intentionally malformed test files for security auditing

### Agent Tools (lib/tools.ts)

| Tool | Description |
|------|-------------|
| `navigate_browser` | Navigate to URL, returns page stats and status |
| `perform_action` | AI-driven page interaction (click, type, upload) |
| `extract_page_data` | Extract structured data using AI vision |
| `observe_page` | List possible actions (limited to 10) |
| `capture_evidence` | Screenshot stored separately to avoid token overflow |
| `upload_trap_file` | Upload pre-configured trap files |
| `wait_for_change` | Wait N milliseconds |
| `check_page_errors` | Console errors, warnings, security issues |
| `test_input_field` | Test input with security payload (XSS, SQLi) |
| `get_page_info` | Full page analysis (forms, inputs, AI indicators) |

### Audit Protocols (lib/agent-config.ts)

| Protocol | Purpose | Trap File |
|----------|---------|-----------|
| `generic` | Stress test - edge cases, prompt injection | N/A |
| `finance` | Invoice validation testing | `invoice_math_error.txt` |
| `medical` | HIPAA compliance, PHI exposure | `hipaa_violation.txt` |
| `legal` | Contract review AI testing | `malicious_contract.txt` |
| `owasp_llm` | LLM/AI security (OWASP Top 10 LLM) | `jailbreak_prompts.txt` |
| `rag_security` | RAG/vector DB poisoning | `rag_poison_doc.txt` |
| `pci_ecommerce` | Payment/checkout security | `test_payment.txt` |
| `wcag_accessibility` | WCAG 2.2 compliance | N/A |
| `gdpr_privacy` | Cookie consent, privacy policy | N/A |
| `api_security` | OWASP API Security Top 10 | N/A |
| `all` | Run ALL protocols sequentially | All trap files |

### Trap Files (`public/traps/`)

- **invoice_math_error.txt**: Invoice with intentional calculation errors
- **malicious_contract.txt**: Contract with buried dangerous clauses
- **hipaa_violation.txt**: Medical record with exposed PHI
- **jailbreak_prompts.txt**: Prompt injection and jailbreak attacks
- **rag_poison_doc.txt**: Document with hidden instructions for RAG poisoning
- **test_payment.txt**: Test payment data for validation testing
- **oversized_file.txt**: Large file for timeout/memory testing

### Tech Stack

- **Agent Runtime**: OpenAI Agents SDK (`@openai/agents`) with Azure OpenAI (Chat Completions API)
- **Browser Automation**: Stagehand (`@browserbasehq/stagehand`) with `@ai-sdk/azure`
- **UI**: shadcn/ui + lucide-react + framer-motion
- **Styling**: Tailwind CSS v4 (OKLCH colors via CSS variables: `--wj-toxic`, `--wj-danger`, etc.)
- **Validation**: zod
- **PDF Export**: jspdf (for audit reports)

### Path Aliases

`@/*` maps to project root.

### Key Implementation Details

**Agent Configuration** (lib/agent-config.ts):
- `generateSystemPrompt(protocol)` - Creates protocol-specific system prompts
- `generateMissionBrief(url, protocol)` - Creates the initial mission for the agent
- `AGENT_CONFIG` - maxTurns: 25, timeout: 5 minutes, maxConcurrentAudits: 5
- `SEVERITY_WEIGHTS` - CRITICAL: 40, HIGH: 20, MEDIUM: 10, LOW: 5

**Screenshot Handling**: Screenshots stored in `lastScreenshot` variable separately to avoid token overflow in agent context.

**Logging**: `setToolLogCallback` and `registerLogCallback` push logs to audit record for real-time UI updates.

### Build Notes

- TypeScript build errors ignored in production (`ignoreBuildErrors: true`)
- `serverExternalPackages` configured for Stagehand/Playwright
- Audits run async with polling (3s interval) for status updates
- Azure OpenAI requires `setOpenAIAPI('chat_completions')` (Responses API not supported)
- `setTracingDisabled(true)` avoids "No API key for tracing" warning
- Local Stagehand runs headless Chromium; set `BROWSERBASE_API_KEY` for cloud browser
