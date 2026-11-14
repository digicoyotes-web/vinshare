export interface SmtpEnvDiagnostics {
  detectedVars: string[];
  issues: string[];
  parsedHost: string;
  parsedPort: number;
  parsedUser: string;
  hasEnvPassword: boolean;
}

export interface SmtpStatusDto {
  configured: boolean;
  source: 'env' | 'runtime';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  envDiagnostics?: SmtpEnvDiagnostics;
}

export interface SmtpConfigInput {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass?: string;
  fromName: string;
  fromEmail: string;
  verify?: boolean;
}

export interface SmtpAttachmentInput {
  filename: string;
  blob: Blob;
  contentType?: string;
}

export interface SendSmtpEmailInput {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  replyTo?: string;
  attachments?: SmtpAttachmentInput[];
}

export interface SendSmtpEmailResult {
  ok: true;
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
  fromEmail: string;
  smtpHost: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

async function readJsonPayload(res: Response): Promise<{
  data: Record<string, unknown>;
  nonJsonDetail?: string;
}> {
  const rawText = await res.text();
  if (!rawText) {
    return { data: {} };
  }
  try {
    const parsed = JSON.parse(rawText);
    return {
      data: parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {},
    };
  } catch {
    const preview = rawText
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    return {
      data: {},
      nonJsonDetail: `Server returned HTTP ${res.status}${res.statusText ? ` (${res.statusText})` : ''}${preview ? `: ${preview}` : ' with an empty/non-JSON body.'}`,
    };
  }
}

export async function fetchSmtpStatus(): Promise<SmtpStatusDto> {
  const res = await fetch('/api/email/smtp-status');
  const { data, nonJsonDetail } = await readJsonPayload(res);
  if (!res.ok) {
    throw new Error(
      String(data?.message || data?.error || nonJsonDetail || `Failed to read SMTP status (HTTP ${res.status}).`)
    );
  }
  return data as unknown as SmtpStatusDto;
}

export async function saveAndVerifySmtpConfig(
  input: SmtpConfigInput
): Promise<SmtpStatusDto & { verified?: boolean; logEntryId?: string }> {
  const res = await fetch('/api/email/smtp-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const { data, nonJsonDetail } = await readJsonPayload(res);
  if (!res.ok) {
    const message = String(
      data?.message ||
        data?.error ||
        nonJsonDetail ||
        `SMTP verification request failed with HTTP ${res.status}${res.statusText ? ` (${res.statusText})` : ''}.`
    );
    throw new SmtpConnectionError(message, {
      status: res.status,
      smtpErrorCode:
        typeof data?.smtpErrorCode === 'string'
          ? data.smtpErrorCode
          : typeof data?.error === 'string'
            ? data.error
            : `HTTP_${res.status}`,
      smtpResponseCode:
        typeof data?.smtpResponseCode === 'number' ? data.smtpResponseCode : undefined,
      smtpCommand: typeof data?.smtpCommand === 'string' ? data.smtpCommand : undefined,
      smtpRawResponse:
        typeof data?.smtpRawResponse === 'string' ? data.smtpRawResponse : nonJsonDetail,
      actionHint:
        typeof data?.actionHint === 'string'
          ? data.actionHint
          : nonJsonDetail
            ? 'Check that the ERP Node.js backend is running cleanly and inspect the SMTP Activity Log for details.'
            : undefined,
      debuggingClues: Array.isArray(data?.debuggingClues)
        ? (data.debuggingClues as string[])
        : nonJsonDetail
          ? [nonJsonDetail]
          : undefined,
      logEntryId: typeof data?.logEntryId === 'string' ? data.logEntryId : undefined,
    });
  }
  return data as unknown as SmtpStatusDto & { verified?: boolean; logEntryId?: string };
}

export interface SmtpConnectionTestResult {
  ok: boolean;
  mode?: 'full_handshake' | 'host_ping_only';
  host: string;
  port: number;
  latencyMs?: number;
  tcpPingMs?: number;
  banner?: string;
  message: string;
  smtpErrorCode?: string;
  smtpResponseCode?: number;
  smtpCommand?: string;
  smtpRawResponse?: string;
  actionHint?: string;
  debuggingClues?: string[];
  handshakeTrace?: string[];
  logEntryId?: string;
}

export class SmtpConnectionError extends Error {
  status: number;
  smtpErrorCode?: string;
  smtpResponseCode?: number;
  smtpCommand?: string;
  smtpRawResponse?: string;
  actionHint?: string;
  debuggingClues?: string[];
  logEntryId?: string;

  constructor(
    message: string,
    details: {
      status: number;
      smtpErrorCode?: string;
      smtpResponseCode?: number;
      smtpCommand?: string;
      smtpRawResponse?: string;
      actionHint?: string;
      debuggingClues?: string[];
      logEntryId?: string;
    }
  ) {
    super(message);
    this.name = 'SmtpConnectionError';
    this.status = details.status;
    this.smtpErrorCode = details.smtpErrorCode;
    this.smtpResponseCode = details.smtpResponseCode;
    this.smtpCommand = details.smtpCommand;
    this.smtpRawResponse = details.smtpRawResponse;
    this.actionHint = details.actionHint;
    this.debuggingClues = details.debuggingClues;
    this.logEntryId = details.logEntryId;
  }
}

export async function pingSmtpConnection(input: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass?: string;
}): Promise<SmtpConnectionTestResult> {
  const res = await fetch('/api/email/smtp-ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const { data, nonJsonDetail } = await readJsonPayload(res);
  if (!res.ok) {
    throw new SmtpConnectionError(
      String(
        data?.message ||
          data?.error ||
          nonJsonDetail ||
          `SMTP connection ping failed (HTTP ${res.status}).`
      ),
      {
        status: res.status,
        smtpErrorCode:
          typeof data?.smtpErrorCode === 'string'
            ? data.smtpErrorCode
            : typeof data?.error === 'string'
              ? data.error
              : undefined,
        smtpResponseCode:
          typeof data?.smtpResponseCode === 'number' ? data.smtpResponseCode : undefined,
        smtpCommand: typeof data?.smtpCommand === 'string' ? data.smtpCommand : undefined,
        smtpRawResponse:
          typeof data?.smtpRawResponse === 'string' ? data.smtpRawResponse : nonJsonDetail,
        actionHint: typeof data?.actionHint === 'string' ? data.actionHint : undefined,
        debuggingClues: Array.isArray(data?.debuggingClues)
          ? (data.debuggingClues as string[])
          : undefined,
        logEntryId: typeof data?.logEntryId === 'string' ? data.logEntryId : undefined,
      }
    );
  }
  return data as unknown as SmtpConnectionTestResult;
}

export const testSmtpConnection = pingSmtpConnection;

export async function resetSmtpConfig(): Promise<SmtpStatusDto> {
  const res = await fetch('/api/email/smtp-reset', {
    method: 'POST',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || 'Failed to reset SMTP configuration.');
  }
  return data as SmtpStatusDto;
}

export async function sendEmailViaSmtp(
  payload: SendSmtpEmailInput
): Promise<SendSmtpEmailResult> {
  const encodedAttachments = await Promise.all(
    (payload.attachments || []).map(async (att) => ({
      filename: att.filename,
      contentBase64: await blobToBase64(att.blob),
      contentType: att.contentType || att.blob.type || 'application/pdf',
    }))
  );

  const res = await fetch('/api/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: payload.to,
      cc: payload.cc || '',
      subject: payload.subject,
      body: payload.body,
      replyTo: payload.replyTo || '',
      attachments: encodedAttachments,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `SMTP send failed (HTTP ${res.status}).`);
  }
  return data as SendSmtpEmailResult;
}

export interface SmtpActivityLogEntry {
  id: string;
  eventType?: 'Send Email' | 'SMTP Verify' | 'Connection Test';
  to: string;
  cc?: string;
  from: string;
  subject: string;
  status: 'Sent' | 'Failed';
  messageId?: string;
  smtpHost?: string;
  smtpPort?: number;
  response?: string;
  errorMessage?: string;
  smtpErrorCode?: string;
  smtpResponseCode?: number;
  smtpCommand?: string;
  smtpRawResponse?: string;
  actionHint?: string;
  debuggingClues?: string[];
  handshakeTrace?: string[];
  attachmentCount: number;
  timestamp: string;
}

export interface SmtpDailyMetric {
  date: string;
  label: string;
  sent: number;
  failed: number;
  total: number;
}

export interface SmtpMetrics30Days {
  total30Days: number;
  sentCount: number;
  failedCount: number;
  successRatePct: number;
  withAttachmentsCount: number;
  dailySeries: SmtpDailyMetric[];
}

export interface SmtpLogsResponse {
  logs: SmtpActivityLogEntry[];
  metrics: SmtpMetrics30Days;
}

export function buildEmptySmtpMetrics30Days(): SmtpMetrics30Days {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const dailySeries: SmtpDailyMetric[] = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dailySeries.push({
      date: `${y}-${m}-${day}`,
      label: `${monthNames[d.getMonth()]} ${d.getDate()}`,
      sent: 0,
      failed: 0,
      total: 0,
    });
  }
  return {
    total30Days: 0,
    sentCount: 0,
    failedCount: 0,
    successRatePct: 0,
    withAttachmentsCount: 0,
    dailySeries,
  };
}

export async function fetchSmtpLogs(): Promise<SmtpLogsResponse> {
  const res = await fetch('/api/email/smtp-logs');
  const data = (await res.json().catch(() => ({}))) as {
    logs?: SmtpActivityLogEntry[];
    metrics?: SmtpMetrics30Days;
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data?.message || data?.error || 'Failed to load SMTP activity logs.');
  }
  return {
    logs: Array.isArray(data.logs) ? data.logs : [],
    metrics: data.metrics && Array.isArray(data.metrics.dailySeries)
      ? data.metrics
      : buildEmptySmtpMetrics30Days(),
  };
}


