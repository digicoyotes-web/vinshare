import crypto from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { format as formatLog } from 'node:util';
import dotenv from 'dotenv';
import express from 'express';
import nodemailer from 'nodemailer';
import { createServer as createViteServer } from 'vite';
import {
  buildSmtpDebuggingClues,
  buildSmtpTransportSecurityOptions,
  checkSmtpConnection,
  classifySmtpErrorToPlainEnglish,
} from './src/services/smtp.ts';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HMAC_SECRET =
  process.env.SMS_SIGNING_SECRET || 'fm-erp-sms-gateway-hmac-key-2025';

function signChallengeToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyChallengeToken(token: string): Record<string, string> | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expectedSig = crypto
      .createHmac('sha256', HMAC_SECRET)
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function normalizePhone(raw: string): string {
  const trimmed = (raw || '').trim();
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  return `+${digits}`;
}

function hashOtp(code: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function verifyOtpHash(code: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashOtp(code.trim(), salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function generateCarrierRef(): string {
  return `DLT-${crypto.randomInt(100000000, 999999999)}`;
}

function buildSmsBody(
  purpose: string,
  entityLabel: string,
  otpCode?: string,
  customMessage?: string,
  ttlMinutes = 5
): string {
  const validMins = Math.min(30, Math.max(1, Math.round(ttlMinutes) || 5));
  if (customMessage && customMessage.trim()) {
    return otpCode
      ? `${customMessage.trim()} Verification OTP: ${otpCode}. Valid for ${validMins} mins.`
      : customMessage.trim();
  }
  switch (purpose) {
    case 'client_mobile_verification':
      return `Facility Management ERP: Your mobile verification code for ${entityLabel} is ${otpCode}. Reply "VERIFY ${otpCode}" or enter this code in the ERP. Valid for ${validMins} mins.`;
    case 'login_mfa':
      return `Facility Management ERP Security: Your MFA sign-in OTP for ${entityLabel} is ${otpCode}. Do not share this code. Valid for ${validMins} mins.`;
    case 'proposal_approval':
      return `Facility Management ERP: Commercial approval OTP for ${entityLabel} is ${otpCode}. Verify to authorize submission/margin exception.`;
    case 'loi_acceptance':
      return `Facility Management ERP: LOI Acceptance Code for ${entityLabel} is ${otpCode}. Reply "ACCEPT ${otpCode}" or enter code to confirm client acknowledgement.`;
    case 'agreement_signature':
      return `Facility Management ERP Legal: Execution signature OTP for ${entityLabel} is ${otpCode}. Enter code to digitally lock executed contract.`;
    case 'invoice_approval':
      return `Facility Management ERP Finance: Authorization OTP to issue ${entityLabel} is ${otpCode}. Valid for ${validMins} mins.`;
    case 'payment_confirmation':
      return `Facility Management ERP: Payment receipt confirmation for ${entityLabel}. Verification code: ${otpCode}.`;
    case 'project_activation':
      return `Facility Management ERP Operations: Handover & activation alert for ${entityLabel}. Acknowledge code: ${otpCode}.`;
    default:
      return `Facility Management ERP: Verification code for ${entityLabel} is ${otpCode}.`;
  }
}

interface SmsRecord {
  id: string;
  direction: 'outbound' | 'inbound';
  from: string;
  to: string;
  recipientName: string;
  purpose: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  body: string;
  otpHash?: string;
  otpSalt?: string;
  deliveryStatus: 'queued' | 'sent' | 'delivered' | 'received';
  verificationStatus: 'pending' | 'verified' | 'expired' | 'failed' | 'not_required';
  requiresVerification: boolean;
  attempts: number;
  maxAttempts: number;
  expiresAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
  receivedAt: string | null;
  verifiedAt: string | null;
  verifiedMethod: 'otp_entry' | 'inbound_sms_reply' | 'webhook' | null;
  carrierRef: string;
  carrierMode: 'sandbox-carrier' | 'twilio-rest';
}

const smsMessages: SmsRecord[] = [];
const verifiedPhones = new Map<string, Record<string, string>>();
const verifiedEntities = new Map<string, Record<string, string>>();
const smsAuditEvents: Array<{
  id: string;
  timestamp: string;
  messageId: string;
  phone: string;
  event: string;
  detail: string;
  status: 'info' | 'success' | 'warning' | 'error';
}> = [];

function pushAudit(
  messageId: string,
  phone: string,
  event: string,
  detail: string,
  status: 'info' | 'success' | 'warning' | 'error'
) {
  smsAuditEvents.unshift({
    id: generateId('AUD'),
    timestamp: new Date().toISOString(),
    messageId,
    phone,
    event,
    detail,
    status,
  });
}

function seedInitialData() {
  const now = Date.now();

  const salt1 = crypto.randomBytes(16).toString('hex');
  const code1 = '482910';
  const msg1: SmsRecord = {
    id: 'SMS-2025-1001',
    direction: 'outbound',
    from: 'FM-ERP',
    to: '+919820144510',
    recipientName: 'Vikram Mehta (Urban Square Facilities)',
    purpose: 'client_mobile_verification',
    entityType: 'client',
    entityId: 'CLI-001',
    entityLabel: 'Urban Square Facilities Pvt Ltd',
    body: buildSmsBody('client_mobile_verification', 'Urban Square Facilities Pvt Ltd', code1),
    otpHash: hashOtp(code1, salt1),
    otpSalt: salt1,
    deliveryStatus: 'received',
    verificationStatus: 'verified',
    requiresVerification: true,
    attempts: 1,
    maxAttempts: 5,
    expiresAt: new Date(now - 3600 * 1000).toISOString(),
    createdAt: new Date(now - 3800 * 1000).toISOString(),
    deliveredAt: new Date(now - 3798 * 1000).toISOString(),
    receivedAt: new Date(now - 3795 * 1000).toISOString(),
    verifiedAt: new Date(now - 3740 * 1000).toISOString(),
    verifiedMethod: 'otp_entry',
    carrierRef: 'DLT-884120934',
    carrierMode: 'sandbox-carrier',
  };

  const salt2 = crypto.randomBytes(16).toString('hex');
  const code2 = '739204';
  const msg2: SmsRecord = {
    id: 'SMS-2025-1002',
    direction: 'outbound',
    from: 'FM-ERP',
    to: '+919811203344',
    recipientName: 'Rohit Sharma (Super Admin)',
    purpose: 'login_mfa',
    entityType: 'user',
    entityId: 'USR-001',
    entityLabel: 'Rohit Sharma',
    body: buildSmsBody('login_mfa', 'Rohit Sharma', code2),
    otpHash: hashOtp(code2, salt2),
    otpSalt: salt2,
    deliveryStatus: 'received',
    verificationStatus: 'verified',
    requiresVerification: true,
    attempts: 1,
    maxAttempts: 5,
    expiresAt: new Date(now - 1800 * 1000).toISOString(),
    createdAt: new Date(now - 2100 * 1000).toISOString(),
    deliveredAt: new Date(now - 2099 * 1000).toISOString(),
    receivedAt: new Date(now - 2097 * 1000).toISOString(),
    verifiedAt: new Date(now - 2060 * 1000).toISOString(),
    verifiedMethod: 'otp_entry',
    carrierRef: 'DLT-884121455',
    carrierMode: 'sandbox-carrier',
  };

  const salt3 = crypto.randomBytes(16).toString('hex');
  const code3 = '615839';
  const msg3: SmsRecord = {
    id: 'SMS-2025-1003',
    direction: 'outbound',
    from: 'FM-ERP',
    to: '+919845077120',
    recipientName: 'Ananya Nair (Apex Business Park)',
    purpose: 'loi_acceptance',
    entityType: 'loi',
    entityId: 'LOI-2025-004',
    entityLabel: 'LOI-2025-004 · Apex Business Park',
    body: buildSmsBody('loi_acceptance', 'LOI-2025-004 · Apex Business Park', code3),
    otpHash: hashOtp(code3, salt3),
    otpSalt: salt3,
    deliveryStatus: 'received',
    verificationStatus: 'pending',
    requiresVerification: true,
    attempts: 0,
    maxAttempts: 5,
    expiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
    createdAt: new Date(now - 120 * 1000).toISOString(),
    deliveredAt: new Date(now - 119 * 1000).toISOString(),
    receivedAt: new Date(now - 118 * 1000).toISOString(),
    verifiedAt: null,
    verifiedMethod: null,
    carrierRef: 'DLT-884129901',
    carrierMode: 'sandbox-carrier',
  };

  smsMessages.push(msg3, msg2, msg1);

  verifiedPhones.set(msg1.to, {
    phone: msg1.to,
    verifiedAt: msg1.verifiedAt!,
    messageId: msg1.id,
    method: 'otp_entry',
    holderName: msg1.recipientName,
  });
  verifiedEntities.set(msg1.entityId, {
    entityId: msg1.entityId,
    entityType: msg1.entityType,
    entityLabel: msg1.entityLabel,
    phone: msg1.to,
    verifiedAt: msg1.verifiedAt!,
    messageId: msg1.id,
    purpose: msg1.purpose,
    method: 'otp_entry',
  });

  verifiedPhones.set(msg2.to, {
    phone: msg2.to,
    verifiedAt: msg2.verifiedAt!,
    messageId: msg2.id,
    method: 'otp_entry',
    holderName: msg2.recipientName,
  });
  verifiedEntities.set(msg2.entityId, {
    entityId: msg2.entityId,
    entityType: msg2.entityType,
    entityLabel: msg2.entityLabel,
    phone: msg2.to,
    verifiedAt: msg2.verifiedAt!,
    messageId: msg2.id,
    purpose: msg2.purpose,
    method: 'otp_entry',
  });

  pushAudit(msg1.id, msg1.to, 'SMS Verified', 'Client contact mobile verified via OTP entry', 'success');
  pushAudit(msg2.id, msg2.to, 'MFA Verified', 'Admin session MFA verified via SMS OTP', 'success');
  pushAudit(msg3.id, msg3.to, 'SMS Received', 'LOI acceptance SMS delivered & received on recipient handset', 'info');
}

seedInitialData();

function expireStaleChallenges() {
  const now = Date.now();
  for (const msg of smsMessages) {
    if (
      msg.verificationStatus === 'pending' &&
      msg.expiresAt &&
      new Date(msg.expiresAt).getTime() < now
    ) {
      msg.verificationStatus = 'expired';
      pushAudit(msg.id, msg.to, 'OTP Expired', `Verification code for ${msg.entityLabel} expired`, 'warning');
    }
  }
}

interface SmtpRuntimeConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  source: 'env' | 'runtime';
}

function stripEnvValue(raw: string | undefined): string {
  if (!raw) return '';
  let val = raw.trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

function readEnvAlias(keys: string[]): { key: string | null; value: string } {
  for (const key of keys) {
    const val = stripEnvValue(process.env[key]);
    if (val) {
      return { key, value: val };
    }
  }
  return { key: null, value: '' };
}

function parseBoolEnv(raw: string, fallback: boolean): boolean {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['true', '1', 'yes', 'ssl', 'tls'].includes(normalized)) return true;
  if (['false', '0', 'no', 'starttls', 'none'].includes(normalized)) return false;
  return fallback;
}

function isValidSmtpHost(host: string): boolean {
  const h = (host || '').trim().toLowerCase();
  if (!h || h.length < 3 || h.length > 253) return false;
  if (/^\d+$/.test(h)) return false;
  if (h.startsWith('my_') || h.includes('your-smtp') || h === 'example.com') return false;
  return h === 'localhost' || h.includes('.');
}

function isValidSmtpPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function isValidSmtpUser(user: string): boolean {
  const u = (user || '').trim();
  if (!u || /^\d+$/.test(u)) return false;
  if (u === 'your-email@gmail.com' || u.startsWith('MY_')) return false;
  return u.includes('@') || u.length >= 3;
}

function normalizeSmtpPassword(host: string, pass: string): string {
  const trimmed = (pass || '').trim();
  if (!trimmed) return '';
  // Google App Passwords are displayed in 4-char space-separated groups (e.g. "abcd efgh ijkl mnop")
  if (host.toLowerCase().includes('gmail') && /^[a-z0-9]{4}(\s+[a-z0-9]{4}){3}$/i.test(trimmed)) {
    return trimmed.replace(/\s+/g, '');
  }
  return trimmed;
}

const SMTP_PERSIST_PATH = path.join(os.tmpdir(), 'fm-erp-smtp-runtime.json');

interface SmtpEnvDiagnostics {
  detectedVars: string[];
  issues: string[];
  parsedHost: string;
  parsedPort: number;
  parsedUser: string;
  hasEnvPassword: boolean;
}

function parseEnvSmtpState(): {
  config: SmtpRuntimeConfig;
  diagnostics: SmtpEnvDiagnostics;
} {
  const hostEntry = readEnvAlias(['SMTP_HOST', 'MAIL_HOST', 'EMAIL_HOST', 'VITE_SMTP_HOST']);
  const portEntry = readEnvAlias(['SMTP_PORT', 'MAIL_PORT', 'EMAIL_PORT', 'VITE_SMTP_PORT']);
  const secureEntry = readEnvAlias(['SMTP_SECURE', 'MAIL_SECURE', 'VITE_SMTP_SECURE']);
  const userEntry = readEnvAlias([
    'SMTP_USER',
    'SMTP_USERNAME',
    'MAIL_USER',
    'EMAIL_USER',
    'VITE_SMTP_USER',
  ]);
  const passEntry = readEnvAlias([
    'SMTP_PASS',
    'SMTP_PASSWORD',
    'MAIL_PASS',
    'EMAIL_PASS',
    'VITE_SMTP_PASS',
  ]);
  const fromNameEntry = readEnvAlias([
    'SMTP_FROM_NAME',
    'MAIL_FROM_NAME',
    'VITE_SMTP_FROM_NAME',
  ]);
  const fromEmailEntry = readEnvAlias([
    'SMTP_FROM_EMAIL',
    'SMTP_FROM',
    'MAIL_FROM_ADDRESS',
    'EMAIL_FROM',
    'VITE_SMTP_FROM_EMAIL',
  ]);

  const detectedVars = [
    hostEntry.key,
    portEntry.key,
    secureEntry.key,
    userEntry.key,
    passEntry.key,
    fromNameEntry.key,
    fromEmailEntry.key,
  ].filter((k): k is string => Boolean(k));

  const issues: string[] = [];

  // Support host:port format if entered in SMTP_HOST
  let rawHost = hostEntry.value;
  let embeddedPort: number | null = null;
  if (rawHost.includes(':') && !rawHost.startsWith('[')) {
    const [hPart, pPart] = rawHost.split(':');
    const parsedEmbedded = Number(pPart);
    if (hPart && isValidSmtpPort(parsedEmbedded)) {
      rawHost = hPart.trim();
      embeddedPort = parsedEmbedded;
    }
  }

  const parsedPortNum = portEntry.value ? Number(portEntry.value) : embeddedPort ?? 587;
  const validHost = rawHost ? isValidSmtpHost(rawHost) : false;
  const validPort = isValidSmtpPort(parsedPortNum);
  const validUser = userEntry.value ? isValidSmtpUser(userEntry.value) : false;
  const isDummyPass =
    !passEntry.value ||
    passEntry.value === 'your-smtp-app-password' ||
    passEntry.value === '1234567890' ||
    (passEntry.value === '123456790' && rawHost === '123456790');
  const validPass = !isDummyPass;

  if (hostEntry.key && !validHost) {
    issues.push(
      `${hostEntry.key} ("${hostEntry.value}") is not a valid SMTP hostname (expected e.g. smtp.gmail.com).`
    );
  }
  if (portEntry.key && !validPort) {
    issues.push(
      `${portEntry.key} ("${portEntry.value}") is invalid; port must be between 1 and 65535 (defaulting to 587).`
    );
  }
  if (userEntry.key && !validUser) {
    issues.push(
      `${userEntry.key} ("${userEntry.value}") does not look like a valid SMTP username or email.`
    );
  }
  if (passEntry.key && !validPass) {
    issues.push(`${passEntry.key} contains an unconfigured placeholder value.`);
  }

  const host = validHost ? rawHost : 'smtp.gmail.com';
  const port = validPort ? parsedPortNum : 587;
  const secure = buildSmtpTransportSecurityOptions(
    host,
    port,
    parseBoolEnv(secureEntry.value, port === 465)
  ).secure;
  const user = validUser ? userEntry.value : '';
  const pass = validPass ? normalizeSmtpPassword(host, passEntry.value) : '';
  const fromName =
    fromNameEntry.value && !/^\d+$/.test(fromNameEntry.value)
      ? fromNameEntry.value
      : 'Vinshar Facility Management ERP';
  const fromEmail =
    fromEmailEntry.value && fromEmailEntry.value.includes('@')
      ? fromEmailEntry.value
      : user;

  return {
    config: {
      host,
      port,
      secure,
      user,
      pass,
      fromName,
      fromEmail,
      source: 'env',
    },
    diagnostics: {
      detectedVars,
      issues,
      parsedHost: host,
      parsedPort: port,
      parsedUser: user,
      hasEnvPassword: Boolean(pass),
    },
  };
}

function getEnvSmtpDefaults(): SmtpRuntimeConfig {
  return parseEnvSmtpState().config;
}

function loadInitialSmtpConfig(): SmtpRuntimeConfig {
  try {
    if (fs.existsSync(SMTP_PERSIST_PATH)) {
      const raw = fs.readFileSync(SMTP_PERSIST_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SmtpRuntimeConfig>;
      if (
        parsed &&
        typeof parsed.host === 'string' &&
        isValidSmtpHost(parsed.host) &&
        typeof parsed.port === 'number' &&
        isValidSmtpPort(parsed.port) &&
        typeof parsed.user === 'string' &&
        parsed.user.trim() &&
        typeof parsed.pass === 'string' &&
        parsed.pass
      ) {
        return {
          host: parsed.host.trim(),
          port: parsed.port,
          secure: Boolean(parsed.secure),
          user: parsed.user.trim(),
          pass: normalizeSmtpPassword(parsed.host, parsed.pass),
          fromName:
            typeof parsed.fromName === 'string' && parsed.fromName.trim()
              ? parsed.fromName.trim()
              : 'Vinshar Facility Management ERP',
          fromEmail:
            typeof parsed.fromEmail === 'string' && parsed.fromEmail.trim()
              ? parsed.fromEmail.trim()
              : parsed.user.trim(),
          source: 'runtime',
        };
      }
    }
  } catch {
    // Ignore corrupt persisted file and fall back to env defaults
  }
  return getEnvSmtpDefaults();
}

function persistRuntimeSmtpConfig(cfg: SmtpRuntimeConfig) {
  try {
    fs.writeFileSync(SMTP_PERSIST_PATH, JSON.stringify(cfg), {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch {
    // Ignore filesystem errors in read-only environments
  }
}

function clearPersistedSmtpConfig() {
  try {
    if (fs.existsSync(SMTP_PERSIST_PATH)) {
      fs.unlinkSync(SMTP_PERSIST_PATH);
    }
  } catch {
    // Ignore
  }
}

let runtimeSmtpConfig: SmtpRuntimeConfig = loadInitialSmtpConfig();

interface SmtpActivityRecord {
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
  failureCategory?: string;
  plainEnglishTitle?: string;
  plainEnglishExplanation?: string;
  suggestedFix?: { label: string; port: number; secure: boolean };
  handshakeTrace?: string[];
  attachmentCount: number;
  timestamp: string;
}

const smtpActivityLog: SmtpActivityRecord[] = [];
const smtpEventClients = new Set<express.Response>();

function broadcastSmtpFailureEvent(record: SmtpActivityRecord) {
  if (smtpEventClients.size === 0) return;
  const payload = `event: smtp_failure\ndata: ${JSON.stringify(record)}\n\n`;
  for (const client of smtpEventClients) {
    try {
      client.write(payload);
    } catch {
      smtpEventClients.delete(client);
    }
  }
}

function pushSmtpActivityLog(
  entry: Omit<SmtpActivityRecord, 'id' | 'timestamp'>
): SmtpActivityRecord {
  let enriched = entry;
  if (entry.status === 'Failed' && (!entry.plainEnglishTitle || !entry.plainEnglishExplanation)) {
    const diag = classifySmtpErrorToPlainEnglish({
      host: entry.smtpHost,
      port: entry.smtpPort,
      secure: entry.smtpPort === 465,
      errorCode: entry.smtpErrorCode,
      responseCode: entry.smtpResponseCode,
      command: entry.smtpCommand,
      rawResponse: entry.smtpRawResponse || entry.errorMessage,
      fallbackMessage: entry.errorMessage,
    });
    enriched = {
      ...entry,
      failureCategory: entry.failureCategory || diag.failureCategory,
      plainEnglishTitle: entry.plainEnglishTitle || diag.plainEnglishTitle,
      plainEnglishExplanation: entry.plainEnglishExplanation || diag.plainEnglishExplanation,
      actionHint: entry.actionHint || diag.actionHint,
      debuggingClues:
        entry.debuggingClues && entry.debuggingClues.length > 0
          ? entry.debuggingClues
          : diag.debuggingClues,
      suggestedFix: entry.suggestedFix || diag.suggestedFix,
    };
  }

  const record: SmtpActivityRecord = {
    id: generateId('SMTP'),
    timestamp: new Date().toISOString(),
    ...enriched,
  };
  smtpActivityLog.unshift(record);
  if (smtpActivityLog.length > 2000) {
    smtpActivityLog.length = 2000;
  }
  if (record.status === 'Failed') {
    broadcastSmtpFailureEvent(record);
  }
  return record;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildSmtpMetrics30Days(records: SmtpActivityRecord[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayMap = new Map<
    string,
    { date: string; label: string; sent: number; failed: number; total: number }
  >();
  const dailySeries: Array<{
    date: string;
    label: string;
    sent: number;
    failed: number;
    total: number;
  }> = [];

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

  for (let offset = 29; offset >= 0; offset -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    const key = toLocalDateKey(d);
    const label = `${monthNames[d.getMonth()]} ${d.getDate()}`;
    const bucket = { date: key, label, sent: 0, failed: 0, total: 0 };
    dayMap.set(key, bucket);
    dailySeries.push(bucket);
  }

  let sentCount = 0;
  let failedCount = 0;
  let withAttachmentsCount = 0;

  for (const record of records) {
    if (record.eventType && record.eventType !== 'Send Email') continue;
    const parsed = new Date(record.timestamp);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = toLocalDateKey(parsed);
    const bucket = dayMap.get(key);
    if (!bucket) continue;

    if (record.status === 'Sent') {
      bucket.sent += 1;
      sentCount += 1;
    } else {
      bucket.failed += 1;
      failedCount += 1;
    }
    bucket.total += 1;
    if (record.attachmentCount > 0) {
      withAttachmentsCount += 1;
    }
  }

  const total30Days = sentCount + failedCount;
  const successRatePct =
    total30Days > 0 ? Math.round((sentCount / total30Days) * 1000) / 10 : 0;

  return {
    total30Days,
    sentCount,
    failedCount,
    successRatePct,
    withAttachmentsCount,
    dailySeries,
  };
}

function isSmtpConfigured(cfg: SmtpRuntimeConfig): boolean {
  return Boolean(
    isValidSmtpHost(cfg.host) &&
      isValidSmtpPort(cfg.port) &&
      cfg.user &&
      cfg.pass
  );
}

function createTraceableSmtpTransporter(cfg: SmtpRuntimeConfig) {
  const trace: string[] = [];
  let expectAuthSecretLine = false;

  const recordLine = (tnx: string, rawText: string) => {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (trace.length >= 60) break;
      if (tnx === 'client') {
        if (expectAuthSecretLine) {
          trace.push('C: [AUTH CREDENTIALS REDACTED]');
          expectAuthSecretLine = false;
          continue;
        }
        if (/^AUTH\s+/i.test(line)) {
          const parts = line.split(/\s+/);
          const mechanism = parts[1] || 'LOGIN';
          trace.push(
            parts.length > 2
              ? `C: AUTH ${mechanism} [CREDENTIALS REDACTED]`
              : `C: AUTH ${mechanism}`
          );
          if (parts.length <= 2) {
            expectAuthSecretLine = true;
          }
          continue;
        }
        trace.push(`C: ${line}`);
      } else if (tnx === 'server') {
        if (line.startsWith('334')) {
          expectAuthSecretLine = true;
        } else {
          expectAuthSecretLine = false;
        }
        trace.push(`S: ${line}`);
      } else {
        trace.push(`[SMTP] ${line}`);
      }
    }
  };

  const formatLoggerArgs = (message?: string, ...args: unknown[]) => {
    if (typeof message === 'string') {
      return formatLog(message, ...args).trim();
    }
    return args.map((a) => String(a ?? '')).join(' ').trim();
  };

  const logger = {
    level: () => undefined,
    trace: () => undefined,
    debug: (data: unknown, message?: string, ...args: unknown[]) => {
      const obj = (data && typeof data === 'object' ? data : {}) as {
        tnx?: string;
      };
      const text = formatLoggerArgs(message, ...args);
      if (text) {
        recordLine(obj.tnx || 'smtp', text);
      }
    },
    info: (data: unknown, message?: string, ...args: unknown[]) => {
      const obj = (data && typeof data === 'object' ? data : {}) as {
        tnx?: string;
      };
      const text = formatLoggerArgs(message, ...args);
      if (text) {
        recordLine(obj.tnx || 'smtp', text);
      }
    },
    warn: (_data: unknown, message?: string, ...args: unknown[]) => {
      const text = formatLoggerArgs(message, ...args);
      if (text && trace.length < 60) {
        trace.push(`[WARN] ${text}`);
      }
    },
    error: (_data: unknown, message?: string, ...args: unknown[]) => {
      const text = formatLoggerArgs(message, ...args);
      if (text && trace.length < 60) {
        trace.push(`[ERR] ${text}`);
      }
    },
  };

  const security = buildSmtpTransportSecurityOptions(cfg.host, cfg.port, cfg.secure);
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: security.secure,
    requireTLS: security.requireTLS,
    ignoreTLS: security.ignoreTLS,
    opportunisticTLS: security.opportunisticTLS,
    tls: security.tls,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    debug: true,
    logger: logger as unknown as Parameters<typeof nodemailer.createTransport>[0] extends {
      logger?: infer L;
    }
      ? L
      : never,
  });

  return {
    transporter,
    getTrace: () => [...trace],
  };
}

interface NodemailerErrorLike {
  message?: string;
  code?: string;
  errno?: string | number;
  syscall?: string;
  command?: string;
  responseCode?: number;
  response?: string;
}

function formatSmtpErrorMessage(err: unknown, host: string): string {
  const raw = err instanceof Error ? err.message : String(err || 'Unknown SMTP error');
  if (raw.includes('535-5.7.8') || raw.includes('Username and Password not accepted')) {
    if (host.includes('gmail.com')) {
      return 'Gmail SMTP rejected the username or password (535). For Gmail with 2-Step Verification, generate a 16-character Google App Password (myaccount.google.com/apppasswords) and use it as the SMTP Password.';
    }
    return `SMTP authentication rejected (535): check your SMTP username and password for ${host}.`;
  }
  if (raw.includes('ECONNREFUSED') || raw.includes('ENOTFOUND') || raw.includes('ETIMEDOUT')) {
    return `Could not connect to SMTP server ${host}: ${raw}. Verify the SMTP Host, Port, and TLS/SSL setting.`;
  }
  return raw;
}

function extractSmtpFailureDetails(
  err: unknown,
  host: string,
  port: number,
  trace: string[] = []
) {
  const e = (err && typeof err === 'object' ? err : {}) as NodemailerErrorLike;
  const raw = err instanceof Error ? err.message : String(err || 'Unknown SMTP error');
  const errorCode =
    typeof e.code === 'string' && e.code
      ? e.code
      : raw.match(/\b(EAUTH|ECONNECTION|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ESOCKET|EENVELOPE|EMESSAGE|EAI_AGAIN)\b/)?.[1];
  const responseCode =
    typeof e.responseCode === 'number'
      ? e.responseCode
      : Number(raw.match(/\b(4\d{2}|5\d{2})\b/)?.[1]) || undefined;
  const command =
    typeof e.command === 'string' && e.command
      ? e.command
      : responseCode === 535 || errorCode === 'EAUTH'
        ? 'AUTH'
        : errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND' || errorCode === 'ETIMEDOUT'
          ? 'CONN'
          : undefined;
  const rawResponse =
    typeof e.response === 'string' && e.response.trim() ? e.response.trim() : raw;
  const friendlyMessage = formatSmtpErrorMessage(err, host);
  const { actionHint, debuggingClues } = buildSmtpDebuggingClues({
    host,
    port,
    secure: port === 465,
    errorCode,
    responseCode,
    command,
    rawResponse,
  });

  const normalizedTrace =
    trace.length > 0
      ? trace
      : [`Connecting to ${host}:${port}...`, `[ERR] ${rawResponse}`];

  return {
    message: friendlyMessage,
    smtpErrorCode: errorCode,
    smtpResponseCode: responseCode,
    smtpCommand: command,
    smtpRawResponse: rawResponse,
    actionHint,
    debuggingClues,
    handshakeTrace: normalizedTrace,
  };
}

export interface SmtpPingInput {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}

export interface SmtpPingDeps {
  tcpPingFn?: (host: string, port: number, secure: boolean) => Promise<{ ms: number; banner: string }>;
  createTransporterFn?: (cfg: SmtpRuntimeConfig) => {
    transporter: { verify: () => Promise<unknown> };
    getTrace: () => string[];
  };
  logActivityFn?: (entry: Omit<SmtpActivityRecord, 'id' | 'timestamp'>) => SmtpActivityRecord;
}

export interface SmtpPingResult {
  httpStatus: number;
  body: {
    ok: boolean;
    mode?: 'full_handshake' | 'host_ping_only';
    error?: string;
    host: string;
    port: number;
    secure?: boolean;
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
    logEntryId?: string;
  };
}

function defaultTcpPingAndBanner(
  host: string,
  port: number,
  secure: boolean
): Promise<{ ms: number; banner: string }> {
  const startedAt = Date.now();
  return new Promise<{ ms: number; banner: string }>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    let connectMs = 0;

    const overallTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (connectMs > 0) {
        resolve({ ms: connectMs, banner: '' });
      } else {
        const err = new Error(`ETIMEDOUT: Connection to ${host}:${port} timed out after 6s`) as Error & {
          code?: string;
          command?: string;
        };
        err.code = 'ETIMEDOUT';
        err.command = 'CONN';
        reject(err);
      }
    }, 6000);

    socket.once('connect', () => {
      connectMs = Date.now() - startedAt;
      if (secure || port === 465) {
        settled = true;
        clearTimeout(overallTimer);
        socket.end();
        resolve({ ms: connectMs, banner: '' });
        return;
      }
      const bannerTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        clearTimeout(overallTimer);
        socket.end();
        resolve({ ms: connectMs, banner: '' });
      }, 1500);

      socket.once('data', (chunk) => {
        if (settled) return;
        settled = true;
        clearTimeout(bannerTimer);
        clearTimeout(overallTimer);
        const banner = chunk.toString('utf8').split(/\r?\n/)[0]?.trim() || '';
        socket.end();
        resolve({ ms: Date.now() - startedAt, banner });
      });
    });

    socket.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(overallTimer);
      socket.destroy();
      reject(err);
    });
  });
}

