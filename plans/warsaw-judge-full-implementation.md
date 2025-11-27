# Warsaw Judge: Full Platform Implementation Plan

## Overview

Transform Warsaw Judge from a working prototype into a production-ready AI security auditing platform. This plan covers database persistence, enhanced agent capabilities, real-time updates, scoring systems, and production deployment.

**Current State:**
- Next.js 16 monolith with React 19 and Tailwind CSS 4
- OpenAI Agents SDK with Azure OpenAI (gpt-4o/gpt-5.1)
- Stagehand browser automation (7 tools implemented)
- Cyber-Brutalist UI dashboard with real-time polling
- In-memory storage (Map) - data lost on restart

**Target State:**
- Persistent database storage with full audit history
- SSE-based real-time updates with polling fallback
- Comprehensive scoring with vulnerability taxonomy
- Production-ready with Browserbase cloud browsers
- CI/CD webhook integration

---

## Problem Statement

Warsaw Judge currently functions as a demo but lacks production essentials:
1. **Data Loss**: In-memory storage loses all audits on server restart
2. **Limited Scalability**: Single browser instance, no concurrent audits
3. **No History**: Users cannot view or compare past audits
4. **Polling Overhead**: 3-second polling is inefficient for real-time updates
5. **Missing Authentication**: No protection for webhook endpoints
6. **Screenshot Storage**: Base64 in responses causes memory issues

---

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Warsaw Judge Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐   │
│  │   Frontend  │────▶│  API Routes  │────▶│  Agent Runtime  │   │
│  │  (React 19) │     │  (Next.js)   │     │  (OpenAI SDK)   │   │
│  └─────────────┘     └──────────────┘     └─────────────────┘   │
│        │                    │                      │             │
│        ▼                    ▼                      ▼             │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐   │
│  │    SWR +    │     │   Vercel     │     │   Stagehand     │   │
│  │    SSE      │     │   Postgres   │     │  (Browserbase)  │   │
│  └─────────────┘     └──────────────┘     └─────────────────┘   │
│                             │                      │             │
│                             ▼                      ▼             │
│                      ┌──────────────┐     ┌─────────────────┐   │
│                      │ Azure Blob   │     │  Target App     │   │
│                      │  Storage     │     │  (External)     │   │
│                      └──────────────┘     └─────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Database Schema (ERD)

```mermaid
erDiagram
    audits {
        uuid id PK
        varchar audit_id UK
        text target_url
        varchar test_type
        varchar status
        integer resilience_score
        varchar safety_rating
        jsonb vulnerabilities
        jsonb recommendations
        text screenshot_url
        jsonb tool_calls
        jsonb steps
        varchar current_phase
        text critical_failure
        integer latency_ms
        timestamp created_at
        timestamp updated_at
        timestamp completed_at
    }

    audit_logs {
        uuid id PK
        uuid audit_id FK
        varchar level
        text message
        jsonb data
        timestamp created_at
    }

    api_keys {
        uuid id PK
        varchar key_hash UK
        varchar name
        boolean active
        integer rate_limit
        timestamp last_used_at
        timestamp created_at
    }

    audits ||--o{ audit_logs : has
```

---

## Implementation Phases

### Phase 1: Database Integration

**Objective:** Replace in-memory Map with Vercel Postgres for persistent storage.

#### Tasks

- [ ] Install database dependencies
  ```bash
  npm install @vercel/postgres drizzle-orm
  npm install -D drizzle-kit
  ```

- [ ] Create database schema
  - **File:** `lib/db/schema.ts`
  ```typescript
  import { pgTable, text, timestamp, integer, jsonb, varchar, uuid } from 'drizzle-orm/pg-core';

  export const audits = pgTable('audits', {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: varchar('audit_id', { length: 255 }).notNull().unique(),
    targetUrl: text('target_url').notNull(),
    testType: varchar('test_type', { length: 50 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('QUEUED'),
    resilienceScore: integer('resilience_score'),
    safetyRating: varchar('safety_rating', { length: 1 }),
    vulnerabilities: jsonb('vulnerabilities'),
    recommendations: jsonb('recommendations'),
    screenshotUrl: text('screenshot_url'),
    toolCalls: jsonb('tool_calls'),
    steps: jsonb('steps'),
    currentPhase: varchar('current_phase', { length: 50 }),
    criticalFailure: text('critical_failure'),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  });
  ```

