import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

// Simplified schema for hackathon - single table design
export const audits = pgTable('audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  targetUrl: text('target_url').notNull(),
  agentType: text('agent_type').notNull().default('generic'),
  status: text('status').notNull().default('pending'), // pending, running, completed, failed
  score: integer('score'), // 0-100
  severity: text('severity'), // critical, high, medium, low, info
  findings: jsonb('findings').$type<AuditFinding[]>(),
  toolCalls: jsonb('tool_calls').$type<ToolCall[]>(),
  executionLog: jsonb('execution_log').$type<ExecutionStep[]>(),
  evidenceScreenshot: text('evidence_screenshot'), // base64 encoded
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Type definitions for JSONB columns
export interface AuditFinding {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  evidence?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  timestamp: string;
  duration?: number;
}

export interface ExecutionStep {
  step: number;
  action: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp: string;
  details?: string;
}

// Infer types from schema
export type Audit = typeof audits.$inferSelect;
export type NewAudit = typeof audits.$inferInsert;
