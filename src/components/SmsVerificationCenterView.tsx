import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Inbox,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import {
  fetchSmsInbox,
  fetchSmsLogs,
  receiveInboundSms,
  sendSms,
  verifySmsOtp,
} from '../services/smsApi';
import type {
  ClientRecord,
  LoiRecord,
  SmsAuditEventDto,
  SmsMessageDto,
  SmsVerificationStats,
} from '../types/erp';
import { formatDateTime } from '../utils/formatters';

interface SmsVerificationCenterViewProps {
  clients: ClientRecord[];
  lois: LoiRecord[];
  stats: SmsVerificationStats;
  onRefreshLedger: () => void;
  onEntityVerified: (entityId: string, phone: string) => void;
  onOpenDrawer: (phone?: string) => void;
}

export const SmsVerificationCenterView: React.FC<SmsVerificationCenterViewProps> = ({
  clients,
  lois,
  stats,
  onRefreshLedger,
  onEntityVerified,
  onOpenDrawer,
}) => {
  const [messages, setMessages] = useState<SmsMessageDto[]>([]);
  const [auditEvents, setAuditEvents] = useState<SmsAuditEventDto[]>([]);
  const [loading, setLoading] = useState(false);

  // Dispatch form
  const [targetPhone, setTargetPhone] = useState('+919845077120');
  const [recipientName, setRecipientName] = useState('Ananya Nair (Apex Business Park)');
  const [purpose, setPurpose] = useState('client_mobile_verification');
  const [entityId, setEntityId] = useState('CLI-002');
  const [entityLabel, setEntityLabel] = useState('Apex Business Park LLP');
  const [customMessage, setCustomMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Manual OTP verification form
  const [verifyMsgId, setVerifyMsgId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Inbound SMS simulator
  const [inboundFrom, setInboundFrom] = useState('+919845077120');
  const [inboundText, setInboundText] = useState('');
  const [receivingInbound, setReceivingInbound] = useState(false);

  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [inboxList, logs] = await Promise.all([fetchSmsInbox(), fetchSmsLogs()]);
      setMessages(inboxList);
      setAuditEvents(logs);
      const firstPending = inboxList.find(
        (m) => m.direction === 'outbound' && m.verificationStatus === 'pending'
      );
      if (firstPending && !verifyMsgId) {
        setVerifyMsgId(firstPending.id);
      }
      onRefreshLedger();
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load SMS gateway' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSelectPreset = (presetValue: string) => {
    if (presetValue.startsWith('CLI:')) {
      const id = presetValue.replace('CLI:', '');
      const client = clients.find((c) => c.id === id);
      if (client) {
        setTargetPhone(client.mobile);
        setInboundFrom(client.mobile);
        setRecipientName(`${client.contactPerson} (${client.companyName})`);
        setPurpose('client_mobile_verification');
        setEntityId(client.id);
        setEntityLabel(client.companyName);
      }
    } else if (presetValue.startsWith('LOI:')) {
      const id = presetValue.replace('LOI:', '');
      const loi = lois.find((l) => l.id === id);
      if (loi) {
        setTargetPhone(loi.clientContactMobile);
        setInboundFrom(loi.clientContactMobile);
        setRecipientName(loi.clientName);
        setPurpose('loi_acceptance');
        setEntityId(loi.id);
        setEntityLabel(`${loi.id} · ${loi.clientName}`);
      }
    }
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setBanner(null);
    try {
      const res = await sendSms({
        phone: targetPhone,
        recipientName,
        purpose,
        entityType: purpose === 'loi_acceptance' ? 'loi' : 'client',
        entityId,
        entityLabel,
        requiresVerification: true,
        customMessage,
      });
      setVerifyMsgId(res.id);
      setInboundFrom(res.to);
      setBanner({
        type: 'success',
        text: `SMS dispatched (${res.carrierRef}) and received on ${res.to}. Check the Received SMS Inbox panel to read the 6-digit code and verify it.`,
      });
      await loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'SMS send failed' });
    } finally {
      setSending(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setBanner(null);
    try {
      const res = await verifySmsOtp({
        messageId: verifyMsgId || undefined,
        code: verifyCode,
      });
      if (!res.verified) {
        setBanner({ type: 'error', text: res.error || 'SMS verification failed' });
      } else {
        setBanner({
          type: 'success',
          text: `SMS Verified! ${res.entityLabel} (${res.phone}) confirmed at ${formatDateTime(res.verifiedAt)}.`,
        });
        setVerifyCode('');
        if (res.entityId && res.phone) {
          onEntityVerified(res.entityId, res.phone);
        }
      }
      await loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Verification error' });
    } finally {
      setVerifying(false);
    }
  };

  const handleInboundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReceivingInbound(true);
    setBanner(null);
    try {
      const res = await receiveInboundSms({
        from: inboundFrom,
        to: 'FM-ERP',
        body: inboundText,
      });
      if (res.verificationOutcome === 'verified') {
        setBanner({
          type: 'success',
          text: `Inbound SMS from ${inboundFrom} received and verified (${res.verifiedEntityId}).`,
        });
        if (res.verifiedEntityId) {
          onEntityVerified(res.verifiedEntityId, inboundFrom);
        }
      } else if (res.verificationOutcome === 'invalid_code') {
        setBanner({
          type: 'error',
          text: 'Inbound SMS received, but the 6-digit code did not match an active pending SMS challenge.',
        });
      } else {
        setBanner({
          type: 'success',
          text: `Inbound SMS received from ${inboundFrom} and recorded in the gateway log.`,
        });
      }
      setInboundText('');
      await loadAll();
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Inbound SMS error' });
    } finally {
      setReceivingInbound(false);
    }
  };

  const pendingChallenges = messages.filter(
    (m) => m.direction === 'outbound' && m.verificationStatus === 'pending'
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#14263D]">SMS Gateway, Reception & Verification Center</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Every transactional SMS is dispatched with cryptographic OTP hashing, confirmed received on handset, and verified via OTP entry or two-way inbound SMS reply.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenDrawer()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-[#14263D] hover:bg-slate-50"
          >
            <Smartphone className="h-4 w-4 text-[#2463EB]" />
            Open Handset Drawer
          </button>
          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#14263D] px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync Gateway
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">SMS Dispatched</div>
          <div className="mt-1 text-2xl font-bold text-[#14263D] tabular-nums">{stats.totalDispatched}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Confirmed Received</div>
          <div className="mt-1 text-2xl font-bold text-[#2463EB] tabular-nums">{stats.totalReceived}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">SMS Verified</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">{stats.totalVerified}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Pending Verification</div>
          <div className="mt-1 text-2xl font-bold text-amber-700 tabular-nums">{stats.pendingVerification}</div>
        </div>
      </div>

      {banner && (
        <div
          className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium ${
            banner.type === 'success'
              ? 'border-emerald-200 bg-[#E8F5EE] text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {banner.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-700" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-700" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {/* 3-Column Operational Console: Dispatch | Verify | Live Received Handset */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 1. Dispatch SMS */}
        <form
          onSubmit={handleDispatch}
          className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 space-y-3"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Send className="h-4 w-4 text-[#2463EB]" />
            <h2 className="text-sm font-semibold text-[#14263D]">1. Dispatch Verification SMS</h2>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Quick Link ERP Record
            </label>
            <select
              onChange={(e) => handleSelectPreset(e.target.value)}
              defaultValue=""
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#2463EB] focus:outline-none"
            >
              <option value="" disabled>
                Choose Client or LOI to auto-fill...
              </option>
              {clients.map((c) => (
                <option key={c.id} value={`CLI:${c.id}`}>
                  Client: {c.companyName} ({c.mobile})
                </option>
              ))}
              {lois.map((l) => (
                <option key={l.id} value={`LOI:${l.id}`}>
                  LOI: {l.id} · {l.clientName} ({l.clientContactMobile})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Mobile Number</label>
              <input
                type="text"
                value={targetPhone}
                onChange={(e) => setTargetPhone(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-[#2463EB] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Purpose</label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-[#2463EB] focus:outline-none"
              >
                <option value="client_mobile_verification">Client Mobile Verify</option>
                <option value="loi_acceptance">LOI Acceptance</option>
                <option value="agreement_signature">Agreement Execution</option>
                <option value="proposal_approval">Proposal Approval</option>
                <option value="invoice_approval">Invoice Approval</option>
                <option value="login_mfa">User Login MFA</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Recipient Name</label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#2463EB] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Custom SMS Note (Optional)
            </label>
            <input
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Leave blank for standard DLT template"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#2463EB] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-lg bg-[#2463EB] px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? 'Dispatching SMS...' : 'Send Verification SMS'}
          </button>
        </form>

        {/* 2. Verify Received SMS */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-[#14263D]">2. Verify Received SMS Code</h2>
          </div>

          <form onSubmit={handleVerifySubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Active Pending SMS Challenge
              </label>
              <select
                value={verifyMsgId}
                onChange={(e) => setVerifyMsgId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#2463EB] focus:outline-none"
              >
                {pendingChallenges.length === 0 ? (
                  <option value="">No pending SMS challenges</option>
                ) : (
                  pendingChallenges.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.to} — {m.entityLabel} ({m.id})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                6-Digit OTP from Received SMS
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6 digits"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-base font-semibold tracking-[0.35em] text-[#14263D] focus:border-[#2463EB] focus:outline-none tabular-nums"
              />
            </div>

            <button
              type="submit"
              disabled={verifying || verifyCode.length !== 6 || pendingChallenges.length === 0}
              className="w-full rounded-lg bg-[#14263D] px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {verifying ? 'Verifying...' : 'Verify SMS OTP'}
            </button>
          </form>

          <form onSubmit={handleInboundSubmit} className="pt-3 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#14263D]">
              <MessageSquareText className="h-4 w-4 text-[#2463EB]" />
              Two-Way Inbound SMS Verification
            </div>
            <p className="text-[11px] text-slate-500">
              Simulate receiving an inbound SMS reply from the recipient handset (e.g. <code className="font-mono">VERIFY 615839</code>).
            </p>
            <div className="grid grid-cols-5 gap-2">
              <input
                type="text"
                value={inboundFrom}
                onChange={(e) => setInboundFrom(e.target.value)}
                placeholder="+91..."
                className="col-span-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
              />
              <input
                type="text"
                value={inboundText}
                onChange={(e) => setInboundText(e.target.value)}
                placeholder="VERIFY 615839"
                className="col-span-3 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={receivingInbound || !inboundText.trim()}
              className="w-full rounded-lg border border-slate-300 bg-[#F3F6FA] px-3 py-2 text-xs font-semibold text-[#14263D] hover:bg-slate-100 disabled:opacity-50"
            >
              {receivingInbound ? 'Processing Inbound...' : 'Receive Inbound SMS & Verify'}
            </button>
          </form>
        </div>

        {/* 3. Live Received SMS Inbox Feed */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 flex flex-col max-h-[470px]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-[#2463EB]" />
              <h2 className="text-sm font-semibold text-[#14263D]">Received SMS Inbox</h2>
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums">{messages.length} msgs</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {messages.map((m) => (
              <div key={m.id} className="rounded-lg border border-slate-200 bg-[#F3F6FA]/70 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono font-semibold text-[#14263D]">
                    {m.direction === 'inbound' ? `IN ← ${m.from}` : `OUT → ${m.to}`}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${
                      m.verificationStatus === 'verified'
                        ? 'bg-[#E8F5EE] text-emerald-800'
                        : m.verificationStatus === 'pending'
                        ? 'bg-[#FFF2E5] text-amber-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {m.verificationStatus === 'verified'
                      ? 'Verified'
                      : m.verificationStatus === 'pending'
                      ? 'Received · Pending'
                      : 'Received'}
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{m.body}</p>
                <div className="flex items-center justify-between text-[10px] text-slate-500 tabular-nums">
                  <span>{m.carrierRef}</span>
                  <span>{formatDateTime(m.receivedAt || m.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Full SMS Audit Trail */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-[#14263D]">SMS Reception & Verification Audit Trail</h2>
          <span className="text-xs text-slate-500 tabular-nums">{auditEvents.length} events</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F3F6FA] text-slate-600">
              <tr>
                <th className="px-4 py-2.5 font-medium">Timestamp</th>
                <th className="px-4 py-2.5 font-medium">Message ID</th>
                <th className="px-4 py-2.5 font-medium">Mobile</th>
                <th className="px-4 py-2.5 font-medium">Event</th>
                <th className="px-4 py-2.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditEvents.map((ev) => (
                <tr key={ev.id} className="hover:bg-[#F3F6FA]/50">
                  <td className="px-4 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">
                    {formatDateTime(ev.timestamp)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[#14263D] whitespace-nowrap">{ev.messageId}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-700 whitespace-nowrap">{ev.phone}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                        ev.status === 'success'
                          ? 'bg-[#E8F5EE] text-emerald-800'
                          : ev.status === 'error'
                          ? 'bg-rose-50 text-rose-700'
                          : ev.status === 'warning'
                          ? 'bg-[#FFF2E5] text-amber-800'
                          : 'bg-blue-50 text-[#2463EB]'
                      }`}
                    >
                      {ev.status === 'success' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      {ev.event}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{ev.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
