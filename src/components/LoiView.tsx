import React, { useState } from 'react';
import { CheckCircle2, FileCheck2, ShieldCheck, Smartphone } from 'lucide-react';
import type { LoiRecord, LoiStatus } from '../types/erp';
import { formatInrCompact, formatInrFull } from '../utils/formatters';
import type { SmsVerifyModalContext } from './SmsVerifyModal';

interface LoiViewProps {
  lois: LoiRecord[];
  onUpdateLoiStatus: (loiId: string, status: LoiStatus) => void;
  onTriggerSmsVerify: (ctx: SmsVerifyModalContext) => void;
  onDraftAgreementFromLoi: (loiId: string) => void;
}

export const LoiView: React.FC<LoiViewProps> = ({
  lois,
  onUpdateLoiStatus,
  onTriggerSmsVerify,
  onDraftAgreementFromLoi,
}) => {
  const [selectedId, setSelectedId] = useState(lois[0]?.id || '');
  const active = lois.find((l) => l.id === selectedId) || lois[0];

  if (!active) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[#14263D]">Stage 03 · Letters of Intent (LOI)</h1>
        <p className="text-xs text-slate-600 mt-0.5">
          Generated from approved proposal commercial snapshots. Distinguish internal approval from client SMS-verified acknowledgement.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LOI Queue */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[#14263D]">LOI Register ({lois.length})</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {lois.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedId(l.id)}
                className={`w-full text-left p-4 hover:bg-[#F3F6FA]/70 transition-colors ${
                  active.id === l.id ? 'bg-blue-50/50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-[#2463EB]">{l.reference}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                      l.status === 'Accepted'
                        ? 'bg-[#E8F5EE] text-emerald-800'
                        : 'bg-[#FFF2E5] text-amber-800'
                    }`}
                  >
                    {l.status === 'Accepted' && <CheckCircle2 className="h-3 w-3" />}
                    {l.status}
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-[#14263D]">{l.clientName}</div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500 tabular-nums">
                  <span>{l.siteName}</span>
                  <span className="font-semibold text-[#14263D]">{formatInrCompact(l.loiValueAnnual)}/yr</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* LOI Document & Client SMS Acceptance */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-[#2463EB]" />
                <span className="font-mono text-xs font-semibold text-[#2463EB]">{active.reference}</span>
              </div>
              <h2 className="text-lg font-bold text-[#14263D] mt-1">{active.clientName}</h2>
              <p className="text-xs text-slate-600">{active.siteName} · Linked Proposal {active.proposalId} ({active.approvedProposalVersion})</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {!active.clientSmsAccepted ? (
                <button
                  type="button"
                  onClick={() =>
                    onTriggerSmsVerify({
                      title: 'Verify Client LOI Acceptance via SMS',
                      subtitle: `Send acceptance code to ${active.clientContactMobile} and confirm LOI`,
                      phone: active.clientContactMobile,
                      recipientName: active.clientName,
                      purpose: 'loi_acceptance',
                      entityType: 'loi',
                      entityId: active.id,
                      entityLabel: `${active.id} · ${active.clientName}`,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Smartphone className="h-4 w-4" />
                  Send & Verify LOI Acceptance SMS
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onDraftAgreementFromLoi(active.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#14263D] px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Draft Formal Agreement (Stage 04)
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-lg border border-slate-200 bg-[#F3F6FA] p-4 text-xs">
            <div>
              <div className="text-slate-500">Annual LOI Value</div>
              <div className="font-mono font-bold text-[#14263D] tabular-nums mt-0.5">
                {formatInrFull(active.loiValueAnnual)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Security Deposit</div>
              <div className="font-mono font-semibold text-[#14263D] tabular-nums mt-0.5">
                {formatInrFull(active.securityDeposit)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Mobilization Window</div>
              <div className="font-semibold text-[#14263D] mt-0.5">{active.mobilizationDays} Days</div>
            </div>
            <div>
              <div className="text-slate-500">Commencement Date</div>
              <div className="font-semibold text-[#14263D] mt-0.5 tabular-nums">{active.startDate}</div>
            </div>
            <div>
              <div className="text-slate-500">Payment Terms</div>
              <div className="font-semibold text-[#14263D] mt-0.5">{active.paymentTerms}</div>
            </div>
            <div>
              <div className="text-slate-500">Client SMS Acceptance</div>
              <div className="mt-0.5">
                {active.clientSmsAccepted ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    SMS Verified
                  </span>
                ) : (
                  <span className="text-amber-700 font-semibold">Pending Client SMS</span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-4 text-xs text-slate-700 space-y-2 leading-relaxed">
            <div className="font-semibold text-[#14263D]">Letter of Intent Summary & Conditions Precedent</div>
            <p>
              This Letter of Intent confirms intent to award Facility Management services at{' '}
              <span className="font-semibold">{active.siteName}</span> per approved proposal{' '}
              <span className="font-mono">{active.proposalId} ({active.approvedProposalVersion})</span>.
              Execution of a formal Service Agreement remains mandatory prior to full mobilization; an LOI is not treated as an executed contract until Stage 04 legal execution.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>Authorized Signatory: {active.authorizedSignatory}</span>
              <div className="flex items-center gap-2">
                <span>Workflow State:</span>
                <select
                  value={active.status}
                  onChange={(e) => onUpdateLoiStatus(active.id, e.target.value as LoiStatus)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-[#14263D]"
                >
                  {[
                    'Draft',
                    'Internal Review',
                    'Management Approval',
                    'Approved',
                    'Shared with Client',
                    'Awaiting Client Acceptance',
                    'Accepted',
                    'Rejected',
                  ].map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
