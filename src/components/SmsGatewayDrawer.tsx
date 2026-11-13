import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Inbox,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { fetchSmsInbox, receiveInboundSms } from '../services/smsApi';
import type { SmsMessageDto } from '../types/erp';
import { formatDateTime } from '../utils/formatters';

interface SmsGatewayDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filterPhone?: string;
  onVerificationComplete?: (payload: { entityId: string | null; phone: string }) => void;
}

export const SmsGatewayDrawer: React.FC<SmsGatewayDrawerProps> = ({
  isOpen,
  onClose,
  filterPhone,
  onVerificationComplete,
}) => {
  const [messages, setMessages] = useState<SmsMessageDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState<string>(filterPhone || '');
  const [replyFrom, setReplyFrom] = useState<string>(filterPhone || '+919845077120');
  const [replyBody, setReplyBody] = useState<string>('');
  const [sendingReply, setSendingReply] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadInbox = async () => {
    setLoading(true);
    try {
      const list = await fetchSmsInbox(selectedPhone || undefined);
      setMessages(list);
      if (!selectedPhone && list.length > 0 && !replyFrom) {
        setReplyFrom(list[0].to);
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Unable to load SMS inbox' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (filterPhone !== undefined) {
      setSelectedPhone(filterPhone);
      if (filterPhone) setReplyFrom(filterPhone);
    }
  }, [filterPhone]);

  useEffect(() => {
    if (isOpen) {
      loadInbox();
    }
  }, [isOpen, selectedPhone]);

  if (!isOpen) return null;

  const extractOtp = (body: string): string | null => {
    const match = body.match(/\b(\d{6})\b/);
    return match ? match[1] : null;
  };

  const handleCopyCode = (id: string, code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleQuickInboundVerify = async (msg: SmsMessageDto, code: string) => {
    setSendingReply(true);
    setFeedback(null);
    try {
      const result = await receiveInboundSms({
        from: msg.to,
        to: 'FM-ERP',
        body: `VERIFY ${code}`,
      });
      if (result.verificationOutcome === 'verified') {
        setFeedback({
          type: 'success',
          text: `Inbound SMS received from ${msg.to} and verified for ${msg.entityLabel}.`,
        });
        onVerificationComplete?.({ entityId: result.verifiedEntityId, phone: msg.to });
      } else {
        setFeedback({
          type: 'error',
          text: 'Inbound SMS logged, but no active matching pending challenge was found.',
        });
      }
      await loadInbox();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Inbound SMS failed' });
    } finally {
      setSendingReply(false);
    }
  };

  const handleManualInboundSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyFrom.trim() || !replyBody.trim()) return;
    setSendingReply(true);
    setFeedback(null);
    try {
      const result = await receiveInboundSms({
        from: replyFrom,
        to: 'FM-ERP',
        body: replyBody,
      });
      if (result.verificationOutcome === 'verified') {
        setFeedback({
          type: 'success',
          text: `Inbound SMS received and verified (${result.verifiedEntityId || replyFrom}).`,
        });
        onVerificationComplete?.({ entityId: result.verifiedEntityId, phone: replyFrom });
      } else if (result.verificationOutcome === 'invalid_code') {
        setFeedback({
          type: 'error',
          text: 'Inbound SMS received, but the verification code did not match an active OTP.',
        });
      } else {
        setFeedback({
          type: 'success',
          text: 'Inbound SMS received and logged in the ERP gateway.',
        });
      }
      setReplyBody('');
      await loadInbox();
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to receive inbound SMS' });
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl border-l border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between bg-[#14263D] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
              <Smartphone className="h-5 w-5 text-blue-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-tight">Live SMS Receiver & Handset</h2>
              <p className="text-xs text-slate-300">Carrier delivery & two-way SMS verification</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close SMS receiver"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-[#F3F6FA] px-4 py-2.5">
          <input
            type="text"
            value={selectedPhone}
            onChange={(e) => setSelectedPhone(e.target.value)}
            placeholder="Filter by mobile number (e.g. +9198...)"
            className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#2463EB] focus:outline-none"
          />
          {selectedPhone && (
            <button
              type="button"
              onClick={() => setSelectedPhone('')}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              All
            </button>
          )}
          <button
            type="button"
            onClick={loadInbox}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {feedback && (
          <div
            className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-[#E8F5EE] text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Inbox className="h-9 w-9 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">No SMS messages received yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Dispatch a verification SMS from Clients, LOI, Agreements, or the SMS Gateway to inspect live reception.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const otp = msg.direction === 'outbound' ? extractOtp(msg.body) : null;
              const isInbound = msg.direction === 'inbound';
              return (
                <div
                  key={msg.id}
                  className={`rounded-lg border p-3.5 ${
                    isInbound
                      ? 'border-blue-200 bg-blue-50/50 ml-4'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="text-xs">
                      <span className="font-semibold text-[#14263D]">
                        {isInbound ? `From: ${msg.from}` : `To: ${msg.to}`}
                      </span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="text-slate-500">{msg.carrierRef}</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        msg.verificationStatus === 'verified'
                          ? 'bg-[#E8F5EE] text-emerald-800'
                          : msg.verificationStatus === 'pending'
                          ? 'bg-[#FFF2E5] text-amber-800'
                          : msg.verificationStatus === 'expired' || msg.verificationStatus === 'failed'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {msg.verificationStatus === 'verified' && <CheckCircle2 className="h-3 w-3" />}
                      {msg.verificationStatus === 'verified'
                        ? 'Verified'
                        : msg.verificationStatus === 'pending'
                        ? 'Received · Awaiting Verify'
                        : msg.verificationStatus === 'expired'
                        ? 'Expired'
                        : msg.verificationStatus === 'failed'
                        ? 'Failed'
                        : isInbound
                        ? 'Inbound Received'
                        : 'Received'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed">{msg.body}</p>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums">
                    <span>
                      {msg.entityLabel} · Received {formatDateTime(msg.receivedAt || msg.createdAt)}
                    </span>
                  </div>

                  {otp && (
                    <div className="mt-2.5 flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-[#F3F6FA] px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-slate-500">Received OTP</span>
                        <span className="font-mono text-sm font-semibold tracking-wider text-[#14263D] tabular-nums">
                          {otp}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyCode(msg.id, otp)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedId === msg.id ? 'Copied' : 'Copy'}
                        </button>
                        {msg.verificationStatus === 'pending' && (
                          <button
                            type="button"
                            disabled={sendingReply}
                            onClick={() => handleQuickInboundVerify(msg, otp)}
                            className="inline-flex items-center gap-1 rounded bg-[#2463EB] px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            <ShieldCheck className="h-3 w-3" />
                            Reply & Verify
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Inbound SMS Reply Simulator */}
        <form onSubmit={handleManualInboundSend} className="border-t border-slate-200 bg-[#F3F6FA] p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#14263D]">
            <MessageSquareText className="h-4 w-4 text-[#2463EB]" />
            Send Inbound SMS Reply to ERP Gateway
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={replyFrom}
              onChange={(e) => setReplyFrom(e.target.value)}
              placeholder="+919845077120"
              className="col-span-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:border-[#2463EB] focus:outline-none"
              required
            />
            <input
              type="text"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="e.g. VERIFY 615839"
              className="col-span-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#2463EB] focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={sendingReply}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[#14263D] px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {sendingReply ? 'Transmitting Inbound SMS...' : 'Receive & Verify Inbound SMS'}
          </button>
        </form>
      </div>
    </div>
  );
};