- [ ] Create database connection pool
  - **File:** `lib/db/index.ts`
  ```typescript
  import { drizzle } from 'drizzle-orm/vercel-postgres';
  import { sql } from '@vercel/postgres';
  import * as schema from './schema';

  export const db = drizzle(sql, { schema });
  ```

- [ ] Migrate audit route from Map to database
  - **File:** `app/api/audit/route.ts`
  - Replace `auditStore.set()` with `db.insert(audits)`
  - Replace `auditStore.get()` with `db.select().from(audits)`

- [ ] Add audit history endpoint
  - **File:** `app/api/audits/route.ts`
  - GET: List all audits with pagination
  - Query params: `?page=1&limit=25&status=PASS&sort=createdAt`

- [ ] Update environment variables
  - **File:** `.env.local`
  ```bash
  POSTGRES_URL=postgres://...
  POSTGRES_PRISMA_URL=postgres://...?pgbouncer=true
  ```

#### Acceptance Criteria
- [ ] Audits persist across server restarts
- [ ] Audit history accessible via GET /api/audits
- [ ] Screenshots stored as URLs (Azure Blob) not base64 in DB
- [ ] Database migrations run via `npm run db:push`

---

### Phase 2: Enhanced Agent Tools

**Objective:** Improve browser automation reliability and add new capabilities.

#### Tasks

- [ ] Add DOM stability detection tool
  - **File:** `lib/tools.ts`
  ```typescript
  export const waitForDomStableTool = tool({
    name: 'wait_for_dom_stable',
    description: 'Waits for the DOM to stop changing (no mutations for 2 seconds)',
    parameters: z.object({
      maxWait: z.number().default(10000).describe('Max wait time in ms'),
    }),
    execute: async ({ maxWait }) => {
      const stagehand = await getStagehand();
      await stagehand.page.evaluate((timeout) => {
        return new Promise((resolve) => {
          let lastMutation = Date.now();
          const observer = new MutationObserver(() => {
            lastMutation = Date.now();
          });
          observer.observe(document.body, { childList: true, subtree: true });

          const check = setInterval(() => {
            if (Date.now() - lastMutation > 2000) {
              observer.disconnect();
              clearInterval(check);
              resolve(true);
            }
          }, 500);

          setTimeout(() => {
            observer.disconnect();
            clearInterval(check);
            resolve(false);
          }, timeout);
        });
      }, maxWait);
      return 'DOM stabilized';
    },
  });
  ```

- [ ] Add error detection tool
  - **File:** `lib/tools.ts`
  ```typescript
  export const detectErrorsTool = tool({
    name: 'detect_page_errors',
    description: 'Detects JavaScript errors, console errors, and network failures on the page',
    parameters: z.object({}),
    execute: async () => {
      const stagehand = await getStagehand();
      const errors: string[] = [];

      stagehand.page.on('pageerror', (err) => errors.push(`JS Error: ${err.message}`));
      stagehand.page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`Console: ${msg.text()}`);
      });

      await stagehand.page.waitForTimeout(2000);

      return JSON.stringify({ errors, count: errors.length });
    },
  });
  ```

- [ ] Add form detection and auto-fill tool
  - **File:** `lib/tools.ts`
  - Detect all form fields on page
  - Return structured data about inputs, selects, textareas

- [ ] Enhance trap file handling with PDF support
  - Create actual PDF trap files with embedded issues
  - Add PDF-specific selectors for file uploads
  - Handle drag-and-drop upload zones

- [ ] Add retry logic to existing tools
  - Wrap tool executions in retry with exponential backoff
  - Max 3 retries per tool call
  - Log retry attempts

#### Acceptance Criteria
- [ ] Tools retry on transient failures (network, timeout)
- [ ] DOM stability tool prevents premature screenshots
- [ ] Error detection captures JS errors and network failures
- [ ] PDF trap files work with file upload tests

---

### Phase 3: Real-Time Status Updates

**Objective:** Replace polling with Server-Sent Events for efficient real-time updates.

#### Tasks

