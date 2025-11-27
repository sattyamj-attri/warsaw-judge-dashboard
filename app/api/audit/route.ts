import { Agent, run, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } from '@openai/agents';
import { AzureOpenAI } from 'openai';
import { auditTools, cleanupStagehand, getLastScreenshot, clearLastScreenshot, setToolLogCallback } from '@/lib/tools';
import { NextRequest, NextResponse } from 'next/server';
import {
  routeLog,
  agentLog,
  setCurrentAuditId,
  registerLogCallback,
  unregisterLogCallback,
  clearAuditLogs,
} from '@/lib/audit-logger';
import {
  generateSystemPrompt,
  generateMissionBrief,
  AGENT_CONFIG,
  AUDIT_PROTOCOLS,
} from '@/lib/agent-config';

// Alias for backwards compatibility
function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'AGENT', message: string, data?: unknown) {
  if (level === 'AGENT') {
    agentLog(level, message, data);
  } else {
    routeLog(level, message, data);
  }
}

log('INFO', 'Warsaw Judge API Route Initializing...');
log('DEBUG', 'Azure OpenAI Configuration:', {
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION,
  hasApiKey: !!process.env.AZURE_OPENAI_API_KEY,
});

// Configure Azure OpenAI client
const azureClient = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
});

// Set as default client for the Agents SDK
setDefaultOpenAIClient(azureClient);
// Use Chat Completions API instead of Responses API (required for Azure)
setOpenAIAPI('chat_completions');
// Disable tracing to avoid the "No API key for tracing" warning
setTracingDisabled(true);

log('INFO', 'Azure OpenAI client configured successfully');

// Track active audits for concurrency limiting
const activeAudits = new Set<string>();

// Create the auditor agent with world-class prompts
function createAuditorAgent(protocol: string) {
  const validProtocol = protocol as keyof typeof AUDIT_PROTOCOLS;
  const systemPrompt = generateSystemPrompt(validProtocol in AUDIT_PROTOCOLS ? validProtocol : 'generic');

  log('DEBUG', 'Creating agent with enhanced system prompt', {
    protocol,
    promptLength: systemPrompt.length,
  });

  return new Agent({
    name: 'Warsaw Judge Auditor',
    model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
    instructions: systemPrompt,
    tools: auditTools,
  });
}

// Audit step tracking
interface AuditStep {
  timestamp: string;
  action: string;
  tool?: string;
  input?: unknown;
  output?: string;
  duration?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

// Store for in-flight audits (in production, use Redis/DB)
const auditStore = new Map<string, {
  status: 'QUEUED' | 'PROCESSING' | 'PASS' | 'FAIL';
  startTime: number;
  result?: AuditResult;
  logs: string[];
  steps: AuditStep[];
  screenshot?: string;
  currentPhase?: string;
  toolCalls: Array<{ tool: string; input: unknown; output: string; timestamp: string }>;
}>();

interface AuditResult {
  passed: boolean;
  resilienceScore: number;
  safetyRating: 'A' | 'B' | 'C' | 'D' | 'F';
  vulnerabilities: string[];
  recommendations: string[];
  criticalFailure: string | null;
  latency: number;
  stepsCompleted?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, testType = 'generic' } = body;

    log('INFO', '========================================');
    log('INFO', 'NEW AUDIT REQUEST RECEIVED');
    log('DEBUG', 'Request details:', { url, testType });

    // Validate URL
    if (!url) {
      log('ERROR', 'URL is required but not provided');
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      const parsedUrl = new URL(url);
      // Block internal/local URLs for security
      const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
      if (blockedHosts.includes(parsedUrl.hostname)) {
        log('ERROR', 'Internal URLs not allowed');
        return NextResponse.json(
          { error: 'Internal URLs are not allowed for security reasons' },
          { status: 400 }
        );
      }
    } catch {
      log('ERROR', 'Invalid URL format');
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Check concurrent audit limit
    if (activeAudits.size >= AGENT_CONFIG.maxConcurrentAudits) {
      log('WARN', 'Too many concurrent audits', { active: activeAudits.size, max: AGENT_CONFIG.maxConcurrentAudits });
      return NextResponse.json(
        { error: `Maximum ${AGENT_CONFIG.maxConcurrentAudits} concurrent audits allowed. Please wait.` },
        { status: 429 }
      );
    }

    // Validate protocol
    const validProtocol = testType in AUDIT_PROTOCOLS ? testType : 'generic';
    if (testType !== validProtocol) {
      log('WARN', `Unknown protocol "${testType}", defaulting to "generic"`);
    }

    // Generate audit ID
    const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    log('INFO', `Audit ID: ${auditId}`);
    log('INFO', `Target URL: ${url}`);
    log('INFO', `Protocol: ${validProtocol}`);
    log('INFO', `Active audits: ${activeAudits.size + 1}/${AGENT_CONFIG.maxConcurrentAudits}`);

    // Initialize audit record
    auditStore.set(auditId, {
      status: 'QUEUED',
      startTime,
      logs: [`[${new Date().toISOString()}] Audit queued for ${url}`],
      steps: [],
      toolCalls: [],
      currentPhase: 'INITIALIZING',
    });

    // Track active audit
    activeAudits.add(auditId);

    // Start audit in background (non-blocking)
    log('INFO', 'Starting audit in background...');
    runAudit(auditId, url, validProtocol).catch((err) => {
      log('ERROR', `Audit ${auditId} failed:`, err);
    }).finally(() => {
      activeAudits.delete(auditId);
      log('DEBUG', `Audit ${auditId} removed from active set. Active: ${activeAudits.size}`);
    });

    return NextResponse.json({
      success: true,
      auditId,
      message: `Audit initiated for ${url}`,
      status: 'QUEUED',
      protocol: validProtocol,
      queuePosition: activeAudits.size,
    });
  } catch (error) {
    log('ERROR', 'Audit initiation error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate audit' },
      { status: 500 }
    );
  }
}

