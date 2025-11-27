// Centralized audit logging system
// Stores logs in memory for the active audit and writes to console

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'AGENT' | 'TOOL';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  data?: unknown;
}

// Store for audit logs (keyed by auditId)
const auditLogs = new Map<string, LogEntry[]>();

// Current active audit ID (set when audit starts)
let currentAuditId: string | null = null;

// Callbacks for when logs are added (allows route.ts to push to audit.logs)
const logCallbacks = new Map<string, (entry: LogEntry) => void>();

export function setCurrentAuditId(auditId: string | null): void {
  currentAuditId = auditId;
  if (auditId && !auditLogs.has(auditId)) {
    auditLogs.set(auditId, []);
  }
}

export function getCurrentAuditId(): string | null {
  return currentAuditId;
}

export function registerLogCallback(auditId: string, callback: (entry: LogEntry) => void): void {
  logCallbacks.set(auditId, callback);
}

export function unregisterLogCallback(auditId: string): void {
  logCallbacks.delete(auditId);
}

export function getAuditLogs(auditId: string): LogEntry[] {
  return auditLogs.get(auditId) || [];
}

export function clearAuditLogs(auditId: string): void {
  auditLogs.delete(auditId);
  logCallbacks.delete(auditId);
}

// Format log message for console (no emojis)
function formatConsoleMessage(level: LogLevel, source: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] [${source}] ${message}`;
}

// Format log message for UI display
function formatUIMessage(level: LogLevel, source: string, message: string): string {
  const time = new Date().toISOString();
  return `[${time}] [${level}/${source}] ${message}`;
}

// Main logging function
export function auditLog(
  level: LogLevel,
  source: string,
  message: string,
  data?: unknown
): void {
  // Console output (no emojis)
  console.log(formatConsoleMessage(level, source, message));
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }

  // Store in audit logs if there's an active audit
  if (currentAuditId) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      data,
    };

    // Store in memory
    const logs = auditLogs.get(currentAuditId);
    if (logs) {
      logs.push(entry);
    }

    // Notify callback (for pushing to audit.logs array)
    const callback = logCallbacks.get(currentAuditId);
    if (callback) {
      callback(entry);
    }
  }
}

// Convenience functions for different sources
export function routeLog(level: LogLevel, message: string, data?: unknown): void {
  auditLog(level, 'ROUTE', message, data);
}

export function toolLog(level: LogLevel, message: string, data?: unknown): void {
  auditLog(level, 'TOOL', message, data);
}

export function stagehandLog(level: LogLevel, message: string, data?: unknown): void {
  auditLog(level, 'STAGEHAND', message, data);
}

export function agentLog(level: LogLevel, message: string, data?: unknown): void {
  auditLog(level, 'AGENT', message, data);
}