export async function pingSmtpServer(
  input: SmtpPingInput,
  deps: SmtpPingDeps = {}
): Promise<SmtpPingResult> {
  const host = (input.host || '').trim();
  const port = Number(input.port) || 587;
  const secure = typeof input.secure === 'boolean' ? input.secure : port === 465;
  const user = (input.user || '').trim();
  const pass = normalizeSmtpPassword(host, input.pass || '');

  const tcpPingFn = deps.tcpPingFn ?? defaultTcpPingAndBanner;
  const createTransporterFn = deps.createTransporterFn ?? createTraceableSmtpTransporter;
  const logActivityFn = deps.logActivityFn ?? pushSmtpActivityLog;

  if (!isValidSmtpHost(host) || !isValidSmtpPort(port)) {
    const actionHint =
      'Enter a valid SMTP Host (e.g. smtp.gmail.com) and TCP Port between 1 and 65535 (e.g. 587 or 465).';
    const logged = logActivityFn({
      eventType: 'Connection Test',
      to: user || host || 'Invalid Host',
      from: user || 'Unconfigured',
      subject: `SMTP Ping Validation (${host || 'missing'}:${port})`,
      status: 'Failed',
      smtpHost: host || undefined,
      smtpPort: port,
      errorMessage: 'Please enter a valid SMTP Host and Port (e.g. smtp.gmail.com:587).',
      smtpErrorCode: 'INVALID_HOST',
      smtpCommand: 'PREFLIGHT',
      smtpRawResponse: `Rejected invalid host="${host}" port=${port} before TCP connect.`,
      actionHint,
      handshakeTrace: [
        `[PREFLIGHT] Validating target host="${host}" port=${port}...`,
        '[ERR] Invalid SMTP host or port.',
      ],
      attachmentCount: 0,
    });
    return {
      httpStatus: 400,
      body: {
        ok: false,
        error: 'INVALID_HOST',
        host,
        port,
        message: 'Please enter a valid SMTP Host and Port (e.g. smtp.gmail.com:587).',
        smtpErrorCode: 'INVALID_HOST',
        smtpCommand: 'PREFLIGHT',
        actionHint,
        logEntryId: logged.id,
      },
    };
  }

  const startedAt = Date.now();
  let tcpLatencyMs = 0;
  let smtpBanner = '';

  try {
    const pingRes = await tcpPingFn(host, port, secure);
    tcpLatencyMs = pingRes.ms;
    smtpBanner = pingRes.banner;
  } catch (err) {
    const failure = extractSmtpFailureDetails(err, host, port, [
      `TCP connect to ${host}:${port} (${secure ? 'SSL/TLS' : 'STARTTLS'})...`,
      `[ERR] ${err instanceof Error ? err.message : String(err)}`,
    ]);
    const logged = logActivityFn({
      eventType: 'Connection Test',
      to: user || host,
      from: user || 'Unconfigured',
      subject: `SMTP TCP Ping (${host}:${port})`,
      status: 'Failed',
      smtpHost: host,
      smtpPort: port,
      errorMessage: failure.message,
      smtpErrorCode: failure.smtpErrorCode || 'ECONNECTION',
      smtpResponseCode: failure.smtpResponseCode,
      smtpCommand: failure.smtpCommand || 'CONN',
      smtpRawResponse: failure.smtpRawResponse,
      actionHint: failure.actionHint,
      debuggingClues: failure.debuggingClues,
      handshakeTrace: failure.handshakeTrace,
      attachmentCount: 0,
    });
    return {
      httpStatus: 422,
      body: {
        ok: false,
        error: 'SMTP_HOST_UNREACHABLE',
        host,
        port,
        secure,
        latencyMs: Date.now() - startedAt,
        message: failure.message,
        smtpErrorCode: failure.smtpErrorCode || 'ECONNECTION',
        smtpResponseCode: failure.smtpResponseCode,
        smtpCommand: failure.smtpCommand || 'CONN',
        smtpRawResponse: failure.smtpRawResponse,
        actionHint: failure.actionHint,
        debuggingClues: failure.debuggingClues,
        logEntryId: logged.id,
      },
    };
  }

  if (!user || !pass) {
    const bannerNote = smtpBanner ? ` (${smtpBanner})` : '';
    const trace = [
      `TCP connect to ${host}:${port} (${secure ? 'SSL/TLS' : 'STARTTLS'}) succeeded in ${tcpLatencyMs} ms`,
      ...(smtpBanner ? [`S: ${smtpBanner}`] : ['[TLS] Port open; awaiting SMTP credentials for AUTH handshake']),
    ];
    const logged = logActivityFn({
      eventType: 'Connection Test',
      to: host,
      from: user || 'Ping Check',
      subject: `SMTP Host Ping (${host}:${port})`,
      status: 'Sent',
      smtpHost: host,
      smtpPort: port,
      response: smtpBanner || `TCP open (${tcpLatencyMs} ms)`,
      handshakeTrace: trace,
      attachmentCount: 0,
    });
    return {
      httpStatus: 200,
      body: {
        ok: true,
        mode: 'host_ping_only',
        host,
        port,
        secure,
        latencyMs: tcpLatencyMs,
        tcpPingMs: tcpLatencyMs,
        banner: smtpBanner,
        message: `SMTP host ${host}:${port} ping succeeded in ${tcpLatencyMs} ms${bannerNote}. Enter SMTP Username & Password / App Password to also verify login.`,
        logEntryId: logged.id,
      },
    };
  }

  const { transporter, getTrace } = createTransporterFn({
    host,
    port,
    secure,
    user,
    pass,
    fromName: runtimeSmtpConfig.fromName,
    fromEmail: user,
    source: 'runtime',
  });

  try {
    await transporter.verify();
    const totalMs = Date.now() - startedAt;
    const logged = logActivityFn({
      eventType: 'Connection Test',
      to: user,
      from: user,
      subject: `SMTP Handshake Ping (${host}:${port})`,
      status: 'Sent',
      smtpHost: host,
      smtpPort: port,
      response: `250 Handshake OK (${totalMs} ms)`,
      handshakeTrace: getTrace(),
      attachmentCount: 0,
    });
    return {
      httpStatus: 200,
      body: {
        ok: true,
        mode: 'full_handshake',
        host,
        port,
        secure,
        latencyMs: totalMs,
        tcpPingMs: tcpLatencyMs,
        banner: smtpBanner,
        message: `SMTP connection verified for ${host}:${port} (${totalMs} ms round-trip, ping ${tcpLatencyMs} ms). Ready to send as ${user}.`,
        logEntryId: logged.id,
      },
    };
  } catch (err) {
    const failure = extractSmtpFailureDetails(err, host, port, getTrace());
    const logged = logActivityFn({
      eventType: 'Connection Test',
      to: user,
      from: user,
      subject: `SMTP Handshake Ping (${host}:${port})`,
      status: 'Failed',
      smtpHost: host,
      smtpPort: port,
      errorMessage: failure.message,
      smtpErrorCode: failure.smtpErrorCode,
      smtpResponseCode: failure.smtpResponseCode,
      smtpCommand: failure.smtpCommand,
      smtpRawResponse: failure.smtpRawResponse,
      actionHint: failure.actionHint,
      debuggingClues: failure.debuggingClues,
      handshakeTrace: failure.handshakeTrace,
      attachmentCount: 0,
    });
    return {
      httpStatus: 422,
      body: {
        ok: false,
        mode: 'full_handshake',
        error: 'SMTP_AUTH_OR_TLS_FAILED',
        host,
        port,
        secure,
        latencyMs: Date.now() - startedAt,
        tcpPingMs: tcpLatencyMs,
        message: failure.message,
        smtpErrorCode: failure.smtpErrorCode,
        smtpResponseCode: failure.smtpResponseCode,
        smtpCommand: failure.smtpCommand,
        smtpRawResponse: failure.smtpRawResponse,
        actionHint: failure.actionHint,
        debuggingClues: failure.debuggingClues,
        logEntryId: logged.id,
      },
    };
  }
}

