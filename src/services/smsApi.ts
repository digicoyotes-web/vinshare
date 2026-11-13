import type {
  SmsAuditEventDto,
  SmsMessageDto,
  SmsVerificationStats,
} from '../types/erp';

export interface SendSmsPayload {
  phone: string;
  recipientName: string;
  purpose: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  requiresVerification?: boolean;
  customMessage?: string;
  ttlMinutes?: number;
}

export interface SendSmsResponse {
  id: string;
  to: string;
  recipientName: string;
  purpose: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  deliveryStatus: string;
  verificationStatus: string;
  expiresAt: string | null;
  createdAt: string;
  receivedAt: string | null;
  carrierRef: string;
  carrierMode: string;
  challengeToken?: string;
}

export interface VerifySmsResponse {
  verified: boolean;
  messageId?: string;
  phone?: string;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  purpose?: string;
  receivedAt?: string;
  verifiedAt?: string;
  verifiedMethod?: 'otp_entry' | 'inbound_sms_reply' | 'webhook';
  attemptsRemaining?: number;
  error?: string;
}

export async function sendSms(payload: SendSmsPayload): Promise<SendSmsResponse> {
  const res = await fetch('/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to dispatch SMS');
  }
  return data;
}

export async function fetchSmsInbox(phone?: string): Promise<SmsMessageDto[]> {
  const query = phone ? `?phone=${encodeURIComponent(phone)}` : '';
  const res = await fetch(`/api/sms/inbox${query}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch SMS inbox');
  }
  return data.messages || [];
}

export async function receiveInboundSms(payload: {
  from: string;
  to?: string;
  body: string;
}): Promise<{
  inbound: SmsMessageDto;
  verificationOutcome: 'verified' | 'invalid_code' | 'no_pending';
  verifiedEntityId: string | null;
  verifiedMessageId: string | null;
}> {
  const res = await fetch('/api/sms/receive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to process inbound SMS');
  }
  return data;
}

export async function verifySmsOtp(payload: {
  messageId?: string;
  phone?: string;
  entityId?: string;
  code: string;
  challengeToken?: string;
}): Promise<VerifySmsResponse> {
  const res = await fetch('/api/sms/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    return {
      verified: false,
      attemptsRemaining: data.attemptsRemaining,
      error: data.error || 'SMS verification failed',
    };
  }
  return data;
}

export async function fetchSmsVerifications(): Promise<{
  verifiedPhones: Array<{
    phone: string;
    verifiedAt: string;
    messageId: string;
    method: string;
    holderName: string;
  }>;
  verifiedEntities: Array<{
    entityId: string;
    entityType: string;
    entityLabel: string;
    phone: string;
    verifiedAt: string;
    messageId: string;
    purpose: string;
    method: string;
  }>;
  stats: SmsVerificationStats;
}> {
  const res = await fetch('/api/sms/verifications');
  const data = await res.json();
  if (!res.ok) {
    throw new Error('Failed to fetch verification ledger');
  }
  return data;
}

export async function fetchSmsLogs(): Promise<SmsAuditEventDto[]> {
  const res = await fetch('/api/sms/logs');
  const data = await res.json();
  if (!res.ok) {
    throw new Error('Failed to fetch SMS audit logs');
  }
  return data.events || [];
}
