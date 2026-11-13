import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { sendSms, verifySmsOtp } from '../services/smsApi';
import { formatDateTime } from '../utils/formatters';

export interface SmsVerifyModalContext {
  title: string;
  subtitle: string;
  phone: string;
  recipientName: string;
  purpose: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
}

interface SmsVerifyModalProps {
  context: SmsVerifyModalContext | null;
  onClose: () => void;
  onOpenInbox: (phone: string) => void;
  onVerified: (result: {
    entityId: string;
    phone: string;
    messageId: string;
    verifiedAt: string;
  }) => void;
}

export const SmsVerifyModal: React.FC<SmsVerifyModalProps> = ({
  context,
  onClose,
  onOpenInbox,
  onVerified,
}) => {
  const [phoneInput, setPhoneInput] = useState('');
  const [messageId, setMessageId] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | undefined>(undefined);
  const [carrierRef, setCarrierRef] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedReceipt, setVerifiedReceipt] = useState<{
    messageId: string;
    verifiedAt: string;
  } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (context) {
      setPhoneInput(context.phone);
      setMessageId(null);
      setChallengeToken(undefined);
      setCarrierRef(null);
      setReceivedAt(null);
      setExpiresAt(null);
      setOtpCode('');
      setError(null);
      setVerifiedReceipt(null);
    }
  }, [context]);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (!context) return null;

  const handleDispatchSms = async () => {
    setDispatching(true);
    setError(null);
    try {
      const res = await sendSms({
        phone: phoneInput,
        recipientName: context.recipientName,
        purpose: context.purpose,
        entityType: context.entityType,
        entityId: context.entityId,
        entityLabel: context.entityLabel,
        requiresVerification: true,
        ttlMinutes: 5,
      });
      setMessageId(res.id);
      setChallengeToken(res.challengeToken);
      setCarrierRef(res.carrierRef);
      setReceivedAt(res.receivedAt);
      setExpiresAt(res.expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send SMS');
    } finally {
      setDispatching(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await verifySmsOtp({
        messageId: messageId || undefined,
        phone: phoneInput,
        entityId: context.entityId,
        code: otpCode.trim(),
        challengeToken,
      });
      if (!res.verified) {
        setError(res.error || 'Verification failed');
        return;
      }
      const receipt = {
        messageId: res.messageId || messageId || 'SMS-VERIFIED',
        verifiedAt: res.verifiedAt || new Date().toISOString(),
      };
      setVerifiedReceipt(receipt);
      onVerified({
        entityId: context.entityId,
        phone: res.phone || phoneInput,
        messageId: receipt.messageId,
        verifiedAt: receipt.verifiedAt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification error');
    } finally {
      setVerifying(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between bg-[#14263D] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{context.title}</h3>
              <p className="text-xs text-slate-300">{context.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {verifiedReceipt ? (
            <div className="rounded-lg border border-emerald-200 bg-[#E8F5EE] p-5 text-center space-y-2.5">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
              <h4 className="text-base font-semibold text-emerald-950">SMS Received & Verified</h4>
              <p className="text-xs text-emerald-800">
                Verification completed for <span className="font-semibold">{context.entityLabel}</span> ({phoneInput}).
              </p>
              <div className="rounded-md bg-white/80 px-3 py-2 text-[11px] font-mono text-emerald-900 tabular-nums">
                Message ID: {verifiedReceipt.messageId} · Verified: {formatDateTime(verifiedReceipt.verifiedAt)}
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-[#14263D] px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Continue to ERP
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-[#F3F6FA] p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Record / Entity</span>
                  <span className="font-semibold text-[#14263D]">{context.entityLabel}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Recipient</span>
                  <span className="font-medium text-slate-800">{context.recipientName}</span>
                </div>
                <div className="pt-1">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Target Mobile Number
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      disabled={Boolean(messageId)}
                      className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 disabled:bg-slate-100 focus:border-[#2463EB] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleDispatchSms}
                      disabled={dispatching || !phoneInput.trim()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#2463EB] px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {messageId ? <RefreshCw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                      {dispatching ? 'Sending...' : messageId ? 'Resend SMS' : 'Send Verification SMS'}
                    </button>
                  </div>
                </div>
              </div>

              {messageId && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-900">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      SMS Delivered & Received on Handset
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-slate-700 tabular-nums">
                      <Clock className="h-3.5 w-3.5 text-amber-600" />
                      {formatTimer(secondsLeft)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 tabular-nums">
                    Carrier Ref: <span className="font-mono">{carrierRef}</span> · Received at{' '}
                    {formatDateTime(receivedAt)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenInbox(phoneInput)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-[#2463EB] hover:bg-blue-50"
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    Open Received SMS Inbox to Read Code
                  </button>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Enter 6-Digit Received SMS Verification Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="• • • • • •"
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-center font-mono text-lg font-semibold tracking-[0.45em] text-[#14263D] focus:border-[#2463EB] focus:outline-none tabular-nums"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={verifying || otpCode.length !== 6}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#14263D] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {verifying ? 'Verifying...' : 'Verify SMS Code'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