export interface SmtpDiagnosticStage {
  id: 'dns' | 'tcp' | 'tls' | 'auth';
  label: string;
  status: 'pass' | 'fail' | 'skipped';
  latencyMs?: number;
  detail: string;
}

export type SmtpFailureCategory =
  | 'Wrong Password'
  | 'Port Blocked'
  | 'SSL Protocol Mismatch'
  | 'Host Not Found'
  | 'Missing Credentials'
  | 'Encryption Required'
  | 'Handshake Failed';

export interface SmtpDiagnosticResult {
  ok: boolean;
  host: string;
  port: number;
  secure: boolean;
  resolvedIp?: string;
  banner?: string;
  tlsProtocol?: string;
  tlsCipher?: string;
  failureCategory?: SmtpFailureCategory;
  plainEnglishTitle: string;
  plainEnglishExplanation: string;
  recommendedSteps: string[];
  suggestedFix?: {
    label: string;
    port: number;
    secure: boolean;
  };
  stages: SmtpDiagnosticStage[];
  trace: string[];
  logEntryId?: string;
}

async function probeRawTcpConnect(
  host: string,
  port: number,
  timeoutMs = 6000
): Promise<{ latencyMs: number }> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      const err = new Error(`TCP connection to ${host}:${port} timed out after ${timeoutMs} ms`) as Error & {
        code?: string;
      };
      err.code = 'ETIMEDOUT';
      reject(err);
    }, timeoutMs);

    socket.once('connect', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const latencyMs = Date.now() - startedAt;
      socket.end();
      resolve({ latencyMs });
    });

    socket.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    });
  });
}

