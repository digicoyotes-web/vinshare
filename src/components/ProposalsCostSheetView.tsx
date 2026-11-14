import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { INDUSTRY_TEMPLATES, SERVICE_MASTER } from '../data/seedData';
import type {
  ClientRecord,
  CostSheetLineItem,
  IndustryCategory,
  ProposalRecord,
  ProposalVersion,
} from '../types/erp';
import { calculateCostSheetFinancials, downloadCsv, formatInrFull } from '../utils/formatters';
import { downloadDocumentPdf } from '../utils/pdfGenerator';
import { DocumentActionBar } from './DocumentActionBar';
import type { EmailComposeContext } from './EmailComposeModal';
import type { SmsVerifyModalContext } from './SmsVerifyModal';
import { VersionsModal } from './VersionsModal';

interface ProposalsCostSheetViewProps {
  clients: ClientRecord[];
  proposals: ProposalRecord[];
  onSaveProposalVersion: (proposalId: string, updated: ProposalVersion) => void;
  onSelectProposalVersion: (proposalId: string, version: string) => void;
  onCreateProposalSnapshot: (proposalId: string, note: string) => void;
  onCreateProposal: (proposal: ProposalRecord) => void;
  onTriggerSmsVerify: (ctx: SmsVerifyModalContext) => void;
  onOpenEmailCompose: (ctx: EmailComposeContext) => void;
  onGenerateLoiFromProposal: (proposalId: string) => void;
}

