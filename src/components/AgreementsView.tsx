import React, { useState } from 'react';
import { CheckCircle2, FileSignature, Lock, ShieldCheck } from 'lucide-react';
import type { AgreementRecord } from '../types/erp';
import { formatInrCompact } from '../utils/formatters';
import type { SmsVerifyModalContext } from './SmsVerifyModal';

interface AgreementsViewProps {
  agreements: AgreementRecord[];
  onUpdateClause: (agreementId: string, clauseId: string, content: string) => void;
  onTriggerSmsVerify: (ctx: SmsVerifyModalContext) => void;
  onProceedToClosing: (agreementId: string) => void;
}

export const AgreementsView: React.FC<AgreementsViewProps> = ({
  agreements,
  onUpdateClause,
  onTriggerSmsVerify,
  onProceedToClosing,
}) => {
  const [selectedId, setSelectedId] = useState(agreements[0]?.id || '');
  const active = agreements.find((a) => a.id === selectedId) || agreements[0];

  if (!active) return null;

  const isExecuted = active.status === 'Executed';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[#14263D]">Stage 04 · Agreements & Contract Execution</h1>
        <p className="text-xs text-slate-600 mt-0.5">
          Clause-level legal drafting, dual-party signature tracking, and SMS-verified execution lock. Executed agreements are strictly read-only.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[#14263D]">Contracts & Drafts ({agreements.length})</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {agreements.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedId(a.id)}
                className={`w-full text-left p-4 hover:bg-[#F3F6FA]/70 transition-colors ${
                  active.id === a.id ? 'bg-blue-50/50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-[#2463EB]">{a.reference}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                      a.status === 'Executed'
                        ? 'bg-[#E8F5EE] text-emerald-800'
                        : 'bg-[#FFF2E5] text-amber-800'
                    }`}
                  >
                    {a.status === 'Executed' && <Lock className="h-3 w-3" />}
                    {a.status}
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-[#14263D]">{a.clientName}</div>
                <div className="mt-1 flex justify-between text-xs text-slate-500 tabular-nums">
                  <span>{a.version}</span>
                  <span className="font-semibold text-[#14263D]">{formatInrCompact(a.annualValue)}/yr</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-[#2463EB]" />
                <span className="font-mono text-xs font-semibold text-[#2463EB]">{active.reference}</span>
                {isExecuted && (
                  <span className="inline-flex items-center gap-1 rounded bg-[#E8F5EE] px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    <Lock className="h-3 w-3" />
                    Read-Only Executed Contract
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-[#14263D] mt-1">{active.clientName}</h2>
              <p className="text-xs text-slate-600">{active.templateName} · Term: {active.startDate} to {active.endDate}</p>
            </div>

            <div>
              {!isExecuted ? (
                <button
                  type="button"
                  onClick={() =>
                    onTriggerSmsVerify({
                      title: 'Execute & Lock Agreement via SMS Signature OTP',
                      subtitle: `Legal authorization OTP for ${active.reference} (${active.clientName})`,
                      phone: '+919820776501',
                      recipientName: `Meenakshi Rao (Legal Head) & ${active.clientName}`,
                      purpose: 'agreement_signature',
                      entityType: 'agreement',
                      entityId: active.id,
                      entityLabel: `${active.reference} · ${active.clientName}`,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Verify Signature & Lock Executed
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onProceedToClosing(active.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#14263D] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Proceed to Closing Checklist (Stage 05)
                </button>
              )}
            </div>
          </div>

          {/* Signature Tracker */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-[#F3F6FA] p-3.5 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`h-4 w-4 ${active.companySigned ? 'text-emerald-600' : 'text-slate-300'}`} />
              <span className="font-medium text-[#14263D]">Company Signatory: {active.companySigned ? 'Signed' : 'Pending'}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className={`h-4 w-4 ${active.clientSigned ? 'text-emerald-600' : 'text-slate-300'}`} />
              <span className="font-medium text-[#14263D]">Client Counterparty: {active.clientSigned ? 'Signed' : 'Awaiting'}</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className={`h-4 w-4 ${active.smsExecutionVerified ? 'text-emerald-600' : 'text-amber-600'}`} />
              <span className="font-medium text-[#14263D]">
                SMS Execution: {active.smsExecutionVerified ? 'Verified' : 'Pending OTP'}
              </span>
            </div>
          </div>

          {/* Clauses */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-600">Structured Agreement Clauses</h3>
            {active.clauses.map((clause) => (
              <div key={clause.id} className="rounded-lg border border-slate-200 p-3.5 space-y-1.5">
                <div className="text-xs font-semibold text-[#14263D]">{clause.section}</div>
                <textarea
                  rows={2}
                  disabled={isExecuted}
                  value={clause.content}
                  onChange={(e) => onUpdateClause(active.id, clause.id, e.target.value)}
                  className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 disabled:bg-[#F3F6FA] disabled:text-slate-600 focus:border-[#2463EB] focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
