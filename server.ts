import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';

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

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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