export const ProposalsCostSheetView: React.FC<ProposalsCostSheetViewProps> = ({
  clients,
  proposals,
  onSaveProposalVersion,
  onSelectProposalVersion,
  onCreateProposalSnapshot,
  onCreateProposal,
  onTriggerSmsVerify,
  onOpenEmailCompose,
  onGenerateLoiFromProposal,
}) => {
  const [selectedId, setSelectedId] = useState<string>(proposals[0]?.id || '');
  const [showPreview, setShowPreview] = useState(false);
  const [showNewWizard, setShowNewWizard] = useState(false);
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // New proposal wizard state
  const [wizClientId, setWizClientId] = useState(clients[0]?.id || '');
  const [wizIndustry, setWizIndustry] = useState<IndustryCategory>('Commercial');
  const [wizSiteName, setWizSiteName] = useState('');
  const [wizDuration, setWizDuration] = useState(12);
  const [wizServices, setWizServices] = useState<string[]>([
    'Housekeeping',
    'Security',
    'Technical Maintenance',
  ]);
  const [customService, setCustomService] = useState('');

  const activeProposal = useMemo(
    () => proposals.find((p) => p.id === selectedId) || proposals[0],
    [proposals, selectedId]
  );

  const activeVersion = useMemo(() => {
    if (!activeProposal) return undefined;
    return (
      activeProposal.versions.find((v) => v.version === activeProposal.currentVersion) ||
      activeProposal.versions[activeProposal.versions.length - 1]
    );
  }, [activeProposal]);

  const isLocked =
    activeVersion?.status === 'Approved' || activeVersion?.status === 'Superseded';

  const updateLineItem = (
    itemId: string,
    field: keyof CostSheetLineItem,
    value: string | number
  ) => {
    if (!activeProposal || !activeVersion || isLocked) return;
    const nextItems = activeVersion.lineItems.map((row) =>
      row.id === itemId ? { ...row, [field]: value } : row
    );
    const fin = calculateCostSheetFinancials(
      nextItems,
      activeVersion.pricingMode,
      activeVersion.serviceChargePct,
      activeVersion.discountPct,
      activeProposal.contractDurationMonths
    );
    onSaveProposalVersion(activeProposal.id, {
      ...activeVersion,
      lineItems: nextItems,
      ...fin,
    });
  };

  const addLineItem = (category: CostSheetLineItem['category']) => {
    if (!activeProposal || !activeVersion || isLocked) return;
    const newItem: CostSheetLineItem = {
      id: `CS-${Date.now().toString(36).toUpperCase()}`,
      category,
      service: activeProposal.selectedServices[0] || 'Housekeeping',
      designationOrItem: category === 'Manpower' ? 'Trained Associate' : 'Monthly Allocation',
      shiftOrUnit: category === 'Manpower' ? '8 Hrs Shift' : 'Monthly Lot',
      quantity: 1,
      unitRate: 18500,
      statutoryPct: category === 'Manpower' ? 21.6 : 0,
    };
    const nextItems = [...activeVersion.lineItems, newItem];
    const fin = calculateCostSheetFinancials(
      nextItems,
      activeVersion.pricingMode,
      activeVersion.serviceChargePct,
      activeVersion.discountPct,
      activeProposal.contractDurationMonths
    );
    onSaveProposalVersion(activeProposal.id, {
      ...activeVersion,
      lineItems: nextItems,
      ...fin,
    });
  };

  const removeLineItem = (itemId: string) => {
    if (!activeProposal || !activeVersion || isLocked) return;
    const nextItems = activeVersion.lineItems.filter((r) => r.id !== itemId);
    const fin = calculateCostSheetFinancials(
      nextItems,
      activeVersion.pricingMode,
      activeVersion.serviceChargePct,
      activeVersion.discountPct,
      activeProposal.contractDurationMonths
    );
    onSaveProposalVersion(activeProposal.id, {
      ...activeVersion,
      lineItems: nextItems,
      ...fin,
    });
  };

  const updateCommercialControl = (
    pricingMode: 'margin' | 'markup',
    serviceChargePct: number,
    discountPct: number
  ) => {
    if (!activeProposal || !activeVersion || isLocked) return;
    const fin = calculateCostSheetFinancials(
      activeVersion.lineItems,
      pricingMode,
      serviceChargePct,
      discountPct,
      activeProposal.contractDurationMonths
    );
    onSaveProposalVersion(activeProposal.id, {
      ...activeVersion,
      pricingMode,
      serviceChargePct,
      discountPct,
      ...fin,
    });
  };

  const handleExportCostSheetCsv = () => {
    if (!activeProposal || !activeVersion) return;
    downloadCsv(
      `${activeProposal.reference.replace(/\//g, '-')}-${activeVersion.version}.csv`,
      ['Category', 'Service', 'Designation / Item', 'Shift / Unit', 'Qty', 'Unit Rate', 'Statutory %', 'Monthly Total'],
      activeVersion.lineItems.map((r) => [
        r.category,
        r.service,
        r.designationOrItem,
        r.shiftOrUnit,
        r.quantity,
        r.unitRate,
        r.statutoryPct,
        Math.round(r.quantity * r.unitRate * (1 + r.statutoryPct / 100)),
      ])
    );
  };

  const handleCreateProposalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === wizClientId) || clients[0];
    const template = INDUSTRY_TEMPLATES.find((t) => t.category === wizIndustry)!;
    const lineItems: CostSheetLineItem[] = wizServices.map((srv, idx) => {
      const master = SERVICE_MASTER.find((s) => s.name === srv);
      return {
        id: `NEW-${idx + 1}`,
        category: 'Manpower',
        service: srv,
        designationOrItem: `${srv} Executive / Staff`,
        shiftOrUnit: master?.unit || 'Monthly',
        quantity: 6,
        unitRate: master?.defaultRate || 19000,
        statutoryPct: 21.6,
      };
    });
    const fin = calculateCostSheetFinancials(lineItems, 'margin', template.defaultMarginPct, 0, wizDuration);
    const id = `PROP-2025-${String(proposals.length + 20).padStart(3, '0')}`;
    const newProposal: ProposalRecord = {
      id,
      reference: `FM/PROP/2025/${String(proposals.length + 20).padStart(3, '0')}`,
      opportunityId: 'OPP-NEW',
      clientId: client.id,
      industry: wizIndustry,
      siteName: wizSiteName.trim() || client.siteAddress,
      selectedServices: wizServices,
      contractDurationMonths: wizDuration,
      validityDate: '2025-02-28',
      currentVersion: 'V1',
      versions: [
        {
          version: 'V1',
          createdAt: new Date().toISOString(),
          createdBy: 'Rohit Sharma',
          reason: `Generated from ${wizIndustry} industry template`,
          clientFeedback: '',
          pricingMode: 'margin',
          serviceChargePct: template.defaultMarginPct,
          discountPct: 0,
          gstPct: 18,
          lineItems,
          ...fin,
          status: 'Draft',
        },
      ],
    };
    onCreateProposal(newProposal);
    setSelectedId(id);
    setShowNewWizard(false);
    setWizSiteName('');
  };

  if (!activeProposal || !activeVersion) {
    return null;
  }

  const activeClient = clients.find((c) => c.id === activeProposal.clientId);
  const proposalPdfName = `${activeProposal.reference.replace(/\//g, '-')}-${activeVersion.version}.pdf`;

  const handleSaveProposal = () => {
    onSaveProposalVersion(activeProposal.id, { ...activeVersion });
    setLastSavedAt(new Date().toISOString());
  };

  const handleDownloadProposalPdf = () => {
    downloadDocumentPdf({
      filename: proposalPdfName,
      headerBanner: 'FACILITY MANAGEMENT ERP · COMMERCIAL PROPOSAL',
      title: `${activeClient?.companyName || activeProposal.clientId}`,
      subtitle: `${activeProposal.reference} (${activeVersion.version}) · ${activeProposal.siteName}`,
      metaPairs: [
        ['Proposal Ref', activeProposal.reference],
        ['Version / Status', `${activeVersion.version} (${activeVersion.status})`],
        ['Client Contact', `${activeClient?.contactPerson || 'Authorized Signatory'}`],
        ['Industry Sector', activeProposal.industry],
        ['Contract Term', `${activeProposal.contractDurationMonths} Months`],
        ['Valid Until', activeProposal.validityDate],
      ],
      tableTitle: 'Commercial Cost Breakdown (Monthly)',
      tableHeaders: ['Category', 'Particulars', 'Qty', 'Monthly Total'],
      tableRows: activeVersion.lineItems.map((item) => [
        item.category,
        item.designationOrItem,
        String(item.quantity),
        formatInrFull(Math.round(item.quantity * item.unitRate * (1 + item.statutoryPct / 100))),
      ]),
      summaryRows: [
        ['Direct Operating Cost / Mo', formatInrFull(activeVersion.directCost)],
        ['Site Overheads / Mo', formatInrFull(activeVersion.overheadCost)],
        ['Total Cost / Mo', formatInrFull(activeVersion.totalOperatingCost)],
        ['Monthly Selling Price', formatInrFull(activeVersion.monthlySellingPrice)],
        ['Annual Contract Value', formatInrFull(activeVersion.annualContractValue)],
      ],
      footerNote: `Prepared by ${activeVersion.createdBy} · Services: ${activeProposal.selectedServices.join(', ')}`,
    });
  };

  const handleOpenProposalEmail = () => {
    onOpenEmailCompose({
      projectId: activeProposal.opportunityId,
      projectCode: activeProposal.reference,
      entityType: 'proposal',
      entityId: activeProposal.id,
      entityReference: `${activeProposal.reference} (${activeVersion.version})`,
      clientId: activeProposal.clientId,
      clientName: activeClient?.companyName || activeProposal.clientId,
      toEmail: activeClient?.email || '',
      subject: `Commercial Proposal ${activeProposal.reference} (${activeVersion.version}) — ${activeClient?.companyName || ''}`,
      body: `Dear ${activeClient?.contactPerson || 'Sir / Madam'},\n\nPlease find attached our Commercial Facility Management Proposal ${activeProposal.reference} (${activeVersion.version}) for ${activeProposal.siteName}.\n\nKey Commercial Summary:\n- Services Included: ${activeProposal.selectedServices.join(', ')}\n- Contract Duration: ${activeProposal.contractDurationMonths} Months\n- Monthly Commercials: ${formatInrFull(activeVersion.monthlySellingPrice)} (excl. GST)\n- Annual Contract Value: ${formatInrFull(activeVersion.annualContractValue)}\n- Proposal Validity: ${activeProposal.validityDate}\n\nKindly review and let us know if you would like any scope adjustments or proceed to LOI issuance.\n\nWarm regards,\nCommercial & Estimation Desk\nFacility Management ERP`,
      attachmentName: proposalPdfName,
      onDownloadPdf: handleDownloadProposalPdf,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#14263D]">Stage 01 · Client Proposals & Cost Sheet Builder</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            6 industry templates, formula-driven spreadsheet costing (Margin vs Markup), and SMS-verified commercial approvals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCostSheetCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-[#14263D] hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export Cost Sheet CSV
          </button>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-[#14263D] hover:bg-slate-50"
          >
            <Eye className="h-3.5 w-3.5" />
            {showPreview ? 'Back to Cost Sheet' : 'Proposal Preview'}
          </button>
          <button
            type="button"
            onClick={() => setShowNewWizard(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New Proposal Wizard
          </button>
        </div>
      </div>

      {/* Proposal Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={activeProposal.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#14263D] focus:border-[#2463EB] focus:outline-none"
          >
            {proposals.map((p) => {
              const c = clients.find((cl) => cl.id === p.clientId);
              return (
                <option key={p.id} value={p.id}>
                  {p.reference} — {c?.companyName || p.clientId} ({p.currentVersion})
                </option>
              );
            })}
          </select>
          <div className="text-xs text-slate-600">
            Sector: <span className="font-semibold text-[#14263D]">{activeProposal.industry}</span>
            <span className="mx-2 text-slate-300">·</span>
            Site: <span className="font-medium text-slate-800">{activeProposal.siteName}</span>
            <span className="mx-2 text-slate-300">·</span>
            Status:{' '}
            <span
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                activeVersion.status === 'Approved'
                  ? 'bg-[#E8F5EE] text-emerald-800'
                  : 'bg-[#FFF2E5] text-amber-800'
              }`}
            >
              {activeVersion.status === 'Approved' && <CheckCircle2 className="h-3 w-3" />}
              {activeVersion.status} ({activeVersion.version})
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <DocumentActionBar
            onSave={handleSaveProposal}
            onOpenVersions={() => setShowVersionsModal(true)}
            onOpenEmail={handleOpenProposalEmail}
            onDownloadPdf={handleDownloadProposalPdf}
            versionCount={activeProposal.versions.length}
            lastSavedAt={lastSavedAt}
          />
          {activeVersion.status !== 'Approved' ? (
            <button
              type="button"
              onClick={() =>
                onTriggerSmsVerify({
                  title: 'Approve Proposal Commercials via SMS OTP',
                  subtitle: `Management authorization for ${activeProposal.reference} (${activeVersion.version})`,
                  phone: '+919811203344',
                  recipientName: 'Rohit Sharma (Approving Director)',
                  purpose: 'proposal_approval',
                  entityType: 'proposal',
                  entityId: `${activeProposal.id}:${activeVersion.version}`,
                  entityLabel: `${activeProposal.reference} (${activeVersion.version})`,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#14263D] px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Approve Proposal (SMS Verify)
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onGenerateLoiFromProposal(activeProposal.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Proceed to Stage 03 · Generate LOI
            </button>
          )}
        </div>
      </div>

      {showPreview ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 max-w-4xl mx-auto space-y-6">
          <div className="flex items-start justify-between border-b border-slate-200 pb-5">
            <div>
              <div className="text-xs font-semibold text-[#2463EB]">COMMERCIAL PROPOSAL</div>
              <h2 className="text-2xl font-bold text-[#14263D] mt-1">{activeClient?.companyName}</h2>
              <p className="text-xs text-slate-600 mt-1">{activeProposal.siteName}</p>
            </div>
            <div className="text-right text-xs text-slate-600 tabular-nums">
              <div className="font-mono font-semibold text-[#14263D]">{activeProposal.reference}</div>
              <div>Version: {activeVersion.version}</div>
              <div>Valid Until: {activeProposal.validityDate}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg bg-[#F3F6FA] p-4 border border-slate-200">
            <div>
              <div className="text-[11px] text-slate-500">Industry Sector</div>
              <div className="text-xs font-semibold text-[#14263D]">{activeProposal.industry}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Contract Duration</div>
              <div className="text-xs font-semibold text-[#14263D]">{activeProposal.contractDurationMonths} Months</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Monthly Commercials</div>
              <div className="text-xs font-bold text-[#14263D] tabular-nums">
                {formatInrFull(activeVersion.monthlySellingPrice)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Annual Contract Value</div>
              <div className="text-xs font-bold text-[#2463EB] tabular-nums">
                {formatInrFull(activeVersion.annualContractValue)}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[#14263D] mb-2">Scope of Services Included</h3>
            <div className="flex flex-wrap gap-2 text-xs text-slate-700">
              {activeProposal.selectedServices.map((s) => (
                <span key={s} className="rounded-md border border-slate-200 bg-[#F3F6FA] px-2.5 py-1 font-medium">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[#14263D] mb-2">Commercial Cost Breakdown</h3>
            <table className="w-full text-left text-xs border border-slate-200">
              <thead className="bg-[#F3F6FA] text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Particulars</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Monthly Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeVersion.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 text-slate-600">{item.category}</td>
                    <td className="px-3 py-2 font-medium text-[#14263D]">{item.designationOrItem}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatInrFull(item.quantity * item.unitRate * (1 + item.statutoryPct / 100))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Spreadsheet Grid */}
          <div className="xl:col-span-9 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-[#2463EB]" />
                <h2 className="text-sm font-semibold text-[#14263D]">
                  Formula-Driven Cost Sheet ({activeVersion.version})
                </h2>
                {isLocked && (
                  <span className="text-[11px] font-medium text-emerald-700 bg-[#E8F5EE] px-2 py-0.5 rounded">
                    Immutable Approved Snapshot
                  </span>
                )}
              </div>
              {!isLocked && (
                <div className="flex flex-wrap gap-1.5">
                  {(['Manpower', 'Materials & Consumables', 'Equipment', 'Overheads'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => addLineItem(cat)}
                      className="rounded border border-slate-300 bg-[#F3F6FA] px-2 py-1 text-[11px] font-medium text-[#14263D] hover:bg-slate-200"
                    >
                      + {cat.split(' ')[0]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F3F6FA] text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Cost Head</th>
                    <th className="px-3 py-2.5 font-semibold">Service</th>
                    <th className="px-3 py-2.5 font-semibold">Designation / Item</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Qty</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Unit Rate (₹)</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Statutory %</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Monthly Total</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeVersion.lineItems.map((row) => {
                    const rowTotal = Math.round(row.quantity * row.unitRate * (1 + row.statutoryPct / 100));
                    return (
                      <tr key={row.id} className="hover:bg-[#F3F6FA]/40">
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.category}</td>
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{row.service}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            disabled={isLocked}
                            value={row.designationOrItem}
                            onChange={(e) => updateLineItem(row.id, 'designationOrItem', e.target.value)}
                            className="w-full min-w-[160px] rounded border border-transparent hover:border-slate-300 focus:border-[#2463EB] bg-transparent px-1.5 py-1 text-xs font-medium text-[#14263D] focus:outline-none disabled:opacity-75"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            disabled={isLocked}
                            value={row.quantity}
                            onChange={(e) => updateLineItem(row.id, 'quantity', Number(e.target.value) || 0)}
                            className="w-16 rounded border border-slate-200 px-2 py-1 text-right font-mono text-xs tabular-nums focus:border-[#2463EB] focus:outline-none disabled:bg-slate-50"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            disabled={isLocked}
                            value={row.unitRate}
                            onChange={(e) => updateLineItem(row.id, 'unitRate', Number(e.target.value) || 0)}
                            className="w-24 rounded border border-slate-200 px-2 py-1 text-right font-mono text-xs tabular-nums focus:border-[#2463EB] focus:outline-none disabled:bg-slate-50"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            disabled={isLocked}
                            value={row.statutoryPct}
                            onChange={(e) => updateLineItem(row.id, 'statutoryPct', Number(e.target.value) || 0)}
                            className="w-16 rounded border border-slate-200 px-2 py-1 text-right font-mono text-xs tabular-nums focus:border-[#2463EB] focus:outline-none disabled:bg-slate-50"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-[#14263D] font-mono tabular-nums whitespace-nowrap">
                          {formatInrFull(rowTotal)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {!isLocked && (
                            <button
                              type="button"
                              onClick={() => removeLineItem(row.id)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                              title="Remove row"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Commercial Summary & Markup vs Margin Controls */}
          <div className="xl:col-span-3 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#14263D] border-b border-slate-100 pb-2.5">
              Commercial Pricing Engine
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Pricing Method (Margin vs Markup)
                </label>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#F3F6FA] p-1 border border-slate-200">
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() =>
                      updateCommercialControl('margin', activeVersion.serviceChargePct, activeVersion.discountPct)
                    }
                    className={`rounded-md py-1.5 text-xs font-medium ${
                      activeVersion.pricingMode === 'margin'
                        ? 'bg-white text-[#14263D] shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Gross Margin %
                  </button>
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() =>
                      updateCommercialControl('markup', activeVersion.serviceChargePct, activeVersion.discountPct)
                    }
                    className={`rounded-md py-1.5 text-xs font-medium ${
                      activeVersion.pricingMode === 'markup'
                        ? 'bg-white text-[#14263D] shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Cost Markup %
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    {activeVersion.pricingMode === 'margin' ? 'Target Margin %' : 'Markup Rate %'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    disabled={isLocked}
                    value={activeVersion.serviceChargePct}
                    onChange={(e) =>
                      updateCommercialControl(
                        activeVersion.pricingMode,
                        Number(e.target.value) || 0,
                        activeVersion.discountPct
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Discount %</label>
                  <input
                    type="number"
                    step="0.5"
                    disabled={isLocked}
                    value={activeVersion.discountPct}
                    onChange={(e) =>
                      updateCommercialControl(
                        activeVersion.pricingMode,
                        activeVersion.serviceChargePct,
                        Number(e.target.value) || 0
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100 border-t border-slate-200 pt-2 text-xs">
              <div className="py-2 flex justify-between">
                <span className="text-slate-600">Direct Operating Cost</span>
                <span className="font-mono font-medium text-[#14263D] tabular-nums">
                  {formatInrFull(activeVersion.directCost)}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-600">Site Overheads</span>
                <span className="font-mono font-medium text-[#14263D] tabular-nums">
                  {formatInrFull(activeVersion.overheadCost)}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-600">Total Cost / Month</span>
                <span className="font-mono font-semibold text-[#14263D] tabular-nums">
                  {formatInrFull(activeVersion.totalOperatingCost)}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-600">Monthly Selling Price</span>
                <span className="font-mono font-bold text-[#2463EB] tabular-nums">
                  {formatInrFull(activeVersion.monthlySellingPrice)}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-600">Monthly Gross Profit</span>
                <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                  {formatInrFull(activeVersion.grossProfit)} ({activeVersion.grossMarginPct}%)
                </span>
              </div>
              <div className="py-2.5 flex justify-between bg-[#F3F6FA] px-2 rounded-md mt-1">
                <span className="font-semibold text-[#14263D]">Annual Contract Value</span>
                <span className="font-mono font-bold text-[#14263D] tabular-nums">
                  {formatInrFull(activeVersion.annualContractValue)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Proposal Wizard Modal */}
      {showNewWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="bg-[#14263D] px-5 py-4 text-white flex justify-between items-center">
              <h2 className="text-sm font-semibold">New Industry-Standard Proposal Wizard</h2>
              <button type="button" onClick={() => setShowNewWizard(false)} className="text-slate-300 hover:text-white">
                ×
              </button>
            </div>
            <form onSubmit={handleCreateProposalSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Client</label>
                  <select
                    value={wizClientId}
                    onChange={(e) => setWizClientId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Industry Template</label>
                  <select
                    value={wizIndustry}
                    onChange={(e) => {
                      const cat = e.target.value as IndustryCategory;
                      setWizIndustry(cat);
                      const tmpl = INDUSTRY_TEMPLATES.find((t) => t.category === cat);
                      if (tmpl) setWizServices(tmpl.defaultServices);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    {INDUSTRY_TEMPLATES.map((t) => (
                      <option key={t.category} value={t.category}>
                        {t.category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Project / Site Name</label>
                  <input
                    type="text"
                    value={wizSiteName}
                    onChange={(e) => setWizSiteName(e.target.value)}
                    placeholder="e.g. Tower B Corporate Campus"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Duration (Months)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={wizDuration}
                    onChange={(e) => setWizDuration(Number(e.target.value) || 12)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Select Services</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SERVICE_MASTER.map((s) => {
                    const checked = wizServices.includes(s.name);
                    return (
                      <label
                        key={s.name}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer ${
                          checked ? 'border-[#2463EB] bg-blue-50/60 text-[#14263D] font-medium' : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setWizServices((prev) =>
                              prev.includes(s.name) ? prev.filter((x) => x !== s.name) : [...prev, s.name]
                            )
                          }
                        />
                        <span className="truncate">{s.name}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={customService}
                    onChange={(e) => setCustomService(e.target.value)}
                    placeholder="Add custom service entry..."
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customService.trim() && !wizServices.includes(customService.trim())) {
                        setWizServices((p) => [...p, customService.trim()]);
                        setCustomService('');
                      }
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    + Add Custom
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewWizard(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#2463EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Generate Proposal & Cost Sheet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <VersionsModal
        isOpen={showVersionsModal}
        onClose={() => setShowVersionsModal(false)}
        title={`Proposal Versions · ${activeProposal.reference}`}
        subtitle={`${activeClient?.companyName || ''} · ${activeProposal.siteName}`}
        mode="proposal"
        proposalVersions={activeProposal.versions}
        activeProposalVersion={activeProposal.currentVersion}
        onSelectProposalVersion={(version) => onSelectProposalVersion(activeProposal.id, version)}
        onCreateProposalSnapshot={(note) => onCreateProposalSnapshot(activeProposal.id, note)}
      />
    </div>
  );
};