async function probeTlsSocketHandshake(
  host: string,
  port: number,
  secure: boolean,
  trace: string[]
): Promise<{
  latencyMs: number;
  banner: string;
  tlsProtocol: string;
  tlsCipher: string;
}> {
  const startedAt = Date.now();

  if (secure) {
    return new Promise((resolve, reject) => {
      const tlsSocket = tls.connect({
        host,
        port,
        servername: host,
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      });
      let settled = false;
      let banner = '';
      let tlsProtocol = '';
      let tlsCipher = '';

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        tlsSocket.destroy();
        const err = new Error(`TLS handshake on ${host}:${port} timed out`) as Error & {
          code?: string;
        };
        err.code = tlsProtocol ? 'NO_BANNER' : 'SSL_MISMATCH_TIMEOUT';
        reject(err);
      }, 7000);

      tlsSocket.once('secureConnect', () => {
        tlsProtocol = tlsSocket.getProtocol() || 'TLS';
        tlsCipher = tlsSocket.getCipher()?.name || 'Standard';
        trace.push(`[TLS] Implicit SSL/TLS negotiated (${tlsProtocol} / ${tlsCipher})`);

        const bannerWait = setTimeout(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          tlsSocket.end();
          resolve({
            latencyMs: Date.now() - startedAt,
            banner,
            tlsProtocol,
            tlsCipher,
          });
        }, 1800);

        tlsSocket.once('data', (chunk) => {
          if (settled) return;
          settled = true;
          clearTimeout(bannerWait);
          clearTimeout(timer);
          banner = chunk.toString('utf8').split(/\r?\n/)[0]?.trim() || '';
          if (banner) trace.push(`S: ${banner}`);
          tlsSocket.end();
          resolve({
            latencyMs: Date.now() - startedAt,
            banner,
            tlsProtocol,
            tlsCipher,
          });
        });
      });

      tlsSocket.once('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        tlsSocket.destroy();
        reject(err);
      });
    });
  }

  // STARTTLS socket-level probe
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    let phase: 'banner' | 'ehlo' | 'starttls' | 'tls' = 'banner';
    let banner = '';
    let buffer = '';

    const fail = (err: Error & { code?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    };

    const timer = setTimeout(() => {
      const err = new Error(
        phase === 'banner'
          ? `Server on ${host}:${port} did not send an SMTP greeting banner (likely expects SSL/TLS instead of STARTTLS)`
          : `STARTTLS negotiation timed out at stage "${phase}"`
      ) as Error & { code?: string };
      err.code = phase === 'banner' ? 'SSL_EXPECTED_NO_BANNER' : 'ETIMEDOUT';
      fail(err);
    }, 7000);

    socket.on('error', (err) => fail(err as Error & { code?: string }));

    socket.on('close', () => {
      if (!settled && phase === 'banner') {
        const err = new Error(
          `Socket closed before SMTP greeting banner on ${host}:${port} (port may expect immediate SSL/TLS)`
        ) as Error & { code?: string };
        err.code = 'SSL_EXPECTED_NO_BANNER';
        fail(err);
      }
    });

    socket.on('data', (chunk) => {
      if (settled) return;
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        trace.push(`S: ${line}`);

        if (phase === 'banner') {
          banner = line;
          if (/^\d{3}\s/.test(line)) {
            phase = 'ehlo';
            trace.push('C: EHLO erp-diagnostic.local');
            socket.write('EHLO erp-diagnostic.local\r\n');
          }
        } else if (phase === 'ehlo') {
          if (/^250\s/.test(line)) {
            phase = 'starttls';
            trace.push('C: STARTTLS');
            socket.write('STARTTLS\r\n');
          } else if (/^[45]\d{2}\s/.test(line)) {
            const err = new Error(`EHLO rejected: ${line}`) as Error & { code?: string };
            err.code = 'EHLO_REJECTED';
            fail(err);
          }
        } else if (phase === 'starttls') {
          if (line.startsWith('220')) {
            phase = 'tls';
            socket.removeAllListeners('data');
            socket.removeAllListeners('close');
            const tlsSocket = tls.connect({
              socket,
              servername: host,
              minVersion: 'TLSv1.2',
              rejectUnauthorized: true,
            });
            tlsSocket.once('secureConnect', () => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              const tlsProtocol = tlsSocket.getProtocol() || 'TLS';
              const tlsCipher = tlsSocket.getCipher()?.name || 'Standard';
              trace.push(`[TLS] STARTTLS upgraded (${tlsProtocol} / ${tlsCipher})`);
              tlsSocket.end();
              resolve({
                latencyMs: Date.now() - startedAt,
                banner,
                tlsProtocol,
                tlsCipher,
              });
            });
            tlsSocket.once('error', (err) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              tlsSocket.destroy();
              reject(err);
            });
          } else {
            const err = new Error(`STARTTLS failed or unsupported: ${line}`) as Error & {
              code?: string;
            };
            err.code = 'STARTTLS_UNSUPPORTED';
            fail(err);
          }
        }
      }
    });
  });
}

