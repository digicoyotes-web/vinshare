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

export async function fetchSmtpStatus(): Promise<SmtpStatusDto> {
  const res = await fetch('/api/email/smtp-status');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || 'Failed to read SMTP status.');
  }
  return data as SmtpStatusDto;
}

export async function saveAndVerifySmtpConfig(
  input: SmtpConfigInput
): Promise<SmtpStatusDto & { verified?: boolean }> {
  const res = await fetch('/api/email/smtp-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || 'Failed to verify SMTP settings.');
  }
  return data as SmtpStatusDto & { verified?: boolean };
}

export interface SmtpConnectionTestResult {
  ok: boolean;
  mode?: 'full_handshake' | 'host_ping_only';
  host: string;
  port: number;
  latencyMs?: number;
  tcpPingMs?: number;
  message: string;
}

export async function testSmtpConnection(input: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass?: string;
}): Promise<SmtpConnectionTestResult> {
  const res = await fetch('/api/email/smtp-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<SmtpConnectionTestResult> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data?.message || data?.error || 'SMTP connection test failed.');
  }
  return data as SmtpConnectionTestResult;
}

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