async function runAudit(auditId: string, url: string, testType: string) {
  const audit = auditStore.get(auditId);
  if (!audit) return;

  // Set up centralized logging for this audit
  setCurrentAuditId(auditId);
  setToolLogCallback((message) => {
    audit.logs.push(message);
  });
  registerLogCallback(auditId, (entry) => {
    const formattedMsg = `[${entry.timestamp}] [${entry.level}/${entry.source}] ${entry.message}`;
    audit.logs.push(formattedMsg);
  });

  log('INFO', '========================================');
  log('AGENT', `STARTING AUDIT: ${auditId}`);
  log('DEBUG', 'Audit configuration:', { url, testType, auditId });

  try {
    // Update status to processing
    audit.status = 'PROCESSING';
    audit.currentPhase = 'AGENT_INIT';
    audit.logs.push(`[${new Date().toISOString()}] Starting ${testType} audit...`);
    audit.steps.push({
      timestamp: new Date().toISOString(),
      action: 'Initializing audit agent',
      status: 'running',
    });

    log('AGENT', 'Creating auditor agent...');
    log('DEBUG', `Protocol: ${testType}`);
    log('DEBUG', `Model: ${process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o'}`);

    // Create the agent
    const auditor = createAuditorAgent(testType);

    log('AGENT', 'Agent created successfully');
    audit.steps[audit.steps.length - 1].status = 'completed';
    audit.steps.push({
      timestamp: new Date().toISOString(),
      action: 'Starting browser automation',
      status: 'running',
    });

    // Generate the mission brief using the new enhanced system
    const validProtocol = testType as keyof typeof AUDIT_PROTOCOLS;
    const missionBrief = generateMissionBrief(
      url,
      validProtocol in AUDIT_PROTOCOLS ? validProtocol : 'generic'
    );

    log('DEBUG', 'Mission brief generated', { length: missionBrief.length });

    // Run the agent with timeout protection
    const timeoutMs = AGENT_CONFIG.timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Audit timed out after ${timeoutMs / 1000}s`)), timeoutMs);
    });

    // Run agent with timeout
    const result = await Promise.race([
      run(auditor, missionBrief, { maxTurns: AGENT_CONFIG.maxTurns }),
      timeoutPromise,
    ]);

    log('AGENT', 'Agent execution started');
    audit.currentPhase = 'AGENT_RUNNING';
    audit.steps[audit.steps.length - 1].status = 'completed';
    audit.steps.push({
      timestamp: new Date().toISOString(),
      action: 'Agent executing audit protocol',
      status: 'running',
    });

    // Parse the final message for results
    const finalMessage = result.finalOutput || '';
    log('AGENT', 'Agent execution completed');
    log('DEBUG', 'Final output length:', finalMessage.length);
    log('DEBUG', 'Final output preview:', finalMessage.substring(0, 500));

    audit.logs.push(`[${new Date().toISOString()}] Agent completed. Parsing results...`);
    audit.currentPhase = 'PARSING_RESULTS';

    // Log all messages from the agent
    const messages = result.messages || [];
    log('DEBUG', `Total messages from agent: ${messages.length}`);

    // Extract tool calls from messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (typeof msg === 'object') {
        // Log message type
        const msgType = (msg as { role?: string }).role || 'unknown';
        log('DEBUG', `Message ${i + 1}: type=${msgType}`);

        // Check for tool calls
        if ('tool_calls' in msg && Array.isArray((msg as { tool_calls?: unknown[] }).tool_calls)) {
          const toolCalls = (msg as { tool_calls: Array<{ function: { name: string; arguments: string } }> }).tool_calls;
          for (const tc of toolCalls) {
            log('AGENT', `Tool called: ${tc.function.name}`);
            log('DEBUG', `Tool args: ${tc.function.arguments}`);
            audit.toolCalls.push({
              tool: tc.function.name,
              input: JSON.parse(tc.function.arguments || '{}'),
              output: '',
              timestamp: new Date().toISOString(),
            });
            audit.steps.push({
              timestamp: new Date().toISOString(),
              action: `Tool: ${tc.function.name}`,
              tool: tc.function.name,
              input: JSON.parse(tc.function.arguments || '{}'),
              status: 'completed',
            });
          }
        }

        // Check for tool results (screenshots are now stored separately)
        if ('content' in msg && typeof (msg as { content?: string }).content === 'string') {
          const content = (msg as { content: string }).content;
          if (content.includes('"captured": true')) {
            log('AGENT', 'Screenshot captured (stored separately)');
          }
        }
      }
    }

    // Get screenshot from separate storage (avoids token overflow)
    const storedScreenshot = getLastScreenshot();
    if (storedScreenshot) {
      audit.screenshot = storedScreenshot;
      log('DEBUG', 'Retrieved stored screenshot for final result');
    }

    // Try to extract JSON result from agent output
    let auditResult: AuditResult;
    try {
      log('DEBUG', 'Attempting to parse JSON from agent output...');
      const jsonMatch = finalMessage.match(/\{[\s\S]*"passed"[\s\S]*\}/);
      if (jsonMatch) {
        log('DEBUG', 'JSON match found, parsing...');
        const parsed = JSON.parse(jsonMatch[0]);
        log('AGENT', 'Parsed audit result:', parsed);
        auditResult = {
          passed: parsed.passed ?? false,
          resilienceScore: parsed.resilienceScore ?? 50,
          safetyRating: parsed.safetyRating ?? 'C',
          vulnerabilities: parsed.vulnerabilities ?? [],
          recommendations: parsed.recommendations ?? [],
          criticalFailure: parsed.criticalFailure ?? null,
          latency: Date.now() - audit.startTime,
          stepsCompleted: parsed.stepsCompleted ?? [],
        };
      } else {
        log('WARN', 'No JSON result found in agent output');
        log('DEBUG', 'Full agent output:', finalMessage);
        // Default result if parsing fails
        auditResult = {
          passed: false,
          resilienceScore: 50,
          safetyRating: 'C',
          vulnerabilities: ['Unable to complete full audit'],
          recommendations: ['Manual review recommended'],
          criticalFailure: null,
          latency: Date.now() - audit.startTime,
        };
      }
    } catch (parseError) {
      log('ERROR', 'Failed to parse audit result JSON:', parseError);
      auditResult = {
        passed: false,
        resilienceScore: 30,
        safetyRating: 'D',
        vulnerabilities: ['Audit parsing failed'],
        recommendations: ['Review agent logs'],
        criticalFailure: 'Could not parse audit results',
        latency: Date.now() - audit.startTime,
      };
    }

    // Update final status
    audit.status = auditResult.passed ? 'PASS' : 'FAIL';
    audit.result = auditResult;
    audit.currentPhase = 'COMPLETED';
    audit.steps[audit.steps.length - 1].status = 'completed';
    audit.logs.push(`[${new Date().toISOString()}] Audit complete: ${audit.status}`);

    log('INFO', '========================================');
    log('AGENT', `AUDIT COMPLETED: ${auditId}`);
    log('INFO', `Status: ${audit.status}`);
    log('INFO', `Score: ${auditResult.resilienceScore}%`);
    log('INFO', `Rating: ${auditResult.safetyRating}`);
    log('INFO', `Vulnerabilities: ${auditResult.vulnerabilities.length}`);
    log('INFO', `Duration: ${auditResult.latency}ms`);
    log('INFO', '========================================');

  } catch (error) {
    log('ERROR', 'AUDIT EXECUTION ERROR:', error);
    audit.status = 'FAIL';
    audit.currentPhase = 'ERROR';
    audit.result = {
      passed: false,
      resilienceScore: 0,
      safetyRating: 'F',
      vulnerabilities: ['Audit crashed'],
      recommendations: ['Check target URL accessibility'],
      criticalFailure: error instanceof Error ? error.message : 'Unknown error',
      latency: Date.now() - audit.startTime,
    };
    audit.logs.push(`[${new Date().toISOString()}] ERROR: ${error}`);
  } finally {
    log('DEBUG', 'Cleaning up Stagehand browser...');
    await cleanupStagehand();
    clearLastScreenshot();
    log('DEBUG', 'Browser cleanup complete');

    // Clean up logging for this audit
    setCurrentAuditId(null);
    setToolLogCallback(null);
    unregisterLogCallback(auditId);
  }
}

// GET endpoint for polling audit status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const auditId = searchParams.get('auditId');

  if (!auditId) {
    // Return all audits (for dashboard)
    const audits = Array.from(auditStore.entries()).map(([id, data]) => ({
      id,
      ...data,
    }));
    return NextResponse.json({ audits });
  }

  const audit = auditStore.get(auditId);
  if (!audit) {
    return NextResponse.json(
      { error: 'Audit not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    auditId,
    status: audit.status,
    result: audit.result,
    logs: audit.logs,
    steps: audit.steps,
    toolCalls: audit.toolCalls,
    currentPhase: audit.currentPhase,
    screenshot: audit.screenshot,
    duration: Date.now() - audit.startTime,
  });
}