async function runSmtpSocketDiagnostics(input: {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}): Promise<SmtpDiagnosticResult> {
  const host = (input.host || '').trim();
  const port = Number(input.port) || 587;
  const secure = typeof input.secure === 'boolean' ? input.secure : port === 465;
  const user = (input.user || '').trim();
  const pass = normalizeSmtpPassword(host, input.pass || '');

  const stages: SmtpDiagnosticStage[] = [];
  const trace: string[] = [];

  if (!isValidSmtpHost(host) || !isValidSmtpPort(port)) {
    const res: SmtpDiagnosticResult = {
      ok: false,
      host,
      port,
      secure,
      failureCategory: 'Host Not Found',
      plainEnglishTitle: 'Invalid SMTP Host or Port',
      plainEnglishExplanation:
        'The SMTP Host or Port looks incomplete or invalid. No network socket could be opened.',
      recommendedSteps: [
        'Enter a real SMTP server domain such as smtp.gmail.com, smtp.office365.com, or smtp.zoho.in.',
        'Use Port 587 with STARTTLS or Port 465 with SSL/TLS.',
      ],
      suggestedFix: {
        label: 'Apply Gmail 587 (STARTTLS)',
        port: 587,
        secure: false,
      },
      stages: [
        {
          id: 'dns',
          label: '1. DNS Lookup',
          status: 'fail',
          detail: `Invalid hostname "${host || 'empty'}" or port ${port}.`,
        },
        { id: 'tcp', label: '2. TCP Socket', status: 'skipped', detail: 'Skipped' },
        { id: 'tls', label: '3. TLS / SSL Handshake', status: 'skipped', detail: 'Skipped' },
        { id: 'auth', label: '4. SMTP Login (AUTH)', status: 'skipped', detail: 'Skipped' },
      ],
      trace: [`[PREFLIGHT] Invalid host="${host}" port=${port}`],
    };
    return res;
  }

  // Stage 1: DNS Resolution
  let resolvedIp = '';
  const dnsStart = Date.now();
  try {
    const lookup = await dns.promises.lookup(host);
    resolvedIp = lookup.address;
    const dnsMs = Date.now() - dnsStart;
    trace.push(`[DNS] Resolved ${host} -> ${resolvedIp} (IPv${lookup.family}) in ${dnsMs} ms`);
    stages.push({
      id: 'dns',
      label: '1. DNS Lookup',
      status: 'pass',
      latencyMs: dnsMs,
      detail: `Resolved to ${resolvedIp} (IPv${lookup.family})`,
    });
  } catch (err) {
    const dnsMs = Date.now() - dnsStart;
    const msg = err instanceof Error ? err.message : String(err);
    trace.push(`[DNS] Failed resolving ${host}: ${msg}`);
    stages.push({
      id: 'dns',
      label: '1. DNS Lookup',
      status: 'fail',
      latencyMs: dnsMs,
      detail: msg,
    });
    stages.push(
      { id: 'tcp', label: '2. TCP Socket', status: 'skipped', detail: 'Skipped after DNS failure' },
      { id: 'tls', label: '3. TLS / SSL Handshake', status: 'skipped', detail: 'Skipped' },
      { id: 'auth', label: '4. SMTP Login (AUTH)', status: 'skipped', detail: 'Skipped' }
    );
    const logged = pushSmtpActivityLog({
      eventType: 'Connection Test',
      to: user || host,
      from: user || 'Socket Diagnostic',
      subject: `Socket Diagnostic (${host}:${port})`,
      status: 'Failed',
      smtpHost: host,
      smtpPort: port,
      errorMessage: `Host Not Found: Could not resolve "${host}" via DNS.`,
      smtpErrorCode: 'EDNS',
      smtpCommand: 'DNS',
      smtpRawResponse: msg,
      actionHint: 'Double-check the SMTP Host spelling (e.g. smtp.gmail.com) and remove spaces or https://.',
      debuggingClues: [`DNS failed for "${host}": ${msg}`],
      handshakeTrace: trace,
      attachmentCount: 0,
    });
    return {
      ok: false,
      host,
      port,
      secure,
      failureCategory: 'Host Not Found',
      plainEnglishTitle: 'Host Not Found (DNS Error)',
      plainEnglishExplanation: `We could not find an internet address for "${host}". Usually this means there is a typo in the SMTP Host field.`,
      recommendedSteps: [
        'Check the SMTP Host spelling (e.g. smtp.gmail.com, smtp.office365.com, smtp.zoho.in).',
        'Make sure there are no leading spaces, trailing spaces, or "https://" prefixes.',
      ],
      stages,
      trace,
      logEntryId: logged.id,
    };
  }

  // Stage 2: Raw TCP Socket Connectivity
  try {
    const tcp = await probeRawTcpConnect(host, port, 6000);
    trace.push(`[TCP] Connected socket to ${resolvedIp}:${port} in ${tcp.latencyMs} ms`);
    stages.push({
      id: 'tcp',
      label: '2. TCP Socket',
      status: 'pass',
      latencyMs: tcp.latencyMs,
      detail: `Port ${port} reachable (${tcp.latencyMs} ms)`,
    });
  } catch (err) {
    const e = err as Error & { code?: string };
    const code = e.code || 'ECONNECTION';
    const msg = e.message || String(err);
    trace.push(`[TCP] Failed connecting to ${host}:${port} (${code}): ${msg}`);
    stages.push({
      id: 'tcp',
      label: '2. TCP Socket',
      status: 'fail',
      detail: `${code}: ${msg}`,
    });
    stages.push(
      { id: 'tls', label: '3. TLS / SSL Handshake', status: 'skipped', detail: 'Skipped because port is unreachable' },
      { id: 'auth', label: '4. SMTP Login (AUTH)', status: 'skipped', detail: 'Skipped' }
    );
    const isTimeout = code === 'ETIMEDOUT';
    const title = isTimeout
      ? 'Port Blocked (Firewall Timeout)'
      : 'Port Blocked / Connection Refused';
    const explanation = isTimeout
      ? `Port ${port} on ${host} did not reply within 6 seconds. Outbound traffic on port ${port} is likely blocked by a firewall or cloud policy.`
      : `${host} actively refused our connection on port ${port}. Either the port number is wrong or the mail server is not listening on port ${port}.`;
    const suggestedFix =
      port === 587
        ? { label: 'Try Port 465 (SSL/TLS)', port: 465, secure: true }
        : { label: 'Try Port 587 (STARTTLS)', port: 587, secure: false };
    const logged = pushSmtpActivityLog({
      eventType: 'Connection Test',
      to: user || host,
      from: user || 'Socket Diagnostic',
      subject: `Socket Diagnostic (${host}:${port})`,
      status: 'Failed',
      smtpHost: host,
      smtpPort: port,
      errorMessage: `${title}: ${msg}`,
      smtpErrorCode: code,
      smtpCommand: 'TCP_CONNECT',
      smtpRawResponse: msg,
      actionHint: `Try ${suggestedFix.label} and verify outbound access to port ${port}.`,
      debuggingClues: [explanation, `Resolved IP: ${resolvedIp}`],
      handshakeTrace: trace,
      attachmentCount: 0,
    });
    return {
      ok: false,
      host,
      port,
      secure,
      resolvedIp,
      failureCategory: 'Port Blocked',
      plainEnglishTitle: title,
      plainEnglishExplanation: explanation,
      recommendedSteps: [
        `If Port 25 or ${port} is blocked by your network or cloud container, try Port 587 (STARTTLS) or Port 465 (SSL/TLS).`,
        'Confirm your SMTP provider accepts external SMTP connections on this port.',
      ],
      suggestedFix,
      stages,
      trace,
      logEntryId: logged.id,
    };
  }

  // Stage 3: TLS / SSL Protocol Probe
  let banner = '';
  let tlsProtocol = '';
  let tlsCipher = '';
  try {
    const tlsRes = await probeTlsSocketHandshake(host, port, secure, trace);
    banner = tlsRes.banner;
    tlsProtocol = tlsRes.tlsProtocol;
    tlsCipher = tlsRes.tlsCipher;
    stages.push({
      id: 'tls',
      label: '3. TLS / SSL Handshake',
      status: 'pass',
      latencyMs: tlsRes.latencyMs,
      detail: `${tlsProtocol} (${tlsCipher})`,
    });
  } catch (err) {
    const e = err as Error & { code?: string };
    const rawMsg = e.message || String(err);
    const lower = rawMsg.toLowerCase();
    const isSslMismatch =
      e.code === 'SSL_EXPECTED_NO_BANNER' ||
      e.code === 'SSL_MISMATCH_TIMEOUT' ||
      e.code === 'STARTTLS_UNSUPPORTED' ||
      lower.includes('wrong version number') ||
      lower.includes('ssl routines') ||
      lower.includes('packet length too long') ||
      lower.includes('unknown protocol');

    trace.push(`[TLS] Handshake failed (${e.code || 'TLS_ERR'}): ${rawMsg}`);
    stages.push({
      id: 'tls',
      label: '3. TLS / SSL Handshake',
      status: 'fail',
      detail: rawMsg,
    });
    stages.push({
      id: 'auth',
      label: '4. SMTP Login (AUTH)',
      status: 'skipped',
      detail: 'Skipped after TLS/SSL mismatch',
    });

    const suggestedFix = secure
      ? {
          label: port === 465 ? 'Switch Port 465 to 587 (STARTTLS)' : `Switch Port ${port} to STARTTLS`,
          port: port === 465 ? 587 : port,
          secure: false,
        }
      : {
          label: port === 587 ? 'Switch Port 587 to 465 (SSL/TLS)' : `Switch Port ${port} to SSL/TLS`,
          port: port === 587 ? 465 : port,
          secure: true,
        };

    const explanation = isSslMismatch
      ? secure
        ? `SSL Protocol Mismatch: You selected SSL/TLS on port ${port}, but the server expected a plaintext STARTTLS greeting first (or vice versa).`
        : `SSL Protocol Mismatch: You selected STARTTLS on port ${port}, but the server immediately expects an SSL/TLS encrypted handshake (common on Port 465).`
      : `TLS negotiation with ${host}:${port} failed: ${rawMsg}`;

    const logged = pushSmtpActivityLog({
      eventType: 'Connection Test',
      to: user || host,
      from: user || 'Socket Diagnostic',
      subject: `Socket Diagnostic (${host}:${port})`,
      status: 'Failed',
      smtpHost: host,
      smtpPort: port,
      errorMessage: explanation,
      smtpErrorCode: e.code || 'ESOCKET',
      smtpCommand: secure ? 'TLS_CONNECT' : 'STARTTLS',
      smtpRawResponse: rawMsg,
      actionHint: `Use Port 587 with STARTTLS or Port 465 with SSL/TLS.`,
      debuggingClues: [explanation, 'Port 587 = STARTTLS (secure: false)', 'Port 465 = SSL/TLS (secure: true)'],
      handshakeTrace: trace,
      attachmentCount: 0,
    });

    return {
      ok: false,
      host,
      port,
      secure,
      resolvedIp,
      failureCategory: 'SSL Protocol Mismatch',
      plainEnglishTitle: isSslMismatch ? 'SSL Protocol Mismatch' : 'TLS Certificate / Socket Error',
      plainEnglishExplanation: explanation,
      recommendedSteps: [
        'Use Encryption = STARTTLS when connecting on Port 587.',
        'Use Encryption = SSL/TLS when connecting on Port 465.',
      ],
      suggestedFix,
      stages,
      trace,
      logEntryId: logged.id,
    };
  }

  // Stage 4: SMTP Authentication Check (if credentials are entered)
  if (!user || !pass) {
    stages.push({
      id: 'auth',
      label: '4. SMTP Login (AUTH)',
      status: 'skipped',
      detail: 'Network & TLS passed. Enter Username & Password to test login.',
    });
    const logged = pushSmtpActivityLog({
      eventType: 'Connection Test',
      to: host,
      from: user || 'Socket Diagnostic',
      subject: `Socket Diagnostic (${host}:${port})`,
      status: 'Sent',
      smtpHost: host,
      smtpPort: port,
      response: `DNS + TCP + ${tlsProtocol} OK${banner ? ` (${banner})` : ''}`,
      debuggingClues: [
        `DNS resolved to ${resolvedIp}`,
        `TLS negotiated: ${tlsProtocol} (${tlsCipher})`,
        'AUTH login skipped because credentials were not entered.',
      ],
      handshakeTrace: trace,
      attachmentCount: 0,
    });
    return {
      ok: true,
      host,
      port,
      secure,
      resolvedIp,
      banner,
      tlsProtocol,
      tlsCipher,
      plainEnglishTitle: 'Socket & TLS Connectivity Healthy',
      plainEnglishExplanation: `Your server can reach ${host}:${port} and completed the ${tlsProtocol} handshake cleanly. Enter your SMTP Username and Password / App Password to verify login too.`,
      recommendedSteps: [
        'Enter your full mailbox email as SMTP Username.',
        'For Gmail, paste a 16-character Google App Password and click Verify & Save SMTP Settings.',
      ],
      stages,
      trace,
      logEntryId: logged.id,
    };
  }

  const authCheck = await checkSmtpConnection({ host, port, secure, user, pass });
  const mergedTrace = [...trace, ...authCheck.handshakeTrace];

  if (authCheck.ok) {
    stages.push({
      id: 'auth',
      label: '4. SMTP Login (AUTH)',
      status: 'pass',
      latencyMs: authCheck.latencyMs,
      detail: `Authenticated as ${user}`,
    });
    const logged = pushSmtpActivityLog({
      eventType: 'Connection Test',
      to: user,
      from: user,
      subject: `Socket Diagnostic (${host}:${port})`,
      status: 'Sent',
      smtpHost: host,
      smtpPort: port,
      response: `All 4 stages passed (${tlsProtocol}, AUTH OK)`,
      debuggingClues: authCheck.debuggingClues,
      handshakeTrace: mergedTrace,
      attachmentCount: 0,
    });
    return {
      ok: true,
      host,
      port,
      secure,
      resolvedIp,
      banner,
      tlsProtocol,
      tlsCipher,
      plainEnglishTitle: 'All SMTP Diagnostics Passed',
      plainEnglishExplanation: `DNS, TCP socket, ${tlsProtocol} encryption, and SMTP login for ${user} all succeeded on ${host}:${port}.`,
      recommendedSteps: ['Click "Verify & Save SMTP Settings" to lock in this configuration for ERP emails.'],
      stages,
      trace: mergedTrace,
      logEntryId: logged.id,
    };
  }

  const isAuthErr =
    authCheck.smtpErrorCode === 'EAUTH' ||
    authCheck.smtpResponseCode === 535 ||
    (authCheck.smtpRawResponse || '').toLowerCase().includes('username and password');
  const isStartTlsRequired =
    authCheck.smtpResponseCode === 530 || authCheck.smtpResponseCode === 534;

  const failureCategory: SmtpFailureCategory = isAuthErr
    ? 'Wrong Password'
    : isStartTlsRequired
      ? 'Encryption Required'
      : 'Handshake Failed';
  const plainEnglishTitle = isAuthErr
    ? host.toLowerCase().includes('gmail')
      ? 'Wrong Password (or Gmail App Password Required)'
      : 'Wrong Username or Password'
    : isStartTlsRequired
      ? 'Encryption Required by Mail Server'
      : 'SMTP Handshake Failed';
  const plainEnglishExplanation = isAuthErr
    ? host.toLowerCase().includes('gmail')
      ? `The socket connected to Gmail and encrypted cleanly (${tlsProtocol}), but Gmail rejected your login (535). Gmail blocks normal account passwords here — you must use a 16-character Google App Password.`
      : `The socket connected and encrypted cleanly (${tlsProtocol}), but ${host} rejected the username or password (SMTP ${authCheck.smtpResponseCode || '535'}).`
    : authCheck.message;

  stages.push({
    id: 'auth',
    label: '4. SMTP Login (AUTH)',
    status: 'fail',
    latencyMs: authCheck.latencyMs,
    detail: authCheck.smtpRawResponse || authCheck.message,
  });

  const logged = pushSmtpActivityLog({
    eventType: 'Connection Test',
    to: user,
    from: user,
    subject: `Socket Diagnostic (${host}:${port})`,
    status: 'Failed',
    smtpHost: host,
    smtpPort: port,
    errorMessage: plainEnglishExplanation,
    smtpErrorCode: authCheck.smtpErrorCode,
    smtpResponseCode: authCheck.smtpResponseCode,
    smtpCommand: authCheck.smtpCommand,
    smtpRawResponse: authCheck.smtpRawResponse,
    actionHint: authCheck.actionHint,
    debuggingClues: authCheck.debuggingClues,
    handshakeTrace: mergedTrace,
    attachmentCount: 0,
  });

  return {
    ok: false,
    host,
    port,
    secure,
    resolvedIp,
    banner,
    tlsProtocol,
    tlsCipher,
    failureCategory,
    plainEnglishTitle,
    plainEnglishExplanation,
    recommendedSteps:
      authCheck.debuggingClues.length > 0
        ? authCheck.debuggingClues
        : [authCheck.actionHint || 'Check SMTP Username and Password / App Password.'],
    stages,
    trace: mergedTrace,
    logEntryId: logged.id,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'Facility Management ERP SMS Gateway',
      mode: 'sandbox-carrier',
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/sms/send', (req, res) => {
    expireStaleChallenges();
    const {
      phone,
      recipientName = 'Recipient',
      purpose = 'client_mobile_verification',
      entityType = 'client',
      entityId = '',
      entityLabel = 'ERP Verification',
      requiresVerification = true,
      customMessage = '',
      ttlMinutes = 5,
      maxAttempts = 5,
    } = req.body ?? {};

    const clampedTtl = Math.min(30, Math.max(1, Math.round(Number(ttlMinutes) || 5)));
    const clampedAttempts = Math.min(10, Math.max(1, Math.round(Number(maxAttempts) || 5)));

    const normalized = normalizePhone(String(phone || ''));
    if (!normalized || normalized.length < 10) {
      return res.status(400).json({ error: 'Valid mobile number with country/area digits is required.' });
    }

    for (const existing of smsMessages) {
      if (
        existing.to === normalized &&
        existing.entityId === entityId &&
        existing.verificationStatus === 'pending'
      ) {
        existing.verificationStatus = 'expired';
      }
    }

    const otpCode = requiresVerification ? String(crypto.randomInt(100000, 999999)) : undefined;
    const salt = otpCode ? crypto.randomBytes(16).toString('hex') : undefined;
    const otpHash = otpCode && salt ? hashOtp(otpCode, salt) : undefined;
    const body = buildSmsBody(purpose, entityLabel || normalized, otpCode, customMessage, clampedTtl);

    const now = new Date();
    const deliveredAt = new Date(now.getTime() + 120).toISOString();
    const receivedAt = new Date(now.getTime() + 250).toISOString();
    const expiresAt = requiresVerification
      ? new Date(now.getTime() + clampedTtl * 60 * 1000).toISOString()
      : null;

    const record: SmsRecord = {
      id: generateId('SMS'),
      direction: 'outbound',
      from: 'FM-ERP',
      to: normalized,
      recipientName: String(recipientName || normalized),
      purpose,
      entityType,
      entityId: String(entityId || normalized),
      entityLabel: String(entityLabel || normalized),
      body,
      otpHash,
      otpSalt: salt,
      deliveryStatus: 'received',
      verificationStatus: requiresVerification ? 'pending' : 'not_required',
      requiresVerification: Boolean(requiresVerification),
      attempts: 0,
      maxAttempts: clampedAttempts,
      expiresAt,
      createdAt: now.toISOString(),
      deliveredAt,
      receivedAt,
      verifiedAt: null,
      verifiedMethod: null,
      carrierRef: generateCarrierRef(),
      carrierMode: 'sandbox-carrier',
    };

    smsMessages.unshift(record);
    pushAudit(
      record.id,
      normalized,
      'SMS Dispatched & Received',
      `${purpose.replace(/_/g, ' ')} SMS delivered (${record.carrierRef}) and received on handset.`,
      'info'
    );

    const challengeToken =
      otpHash && salt && expiresAt
        ? signChallengeToken({
            id: record.id,
            to: record.to,
            entityType: record.entityType,
            entityId: record.entityId,
            entityLabel: record.entityLabel,
            purpose: record.purpose,
            otpHash,
            otpSalt: salt,
            expiresAt,
            receivedAt,
          })
        : undefined;

    return res.status(201).json({
      id: record.id,
      to: record.to,
      recipientName: record.recipientName,
      purpose: record.purpose,
      entityType: record.entityType,
      entityId: record.entityId,
      entityLabel: record.entityLabel,
      deliveryStatus: record.deliveryStatus,
      verificationStatus: record.verificationStatus,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      receivedAt: record.receivedAt,
      carrierRef: record.carrierRef,
      carrierMode: record.carrierMode,
      challengeToken,
    });
  });

  app.get('/api/sms/inbox', (req, res) => {
    expireStaleChallenges();
    const phoneFilter = req.query.phone ? normalizePhone(String(req.query.phone)) : '';
    const nowIso = new Date().toISOString();

    const filtered = smsMessages
      .filter((m) => !phoneFilter || m.to === phoneFilter || m.from === phoneFilter)
      .map((m) => {
        if (m.deliveryStatus !== 'received') {
          m.deliveryStatus = 'received';
          m.receivedAt = m.receivedAt || nowIso;
        }
        const { otpHash: _h, otpSalt: _s, ...safe } = m;
        return safe;
      });

    res.json({ messages: filtered });
  });

  const handleInboundReceive = (req: express.Request, res: express.Response) => {
    expireStaleChallenges();
    const fromRaw = req.body?.from || req.body?.From || '';
    const toRaw = req.body?.to || req.body?.To || 'FM-ERP';
    const bodyText = String(req.body?.body || req.body?.Body || '').trim();

    const from = normalizePhone(String(fromRaw));
    if (!from || !bodyText) {
      return res.status(400).json({ error: 'Inbound SMS requires "from" phone number and "body" text.' });
    }

    const now = new Date().toISOString();
    const inboundRecord: SmsRecord = {
      id: generateId('INB'),
      direction: 'inbound',
      from,
      to: String(toRaw),
      recipientName: 'Facility Management ERP Gateway',
      purpose: 'inbound_reply',
      entityType: 'system',
      entityId: 'GATEWAY',
      entityLabel: 'Inbound SMS Reply',
      body: bodyText,
      deliveryStatus: 'received',
      verificationStatus: 'not_required',
      requiresVerification: false,
      attempts: 0,
      maxAttempts: 0,
      expiresAt: null,
      createdAt: now,
      deliveredAt: now,
      receivedAt: now,
      verifiedAt: null,
      verifiedMethod: null,
      carrierRef: generateCarrierRef(),
      carrierMode: 'sandbox-carrier',
    };

    smsMessages.unshift(inboundRecord);
    pushAudit(inboundRecord.id, from, 'Inbound SMS Received', `Received reply: "${bodyText}"`, 'info');

    const codeMatch = bodyText.match(/\b(\d{6})\b/);
    let matchedVerification: SmsRecord | null = null;
    let verificationOutcome: 'verified' | 'invalid_code' | 'no_pending' = 'no_pending';

    if (codeMatch) {
      const code = codeMatch[1];
      const candidates = smsMessages.filter(
        (m) =>
          m.direction === 'outbound' &&
          m.to === from &&
          m.requiresVerification &&
          m.verificationStatus === 'pending'
      );

      for (const candidate of candidates) {
        if (candidate.otpHash && candidate.otpSalt && verifyOtpHash(code, candidate.otpSalt, candidate.otpHash)) {
          candidate.attempts += 1;
          candidate.verificationStatus = 'verified';
          candidate.verifiedAt = now;
          candidate.verifiedMethod = 'inbound_sms_reply';
          matchedVerification = candidate;
          verificationOutcome = 'verified';

          verifiedPhones.set(candidate.to, {
            phone: candidate.to,
            verifiedAt: now,
            messageId: candidate.id,
            method: 'inbound_sms_reply',
            holderName: candidate.recipientName,
          });
          verifiedEntities.set(candidate.entityId, {
            entityId: candidate.entityId,
            entityType: candidate.entityType,
            entityLabel: candidate.entityLabel,
            phone: candidate.to,
            verifiedAt: now,
            messageId: candidate.id,
            purpose: candidate.purpose,
            method: 'inbound_sms_reply',
          });

          pushAudit(
            candidate.id,
            from,
            'SMS Verified via Inbound Reply',
            `Verified ${candidate.entityLabel} from inbound SMS "${bodyText}"`,
            'success'
          );

          const ackSms: SmsRecord = {
            id: generateId('SMS'),
            direction: 'outbound',
            from: 'FM-ERP',
            to: from,
            recipientName: candidate.recipientName,
            purpose: candidate.purpose,
            entityType: candidate.entityType,
            entityId: candidate.entityId,
            entityLabel: candidate.entityLabel,
            body: `Facility Management ERP: Confirmed! Your verification for ${candidate.entityLabel} is complete (Ref: ${candidate.id}).`,
            deliveryStatus: 'received',
            verificationStatus: 'not_required',
            requiresVerification: false,
            attempts: 0,
            maxAttempts: 0,
            expiresAt: null,
            createdAt: now,
            deliveredAt: now,
            receivedAt: now,
            verifiedAt: now,
            verifiedMethod: 'inbound_sms_reply',
            carrierRef: generateCarrierRef(),
            carrierMode: 'sandbox-carrier',
          };
          smsMessages.unshift(ackSms);
          break;
        }
      }

      if (!matchedVerification && candidates.length > 0) {
        verificationOutcome = 'invalid_code';
        candidates[0].attempts += 1;
        if (candidates[0].attempts >= candidates[0].maxAttempts) {
          candidates[0].verificationStatus = 'failed';
        }
        pushAudit(
          candidates[0].id,
          from,
          'Inbound Verification Failed',
          `Invalid code in inbound SMS "${bodyText}"`,
          'error'
        );
      }
    }

    const { otpHash: _h, otpSalt: _s, ...safeInbound } = inboundRecord;
    return res.status(201).json({
      inbound: safeInbound,
      verificationOutcome,
      verifiedEntityId: matchedVerification?.entityId ?? null,
      verifiedMessageId: matchedVerification?.id ?? null,
    });
  };

  app.post('/api/sms/receive', handleInboundReceive);
  app.post('/api/sms/webhook', handleInboundReceive);

  app.post('/api/sms/verify', (req, res) => {
    expireStaleChallenges();
    const { messageId, phone, code, entityId, challengeToken } = req.body ?? {};
    const trimmedCode = String(code || '').trim();
    const normalized = phone ? normalizePhone(String(phone)) : '';

    if (!/^\d{6}$/.test(trimmedCode)) {
      return res.status(400).json({ verified: false, error: 'Please enter a valid 6-digit SMS verification code.' });
    }

    let target: SmsRecord | undefined;
    if (messageId) {
      target = smsMessages.find((m) => m.id === messageId);
    } else if (normalized || entityId) {
      target = smsMessages.find(
        (m) =>
          m.direction === 'outbound' &&
          m.requiresVerification &&
          (!normalized || m.to === normalized) &&
          (!entityId || m.entityId === entityId) &&
          m.verificationStatus === 'pending'
      );
    }

    if (!target && typeof challengeToken === 'string' && challengeToken) {
      const tokenData = verifyChallengeToken(challengeToken);
      if (!tokenData) {
        return res.status(400).json({ verified: false, error: 'Invalid verification token.' });
      }
      if (new Date(tokenData.expiresAt).getTime() < Date.now()) {
        return res.status(410).json({ verified: false, error: 'This SMS verification code has expired.' });
      }
      if (!verifyOtpHash(trimmedCode, tokenData.otpSalt, tokenData.otpHash)) {
        return res.status(400).json({ verified: false, error: 'Incorrect SMS verification code.' });
      }
      return res.json({
        verified: true,
        messageId: tokenData.id,
        phone: tokenData.to,
        entityType: tokenData.entityType,
        entityId: tokenData.entityId,
        entityLabel: tokenData.entityLabel,
        purpose: tokenData.purpose,
        receivedAt: tokenData.receivedAt,
        verifiedAt: new Date().toISOString(),
        verifiedMethod: 'otp_entry',
      });
    }

    if (!target) {
      return res.status(404).json({
        verified: false,
        error: 'No active pending SMS verification found. Please dispatch a fresh verification SMS.',
      });
    }

    if (target.verificationStatus === 'verified') {
      return res.status(409).json({
        verified: false,
        error: 'This SMS code has already been verified and consumed (replay protection active).',
      });
    }

    if (target.verificationStatus === 'expired') {
      return res.status(410).json({
        verified: false,
        error: 'This SMS verification code has expired. Please request a new SMS.',
      });
    }

    if (target.verificationStatus === 'failed' || target.attempts >= target.maxAttempts) {
      target.verificationStatus = 'failed';
      return res.status(429).json({
        verified: false,
        error: 'Maximum verification attempts exceeded. Please request a new SMS code.',
      });
    }

    target.attempts += 1;

    if (!target.otpHash || !target.otpSalt || !verifyOtpHash(trimmedCode, target.otpSalt, target.otpHash)) {
      const remaining = Math.max(0, target.maxAttempts - target.attempts);
      if (remaining === 0) target.verificationStatus = 'failed';
      pushAudit(
        target.id,
        target.to,
        'OTP Verification Failed',
        `Incorrect OTP entered (${target.attempts}/${target.maxAttempts} attempts).`,
        'error'
      );
      return res.status(400).json({
        verified: false,
        attemptsRemaining: remaining,
        error:
          remaining > 0
            ? `Incorrect SMS verification code. ${remaining} attempt(s) remaining.`
            : 'Maximum attempts reached. Please resend a new SMS.',
      });
    }

    const now = new Date().toISOString();
    target.verificationStatus = 'verified';
    target.verifiedAt = now;
    target.verifiedMethod = 'otp_entry';

    verifiedPhones.set(target.to, {
      phone: target.to,
      verifiedAt: now,
      messageId: target.id,
      method: 'otp_entry',
      holderName: target.recipientName,
    });
    verifiedEntities.set(target.entityId, {
      entityId: target.entityId,
      entityType: target.entityType,
      entityLabel: target.entityLabel,
      phone: target.to,
      verifiedAt: now,
      messageId: target.id,
      purpose: target.purpose,
      method: 'otp_entry',
    });

    pushAudit(
      target.id,
      target.to,
      'SMS Verified',
      `Verified ${target.entityLabel} via 6-digit OTP entry (${target.carrierRef}).`,
      'success'
    );

    return res.json({
      verified: true,
      messageId: target.id,
      phone: target.to,
      entityType: target.entityType,
      entityId: target.entityId,
      entityLabel: target.entityLabel,
      purpose: target.purpose,
      receivedAt: target.receivedAt,
      verifiedAt: target.verifiedAt,
      verifiedMethod: target.verifiedMethod,
    });
  });

  app.get('/api/sms/verifications', (_req, res) => {
    expireStaleChallenges();
    const outbound = smsMessages.filter((m) => m.direction === 'outbound');
    const inbound = smsMessages.filter((m) => m.direction === 'inbound');
    res.json({
      verifiedPhones: Array.from(verifiedPhones.values()),
      verifiedEntities: Array.from(verifiedEntities.values()),
      stats: {
        totalDispatched: outbound.length,
        totalReceived: outbound.filter((m) => m.deliveryStatus === 'received').length,
        inboundReplies: inbound.length,
        totalVerified: outbound.filter((m) => m.verificationStatus === 'verified').length,
        pendingVerification: outbound.filter((m) => m.verificationStatus === 'pending').length,
        failedOrExpired: outbound.filter(
          (m) => m.verificationStatus === 'failed' || m.verificationStatus === 'expired'
        ).length,
      },
    });
  });

  app.get('/api/sms/logs', (_req, res) => {
    expireStaleChallenges();
    res.json({ events: smsAuditEvents });
  });

  // Live SMTP Mail Server Endpoints (Nodemailer)
  app.get('/api/email/smtp-status', (_req, res) => {
    const { diagnostics } = parseEnvSmtpState();
    res.json({
      configured: isSmtpConfigured(runtimeSmtpConfig),
      source: runtimeSmtpConfig.source,
      host: runtimeSmtpConfig.host,
      port: runtimeSmtpConfig.port,
      secure: runtimeSmtpConfig.secure,
      user: runtimeSmtpConfig.user,
      hasPassword: Boolean(runtimeSmtpConfig.pass),
      fromName: runtimeSmtpConfig.fromName,
      fromEmail: runtimeSmtpConfig.fromEmail || runtimeSmtpConfig.user,
      envDiagnostics: diagnostics,
    });
  });

  app.post('/api/email/smtp-config', async (req, res) => {
    const body = req.body ?? {};
    const host = String(body.host ?? runtimeSmtpConfig.host).trim();
    const port = Number(body.port ?? runtimeSmtpConfig.port) || 587;
    const secure = buildSmtpTransportSecurityOptions(
      host,
      port,
      typeof body.secure === 'boolean' ? body.secure : port === 465
    ).secure;
    const user = String(body.user ?? runtimeSmtpConfig.user).trim();
    const incomingPass = typeof body.pass === 'string' ? body.pass : '';
    const rawPass = incomingPass ? incomingPass : runtimeSmtpConfig.pass;
    const pass = normalizeSmtpPassword(host, rawPass);
    const fromName = String(
      body.fromName ?? runtimeSmtpConfig.fromName ?? 'Vinshar Facility Management ERP'
    ).trim();
    const fromEmail = String(body.fromEmail ?? user).trim() || user;
    const shouldVerify = body.verify !== false;

    if (!isValidSmtpHost(host) || !isValidSmtpPort(port) || !user || !pass) {
      const clues = [
        !isValidSmtpHost(host) ? `SMTP Host "${host || 'empty'}" is missing or invalid.` : `SMTP Host: ${host}`,
        !isValidSmtpPort(port) ? `SMTP Port (${port}) must be between 1 and 65535.` : `SMTP Port: ${port}`,
        !user ? 'SMTP Username / Email is empty.' : `SMTP Username: ${user}`,
        !pass ? 'SMTP Password / App Password is missing.' : 'SMTP Password provided.',
      ];
      const actionHint =
        'Fill in a valid SMTP Host (e.g. smtp.gmail.com), Port (587 STARTTLS or 465 SSL/TLS), Username/Email, and Password / 16-char Google App Password.';
      const logged = pushSmtpActivityLog({
        eventType: 'SMTP Verify',
        to: user || host || 'Unconfigured',
        from: fromEmail || user || 'Unconfigured',
        subject: `SMTP Configuration Preflight (${host || 'missing'}:${port})`,
        status: 'Failed',
        smtpHost: host || undefined,
        smtpPort: port,
        errorMessage:
          'Valid SMTP Host, Port (1–65535), SMTP Username/Email, and SMTP Password / App Password are required.',
        smtpErrorCode: 'INVALID_SMTP_CONFIG',
        smtpCommand: 'PREFLIGHT',
        smtpRawResponse: clues.join(' | '),
        actionHint,
        debuggingClues: clues,
        handshakeTrace: ['[PREFLIGHT] Validating SMTP configuration fields...', `[ERR] ${clues.join(' ')}`],
        attachmentCount: 0,
      });
      return res.status(400).json({
        error: 'INVALID_SMTP_CONFIG',
        message: 'Valid SMTP Host, Port (1–65535), SMTP Username/Email, and SMTP Password / App Password are required.',
        smtpErrorCode: 'INVALID_SMTP_CONFIG',
        smtpCommand: 'PREFLIGHT',
        actionHint,
        debuggingClues: clues,
        logEntryId: logged.id,
      });
    }

    const candidate: SmtpRuntimeConfig = {
      host,
      port,
      secure,
      user,
      pass,
      fromName: fromName || 'Vinshar Facility Management ERP',
      fromEmail,
      source: 'runtime',
    };

    let verifyLogId: string | undefined;
    if (shouldVerify) {
      const checkResult = await checkSmtpConnection({
        host: candidate.host,
        port: candidate.port,
        secure: candidate.secure,
        user: candidate.user,
        pass: candidate.pass,
      });

      if (!checkResult.ok) {
        const logged = pushSmtpActivityLog({
          eventType: 'SMTP Verify',
          to: candidate.user,
          from: candidate.fromEmail,
          subject: `SMTP Handshake Verification (${candidate.host}:${candidate.port})`,
          status: 'Failed',
          smtpHost: candidate.host,
          smtpPort: candidate.port,
          errorMessage: checkResult.message,
          smtpErrorCode: checkResult.smtpErrorCode,
          smtpResponseCode: checkResult.smtpResponseCode,
          smtpCommand: checkResult.smtpCommand,
          smtpRawResponse: checkResult.smtpRawResponse,
          actionHint: checkResult.actionHint,
          debuggingClues: checkResult.debuggingClues,
          handshakeTrace: checkResult.handshakeTrace,
          attachmentCount: 0,
        });
        return res.status(422).json({
          error: 'SMTP_VERIFY_FAILED',
          message: checkResult.message,
          smtpErrorCode: checkResult.smtpErrorCode,
          smtpResponseCode: checkResult.smtpResponseCode,
          smtpCommand: checkResult.smtpCommand,
          smtpRawResponse: checkResult.smtpRawResponse,
          actionHint: checkResult.actionHint,
          debuggingClues: checkResult.debuggingClues,
          logEntryId: logged.id,
        });
      }

      const loggedSuccess = pushSmtpActivityLog({
        eventType: 'SMTP Verify',
        to: candidate.user,
        from: candidate.fromEmail,
        subject: `SMTP Handshake Verification (${candidate.host}:${candidate.port})`,
        status: 'Sent',
        smtpHost: candidate.host,
        smtpPort: candidate.port,
        response: `250 Verified (${checkResult.latencyMs} ms)`,
        debuggingClues: checkResult.debuggingClues,
        handshakeTrace: checkResult.handshakeTrace,
        attachmentCount: 0,
      });
      verifyLogId = loggedSuccess.id;
    }

    runtimeSmtpConfig = candidate;
    persistRuntimeSmtpConfig(runtimeSmtpConfig);
    const { diagnostics } = parseEnvSmtpState();
    return res.json({
      ok: true,
      configured: true,
      verified: shouldVerify,
      logEntryId: verifyLogId,
      source: runtimeSmtpConfig.source,
      host: runtimeSmtpConfig.host,
      port: runtimeSmtpConfig.port,
      secure: runtimeSmtpConfig.secure,
      user: runtimeSmtpConfig.user,
      hasPassword: true,
      fromName: runtimeSmtpConfig.fromName,
      fromEmail: runtimeSmtpConfig.fromEmail,
      envDiagnostics: diagnostics,
    });
  });

  app.post('/api/email/smtp-verify', async (req, res) => {
    const body = req.body ?? {};
    const host = String(body.host ?? runtimeSmtpConfig.host).trim();
    const port = Number(body.port ?? runtimeSmtpConfig.port) || 587;
    const secure = buildSmtpTransportSecurityOptions(
      host,
      port,
      typeof body.secure === 'boolean' ? body.secure : port === 465
    ).secure;
    const user = String(body.user ?? runtimeSmtpConfig.user).trim();
    const incomingPass = typeof body.pass === 'string' ? body.pass : '';
    const pass = incomingPass ? incomingPass : runtimeSmtpConfig.pass;

    const result = await checkSmtpConnection({
      host,
      port,
      secure,
      user,
      pass,
    });

    const logged = pushSmtpActivityLog({
      eventType: 'Connection Test',
      to: user || host || 'Unconfigured',
      from: user || 'SMTP Verify',
      subject: `Nodemailer verify() (${host || 'missing'}:${port})`,
      status: result.ok ? 'Sent' : 'Failed',
      smtpHost: host || undefined,
      smtpPort: port,
      response: result.ok ? `250 Handshake OK (${result.latencyMs} ms)` : undefined,
      errorMessage: result.ok ? undefined : result.message,
      smtpErrorCode: result.smtpErrorCode,
      smtpResponseCode: result.smtpResponseCode,
      smtpCommand: result.smtpCommand,
      smtpRawResponse: result.smtpRawResponse,
      actionHint: result.actionHint,
      debuggingClues: result.debuggingClues,
      handshakeTrace: result.handshakeTrace,
      attachmentCount: 0,
    });

    return res.status(result.ok ? 200 : 422).json({
      ...result,
      logEntryId: logged.id,
    });
  });

  const handleSmtpPingRoute = async (req: express.Request, res: express.Response) => {
    const body = req.body ?? {};
    const host = String(body.host ?? runtimeSmtpConfig.host).trim();
    const port = Number(body.port ?? runtimeSmtpConfig.port) || 587;
    const secure =
      typeof body.secure === 'boolean' ? body.secure : port === 465;
    const user = String(body.user ?? runtimeSmtpConfig.user).trim();
    const incomingPass = typeof body.pass === 'string' ? body.pass : '';
    const pass = incomingPass ? incomingPass : runtimeSmtpConfig.pass;

    const result = await pingSmtpServer({
      host,
      port,
      secure,
      user,
      pass,
    });
    return res.status(result.httpStatus).json(result.body);
  };

  app.post('/api/email/smtp-ping', handleSmtpPingRoute);
  app.post('/api/email/smtp-test', handleSmtpPingRoute);

  app.post('/api/email/smtp-diagnose', async (req, res) => {
    const body = req.body ?? {};
    const host = String(body.host ?? runtimeSmtpConfig.host).trim();
    const port = Number(body.port ?? runtimeSmtpConfig.port) || 587;
    const secure =
      typeof body.secure === 'boolean' ? body.secure : port === 465;
    const user = String(body.user ?? runtimeSmtpConfig.user).trim();
    const incomingPass = typeof body.pass === 'string' ? body.pass : '';
    const pass = incomingPass ? incomingPass : runtimeSmtpConfig.pass;

    const report = await runSmtpSocketDiagnostics({
      host,
      port,
      secure,
      user,
      pass,
    });
    return res.status(report.ok ? 200 : 422).json(report);
  });

  app.post('/api/email/smtp-reset', (_req, res) => {
    clearPersistedSmtpConfig();
    const { config, diagnostics } = parseEnvSmtpState();
    runtimeSmtpConfig = config;
    res.json({
      ok: true,
      configured: isSmtpConfigured(runtimeSmtpConfig),
      source: runtimeSmtpConfig.source,
      host: runtimeSmtpConfig.host,
      port: runtimeSmtpConfig.port,
      secure: runtimeSmtpConfig.secure,
      user: runtimeSmtpConfig.user,
      hasPassword: Boolean(runtimeSmtpConfig.pass),
      fromName: runtimeSmtpConfig.fromName,
      fromEmail: runtimeSmtpConfig.fromEmail || runtimeSmtpConfig.user,
      envDiagnostics: diagnostics,
    });
  });

  app.get('/api/email/smtp-events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    smtpEventClients.add(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        smtpEventClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      smtpEventClients.delete(res);
    });
  });

  app.get('/api/email/smtp-logs', (_req, res) => {
    res.json({
      logs: smtpActivityLog.slice(0, 20),
      metrics: buildSmtpMetrics30Days(smtpActivityLog),
    });
  });

  app.post('/api/email/send', async (req, res) => {
    const body = req.body ?? {};
    const to = String(body.to || '').trim();
    const cc = String(body.cc || '').trim();
    const subject = String(body.subject || '').trim();
    const text = String(body.body || '').trim();
    const replyTo = String(body.replyTo || '').trim();
    const rawAttachments: unknown[] = Array.isArray(body.attachments) ? body.attachments : [];

    if (!isSmtpConfigured(runtimeSmtpConfig)) {
      const diag = classifySmtpErrorToPlainEnglish({
        host: runtimeSmtpConfig.host,
        port: runtimeSmtpConfig.port,
        secure: runtimeSmtpConfig.secure,
        errorCode: 'SMTP_NOT_CONFIGURED',
      });
      const logged = pushSmtpActivityLog({
        eventType: 'Send Email',
        to: to || 'Pending Recipient',
        cc: cc || undefined,
        from: runtimeSmtpConfig.fromEmail || runtimeSmtpConfig.user || 'Unconfigured',
        subject: subject || 'Outbound Email Dispatch',
        status: 'Failed',
        smtpHost: runtimeSmtpConfig.host || undefined,
        smtpPort: runtimeSmtpConfig.port || undefined,
        errorMessage: diag.plainEnglishExplanation,
        smtpErrorCode: 'SMTP_NOT_CONFIGURED',
        smtpCommand: 'PREFLIGHT',
        smtpRawResponse: 'Missing valid SMTP_HOST, SMTP_USER, or SMTP_PASS credentials.',
        actionHint: diag.actionHint,
        debuggingClues: diag.debuggingClues,
        failureCategory: diag.failureCategory,
        plainEnglishTitle: diag.plainEnglishTitle,
        plainEnglishExplanation: diag.plainEnglishExplanation,
        attachmentCount: rawAttachments.length,
      });
      return res.status(400).json({
        error: 'SMTP_NOT_CONFIGURED',
        message: diag.plainEnglishExplanation,
        smtpErrorCode: 'SMTP_NOT_CONFIGURED',
        smtpCommand: 'PREFLIGHT',
        smtpHost: runtimeSmtpConfig.host,
        smtpPort: runtimeSmtpConfig.port,
        failureCategory: diag.failureCategory,
        plainEnglishTitle: diag.plainEnglishTitle,
        plainEnglishExplanation: diag.plainEnglishExplanation,
        actionHint: diag.actionHint,
        debuggingClues: diag.debuggingClues,
        logEntryId: logged.id,
      });
    }

    if (!to || !subject || !text) {
      return res.status(400).json({
        error: 'INVALID_EMAIL_PAYLOAD',
        message: 'Recipient email (To), Subject, and Message Body are required.',
      });
    }

    const attachments = rawAttachments
      .filter(
        (att): att is { filename: string; contentBase64: string; contentType?: string } =>
          Boolean(
            att &&
              typeof att === 'object' &&
              typeof (att as { filename?: unknown }).filename === 'string' &&
              typeof (att as { contentBase64?: unknown }).contentBase64 === 'string'
          )
      )
      .map((att) => ({
        filename: att.filename.replace(/[\r\n]/g, ''),
        content: Buffer.from(att.contentBase64, 'base64'),
        contentType: att.contentType || 'application/pdf',
      }));

    const senderEmail = runtimeSmtpConfig.fromEmail || runtimeSmtpConfig.user;
    const fromHeader = runtimeSmtpConfig.fromName
      ? `"${runtimeSmtpConfig.fromName.replace(/"/g, '')}" <${senderEmail}>`
      : senderEmail;

    const { transporter, getTrace } = createTraceableSmtpTransporter(runtimeSmtpConfig);
    try {
      const info = await transporter.sendMail({
        from: fromHeader,
        to,
        ...(cc ? { cc } : {}),
        ...(replyTo ? { replyTo } : {}),
        subject,
        text,
        attachments,
      });

      pushSmtpActivityLog({
        eventType: 'Send Email',
        to,
        cc: cc || undefined,
        from: senderEmail,
        subject,
        status: 'Sent',
        messageId: info.messageId,
        smtpHost: runtimeSmtpConfig.host,
        smtpPort: runtimeSmtpConfig.port,
        response: info.response,
        handshakeTrace: getTrace(),
        attachmentCount: attachments.length,
      });

      return res.json({
        ok: true,
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
        fromEmail: senderEmail,
        smtpHost: runtimeSmtpConfig.host,
      });
    } catch (err) {
      const failure = extractSmtpFailureDetails(
        err,
        runtimeSmtpConfig.host,
        runtimeSmtpConfig.port,
        getTrace()
      );
      const diag = classifySmtpErrorToPlainEnglish({
        host: runtimeSmtpConfig.host,
        port: runtimeSmtpConfig.port,
        secure: runtimeSmtpConfig.secure,
        errorCode: failure.smtpErrorCode,
        responseCode: failure.smtpResponseCode,
        command: failure.smtpCommand,
        rawResponse: failure.smtpRawResponse,
        fallbackMessage: failure.message,
      });
      const logged = pushSmtpActivityLog({
        eventType: 'Send Email',
        to,
        cc: cc || undefined,
        from: senderEmail,
        subject,
        status: 'Failed',
        smtpHost: runtimeSmtpConfig.host,
        smtpPort: runtimeSmtpConfig.port,
        errorMessage: diag.plainEnglishExplanation,
        smtpErrorCode: failure.smtpErrorCode,
        smtpResponseCode: failure.smtpResponseCode,
        smtpCommand: failure.smtpCommand,
        smtpRawResponse: failure.smtpRawResponse,
        actionHint: diag.actionHint,
        debuggingClues: diag.debuggingClues,
        failureCategory: diag.failureCategory,
        plainEnglishTitle: diag.plainEnglishTitle,
        plainEnglishExplanation: diag.plainEnglishExplanation,
        suggestedFix: diag.suggestedFix,
        handshakeTrace: failure.handshakeTrace,
        attachmentCount: attachments.length,
      });
      return res.status(422).json({
        error: 'SMTP_SEND_FAILED',
        message: diag.plainEnglishExplanation,
        smtpHost: runtimeSmtpConfig.host,
        smtpPort: runtimeSmtpConfig.port,
        smtpErrorCode: failure.smtpErrorCode,
        smtpResponseCode: failure.smtpResponseCode,
        smtpCommand: failure.smtpCommand,
        smtpRawResponse: failure.smtpRawResponse,
        failureCategory: diag.failureCategory,
        plainEnglishTitle: diag.plainEnglishTitle,
        plainEnglishExplanation: diag.plainEnglishExplanation,
        actionHint: diag.actionHint,
        debuggingClues: diag.debuggingClues,
        suggestedFix: diag.suggestedFix,
        logEntryId: logged.id,
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Facility Management ERP listening on http://0.0.0.0:${port}`);
  });
}

startServer();