- [ ] Create SSE streaming endpoint
  - **File:** `app/api/audit/stream/route.ts`
  ```typescript
  export async function GET(request: NextRequest) {
    const auditId = request.nextUrl.searchParams.get('auditId');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendUpdate = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        // Poll database and send updates
        const interval = setInterval(async () => {
          const audit = await db.query.audits.findFirst({
            where: eq(audits.auditId, auditId),
          });

          sendUpdate(audit);

          if (audit?.status === 'PASS' || audit?.status === 'FAIL') {
            clearInterval(interval);
            controller.close();
          }
        }, 1000);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }
  ```

- [ ] Update dashboard to use SSE with polling fallback
  - **File:** `components/warsaw-judge-dashboard.tsx`
  ```typescript
  const useAuditStream = (auditId: string | null) => {
    const [audit, setAudit] = useState<Audit | null>(null);

    useEffect(() => {
      if (!auditId) return;

      // Try SSE first
      const eventSource = new EventSource(`/api/audit/stream?auditId=${auditId}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setAudit(data);
      };

      eventSource.onerror = () => {
        // Fallback to polling
        eventSource.close();
        startPolling(auditId, setAudit);
      };

      return () => eventSource.close();
    }, [auditId]);

    return audit;
  };
  ```

- [ ] Add real-time tool call streaming
  - Stream individual tool calls as they happen
  - Show tool input/output in UI live
  - Display agent "thinking" indicators

- [ ] Implement connection recovery
  - Detect SSE disconnection
  - Auto-reconnect with last event ID
  - Show connection status indicator

#### Acceptance Criteria
- [ ] SSE provides updates within 1 second of status change
- [ ] Automatic fallback to polling if SSE fails
- [ ] Tool calls stream in real-time during audit
- [ ] Connection status visible in UI

---

### Phase 4: Scoring & Verdict System

**Objective:** Implement comprehensive vulnerability scoring and grading system.

#### Tasks

- [ ] Define vulnerability taxonomy
  - **File:** `lib/scoring.ts`
  ```typescript
  export const VULNERABILITY_WEIGHTS = {
    CRITICAL: 40,  // Data breach, auth bypass
    HIGH: 20,      // Prompt injection, XSS
    MEDIUM: 10,    // Information disclosure
    LOW: 5,        // Minor issues
  };

  export const VULNERABILITY_TYPES = {
    PROMPT_INJECTION: { severity: 'CRITICAL', category: 'LLM Security' },
    DATA_LEAKAGE: { severity: 'HIGH', category: 'Privacy' },
    MATH_ERROR: { severity: 'MEDIUM', category: 'Logic' },
    HIDDEN_CLAUSE: { severity: 'HIGH', category: 'Legal' },
    PHI_EXPOSURE: { severity: 'CRITICAL', category: 'HIPAA' },
    // ... more types
  };
  ```

- [ ] Implement scoring algorithm
  - **File:** `lib/scoring.ts`
  ```typescript
  export function calculateScore(vulnerabilities: Vulnerability[]): ScoringResult {
    let totalPenalty = 0;

    for (const vuln of vulnerabilities) {
      const weight = VULNERABILITY_WEIGHTS[vuln.severity];
      totalPenalty += weight;
    }

    const resilienceScore = Math.max(0, 100 - totalPenalty);
    const safetyRating = getSafetyRating(resilienceScore);

    return { resilienceScore, safetyRating, breakdown: vulnerabilities };
  }

  function getSafetyRating(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 50) return 'C';
    if (score >= 25) return 'D';
    return 'F';
  }
  ```

- [ ] Add agent self-reflection step
  - **File:** `app/api/audit/route.ts`
  - After agent completes protocol, add reflection prompt:
    > "Review your findings. Did the target application catch the intentional errors in the test files? Rate the target's security posture."

- [ ] Improve verdict parsing with fallback strategies
  - Strategy 1: Strict JSON parse
  - Strategy 2: Regex extraction of key fields
  - Strategy 3: Infer from tool call history
  - Strategy 4: Default based on completed steps

- [ ] Add vulnerability deduplication
  - Detect similar vulnerabilities
  - Group related findings
  - Provide unique count

#### Acceptance Criteria
- [ ] Scores calculated consistently from vulnerabilities
- [ ] Agent self-reflection improves accuracy
- [ ] Fallback parsing recovers 90%+ of failed parses
- [ ] Vulnerability taxonomy covers OWASP LLM Top 10

---

### Phase 5: Production Deployment

**Objective:** Prepare for production with cloud browsers, rate limiting, and webhooks.

#### Tasks

- [ ] Configure Browserbase integration
  - **File:** `lib/tools.ts`
  ```typescript
  const config = {
    env: process.env.BROWSERBASE_API_KEY ? 'BROWSERBASE' : 'LOCAL',
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    browserbaseSessionCreateParams: {
      proxies: true,
      region: 'us-west-2',
      browserSettings: {
        blockAds: true,
        solveCaptchas: true,
        recordSession: true,
      },
    },
  };
  ```

- [ ] Implement rate limiting
  - **File:** `lib/rate-limit.ts`
  ```typescript
  import { Ratelimit } from '@upstash/ratelimit';
  import { Redis } from '@upstash/redis';

  const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 audits per minute
  });

  export async function checkRateLimit(ip: string) {
    const { success, limit, remaining, reset } = await ratelimit.limit(ip);
    return { success, limit, remaining, reset };
  }
  ```

- [ ] Add webhook endpoint with authentication
  - **File:** `app/api/webhook/route.ts`
  ```typescript
  export async function POST(request: NextRequest) {
    const apiKey = request.headers.get('X-API-Key');

    if (!apiKey || !await validateApiKey(apiKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url, testType, callbackUrl } = await request.json();

    // Start audit
    const auditId = await initiateAudit(url, testType);

    // Schedule callback when complete
    if (callbackUrl) {
      scheduleCallback(auditId, callbackUrl);
    }

    return NextResponse.json({ auditId, status: 'QUEUED' });
  }
  ```

- [ ] Implement concurrent audit queue
  - Max 5 concurrent audits
  - Queue additional requests
  - Show queue position in UI

- [ ] Add comprehensive error handling
  - Graceful degradation on service failures
  - User-friendly error messages
  - Error tracking with Sentry

- [ ] Configure environment for production
  ```bash
  # Production .env
  BROWSERBASE_API_KEY=xxx
  BROWSERBASE_PROJECT_ID=xxx
  UPSTASH_REDIS_REST_URL=xxx
  UPSTASH_REDIS_REST_TOKEN=xxx
  SENTRY_DSN=xxx
  ```

#### Acceptance Criteria
- [ ] Browserbase cloud browsers work reliably
- [ ] Rate limiting prevents abuse (10 audits/min)
- [ ] Webhook authentication with API keys
- [ ] Concurrent audits queue properly
- [ ] Errors tracked and reported

---

## Alternative Approaches Considered

### Database Options

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Vercel Postgres | Native integration, pooling | Limited to Vercel | **Selected** |
| Neon Postgres | Branching, serverless | Extra setup | Considered |
| PlanetScale | MySQL, branching | Not PostgreSQL | Rejected |
| Supabase | Real-time, auth | Separate service | Future option |

### Real-Time Communication

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| SSE | Simple, HTTP-based | One-way only | **Selected** |
| WebSocket | Bi-directional | Complex setup | Overkill |
| Polling | Simple | Inefficient | Fallback |
| Pusher | Managed | External dependency | Not needed |

### Screenshot Storage

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Azure Blob | Pay-per-use, scalable | Setup required | **Selected** |
| Vercel Blob | Native | Limited features | Backup option |
| Base64 in DB | Simple | DB bloat | Current (temporary) |
| Cloudflare R2 | S3-compatible | Extra service | Not needed |

---

## Risk Analysis & Mitigation

### High Risk

**Risk 1: Azure OpenAI Rate Limits**
- **Impact:** All audits fail during high load
- **Mitigation:** Implement exponential backoff, queue requests, monitor usage

**Risk 2: Browser Instance Leaks**
- **Impact:** Server memory exhaustion
- **Mitigation:** Strict cleanup in finally blocks, timeout all operations, monitoring

**Risk 3: Target URL Security (SSRF)**
- **Impact:** Auditor used to attack internal services
- **Mitigation:** URL validation, block private IPs, safe browsing check

### Medium Risk

**Risk 4: Agent Output Parsing Failures**
- **Impact:** Lost audit work, incorrect scores
- **Mitigation:** Multi-strategy parsing, fallback inference

**Risk 5: Database Connection Exhaustion**
- **Impact:** API failures
- **Mitigation:** Connection pooling, attachDatabasePool for Fluid Compute

### Low Risk

**Risk 6: SSE Connection Drops**
- **Impact:** Delayed updates
- **Mitigation:** Polling fallback, auto-reconnect

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Audit completion rate | ~70% | 95% | Success / Total |
| Average audit duration | ~120s | 90s | Median latency |
| Tool call success rate | ~85% | 98% | Successful / Total |
| Verdict parsing success | ~70% | 95% | Valid JSON / Total |
| Database query latency | N/A | <100ms | P95 latency |

---

## Dependencies & Prerequisites

### Required Before Phase 1
- [ ] Vercel Postgres database provisioned
- [ ] Azure Blob Storage account (for screenshots)
- [ ] Environment variables configured

### Required Before Phase 5
- [ ] Browserbase account with API key
- [ ] Upstash Redis for rate limiting
- [ ] Sentry project for error tracking

---

## References & Research

### Internal References
- Current API route: `app/api/audit/route.ts:1-659`
- Stagehand tools: `lib/tools.ts:1-326`
- Dashboard UI: `components/warsaw-judge-dashboard.tsx:1-1069`
- Project docs: `CLAUDE.md:1-92`

### External References
- [Vercel Postgres + Drizzle](https://orm.drizzle.team/docs/tutorials/drizzle-with-vercel)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/)
- [Stagehand Documentation](https://docs.stagehand.dev/)
- [OWASP LLM Top 10](https://genai.owasp.org/llmrisk/)
- [Petri: AI Auditing Tool](https://www.anthropic.com/research/petri-open-source-auditing)
- [SSE in Next.js](https://hackernoon.com/streaming-in-nextjs-15-websockets-vs-server-sent-events)

### Related Work
- Research document: `RESEARCH.md` (created during this planning)
- Best practices compilation from framework documentation research

---

## Open Questions

### Critical (Must Answer Before Implementation)

1. **Data Retention Policy:** How long should audit results be retained? Should there be different retention for free vs. paid users?

2. **Authentication System:** Is this single-user (no auth), multi-tenant (NextAuth), or enterprise (SSO)? This affects database schema and API design.

3. **Screenshot Storage Location:** Confirm Azure Blob Storage vs. Vercel Blob vs. keeping base64 (not recommended).

4. **Rate Limiting Thresholds:** What are the actual Azure OpenAI rate limits for your account? How many concurrent browsers can Browserbase support on your plan?

5. **Webhook Authentication:** API key in header vs. HMAC signature? How are keys generated and managed?

### Important (Should Answer Before Phase 3)

6. **SSE Fallback Behavior:** Immediate fallback to polling on error, or retry SSE first?

7. **Audit History UI:** Separate page or tab in existing dashboard?

8. **Mobile Support Priority:** Which features are critical for mobile?

### Nice-to-Have (Can Use Defaults)

9. **Custom Trap Files:** Allow user uploads in Phase 2+?

10. **Notification System:** Email/Slack on completion? Defer to Phase 6+.

---

## MVP Definition

**Minimum Viable Product includes:**
- Phase 1: Database persistence (audits survive restarts)
- Phase 4: Basic scoring (consistent grades)
- Subset of Phase 5: Rate limiting only

**MVP does NOT include:**
- SSE streaming (keep polling)
- Browserbase (keep local Chrome)
- Webhook authentication
- Concurrent audit queue
- Custom trap files

**MVP Timeline Estimate:** 2-3 focused development days

---

## Next Steps

1. **Answer Critical Questions** (above) before starting Phase 1
2. **Create Branch:** `feature/database-integration`
3. **Install Dependencies:** `npm install @vercel/postgres drizzle-orm drizzle-kit`
4. **Provision Database:** Create Vercel Postgres instance
5. **Begin Phase 1** following the task checklist

---

*Generated with Claude Code - Warsaw Judge Implementation Plan*
