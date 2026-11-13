import React, { useState } from 'react';
import { GitCompare, Plus, UserMinus } from 'lucide-react';
import type { AttritionRecord, ClientRecord, ProposalRecord } from '../types/erp';
import { formatInrFull } from '../utils/formatters';

interface AttritionRevisionsViewProps {
  clients: ClientRecord[];
  proposals: ProposalRecord[];
  attritionRecords: AttritionRecord[];
  onAddAttrition: (record: AttritionRecord) => void;
  onCreateRevision: (proposalId: string, reason: string, feedback: string, serviceChargePct: number) => void;
}

export const AttritionRevisionsView: React.FC<AttritionRevisionsViewProps> = ({
  clients,
  proposals,
  attritionRecords,
  onAddAttrition,
  onCreateRevision,
}) => {
  const [selectedProposalId, setSelectedProposalId] = useState(proposals[1]?.id || proposals[0]?.id || '');
  const [revReason, setRevReason] = useState('');
  const [revFeedback, setRevFeedback] = useState('');
  const [revMarginPct, setRevMarginPct] = useState('12');

  // New attrition entry state
  const [designation, setDesignation] = useState('Housekeeping Janitor');
  const [approvedHeadcount, setApprovedHeadcount] = useState(20);
  const [currentHeadcount, setCurrentHeadcount] = useState(18);
  const [separations, setSeparations] = useState(3);
  const [vacancyDays, setVacancyDays] = useState(7);
  const [replacementCost, setReplacementCost] = useState(3500);
  const [trainingCost, setTrainingCost] = useState(4000);
  const [overtimeCost, setOvertimeCost] = useState(9500);
  const [chargeable, setChargeable] = useState(false);

  const proposal = proposals.find((p) => p.id === selectedProposalId) || proposals[0];
  const v1 = proposal?.versions[0];
  const latest = proposal?.versions[proposal.versions.length - 1];

  const handleRecordAttrition = (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === proposal?.clientId);
    onAddAttrition({
      id: `ATT-${String(attritionRecords.length + 1).padStart(3, '0')}`,
      proposalId: proposal?.id || 'PROP-2025-014',
      clientName: client?.companyName || 'Active Client',
      designation,
      approvedHeadcount,
      currentHeadcount,
      separationsInPeriod: separations,
      openingHeadcount: approvedHeadcount,
      vacancyDurationDays: vacancyDays,
      replacementCostPerHire: replacementCost,
      trainingCost,
      overtimeCoverCost: overtimeCost,
      chargeableToClient: chargeable,
      recordedAt: new Date().toISOString().slice(0, 10),
    });
  };

  const handleCreateNewRevision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposal || !revReason.trim()) return;
    onCreateRevision(proposal.id, revReason.trim(), revFeedback.trim(), Number(revMarginPct) || 12);
    setRevReason('');
    setRevFeedback('');
  };

  const computeVariance = (a?: number, b?: number) => (b ?? 0) - (a ?? 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[#14263D]">Stage 02 · Manpower Attrition & Commercial Revisions</h1>
        <p className="text-xs text-slate-600 mt-0.5">
          Original approved versions remain immutable. Track separations, vacancy impact, and side-by-side revision variances.
        </p>
      </div>

      {/* Revision Comparison Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-[#2463EB]" />
              <h2 className="text-sm font-semibold text-[#14263D]">Revision Comparison (Immutable V1 vs Latest)</h2>
            </div>
            <select
              value={proposal?.id || ''}
              onChange={(e) => setSelectedProposalId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#14263D]"
            >
              {proposals.map((p) => {
                const c = clients.find((cl) => cl.id === p.clientId);
                return (
                  <option key={p.id} value={p.id}>
                    {p.reference} — {c?.companyName} ({p.versions.length} versions)
                  </option>
                );
              })}
            </select>
          </div>

          {v1 && latest && (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F3F6FA] text-slate-600">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Particular</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Original ({v1.version})</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Latest ({latest.version})</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { label: 'Direct Manpower / Material / Equipment', orig: v1.directCost, rev: latest.directCost },
                  { label: 'Site Overheads', orig: v1.overheadCost, rev: latest.overheadCost },
                  { label: 'Monthly Selling Price', orig: v1.monthlySellingPrice, rev: latest.monthlySellingPrice },
                  { label: 'Annual Contract Value', orig: v1.annualContractValue, rev: latest.annualContractValue },
                  { label: 'Monthly Gross Profit', orig: v1.grossProfit, rev: latest.grossProfit },
                ].map((row) => {
                  const diff = computeVariance(row.orig, row.rev);
                  return (
                    <tr key={row.label}>
                      <td className="px-3 py-2.5 font-medium text-[#14263D]">{row.label}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600">
                        {formatInrFull(row.orig)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-[#14263D]">
                        {formatInrFull(row.rev)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono tabular-nums font-medium ${
                          diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-rose-700' : 'text-slate-500'
                        }`}
                      >
                        {diff === 0 ? '₹ 0' : `${diff > 0 ? '+' : ''}${formatInrFull(diff)}`}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="px-3 py-2.5 font-medium text-[#14263D]">Gross Margin %</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{v1.grossMarginPct}%</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold">{latest.grossMarginPct}%</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {(latest.grossMarginPct - v1.grossMarginPct).toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Create New Revision Form */}
        <form
          onSubmit={handleCreateNewRevision}
          className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-3"
        >
          <h2 className="text-sm font-semibold text-[#14263D] border-b border-slate-100 pb-2.5">
            Create New Proposal Revision (Preserves Prior Versions)
          </h2>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Mandatory Revision Reason *</label>
            <input
              type="text"
              required
              value={revReason}
              onChange={(e) => setRevReason(e.target.value)}
              placeholder="e.g. Client negotiation on night shift headcount"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Client Feedback & Meeting Notes</label>
            <textarea
              rows={2}
              value={revFeedback}
              onChange={(e) => setRevFeedback(e.target.value)}
              placeholder="Summarize client commercial request..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Revised Target Margin / Service Charge %</label>
            <input
              type="number"
              step="0.5"
              value={revMarginPct}
              onChange={(e) => setRevMarginPct(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2463EB] px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create Version V{(proposal?.versions.length || 1) + 1}
          </button>
        </form>
      </div>

      {/* Manpower Attrition Calculator & Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <form
          onSubmit={handleRecordAttrition}
          className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 space-y-3"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <UserMinus className="h-4 w-4 text-amber-700" />
            <h2 className="text-sm font-semibold text-[#14263D]">Log Manpower Attrition</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Designation / Category</label>
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Approved Headcount</label>
              <input
                type="number"
                value={approvedHeadcount}
                onChange={(e) => setApprovedHeadcount(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Current Deployed</label>
              <input
                type="number"
                value={currentHeadcount}
                onChange={(e) => setCurrentHeadcount(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Separations / Period</label>
              <input
                type="number"
                value={separations}
                onChange={(e) => setSeparations(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Vacancy Days</label>
              <input
                type="number"
                value={vacancyDays}
                onChange={(e) => setVacancyDays(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Replacement / Hire (₹)</label>
              <input
                type="number"
                value={replacementCost}
                onChange={(e) => setReplacementCost(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Overtime + Training (₹)</label>
              <input
                type="number"
                value={overtimeCost + trainingCost}
                onChange={(e) => {
                  const total = Number(e.target.value) || 0;
                  setOvertimeCost(Math.round(total * 0.7));
                  setTrainingCost(Math.round(total * 0.3));
                }}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 pt-1">
            <input
              type="checkbox"
              checked={chargeable}
              onChange={(e) => setChargeable(e.target.checked)}
            />
            Contract permits charging attrition cost to client
          </label>
          <button
            type="submit"
            className="w-full rounded-lg bg-[#14263D] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Calculate & Record Attrition
          </button>
        </form>

        <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[#14263D]">Manpower Attrition & Vacancy Impact Register</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F3F6FA] text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Client & Role</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Approved / Current</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Vacancies</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Attrition Rate</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Total Financial Impact</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Client Billing Rule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attritionRecords.map((a) => {
                  const vacancies = Math.max(0, a.approvedHeadcount - a.currentHeadcount);
                  const avgHeadcount = (a.openingHeadcount + a.currentHeadcount) / 2 || 1;
                  const attritionRate = ((a.separationsInPeriod / avgHeadcount) * 100).toFixed(1);
                  const totalImpact =
                    a.separationsInPeriod * a.replacementCostPerHire + a.trainingCost + a.overtimeCoverCost;
                  return (
                    <tr key={a.id} className="hover:bg-[#F3F6FA]/50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#14263D]">{a.designation}</div>
                        <div className="text-[11px] text-slate-500">{a.clientName} · {a.vacancyDurationDays} vacancy days</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {a.approvedHeadcount} / {a.currentHeadcount}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700 font-semibold">
                        {vacancies}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[#14263D]">
                        {attritionRate}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-rose-700">
                        {formatInrFull(totalImpact)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                            a.chargeableToClient
                              ? 'bg-[#E8F5EE] text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {a.chargeableToClient ? 'Chargeable' : 'Internal Cost Only'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
