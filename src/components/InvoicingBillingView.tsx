import React, { useState } from 'react';
import { CheckCircle2, Plus, Printer, Receipt, ShieldCheck } from 'lucide-react';
import type {
  ClientRecord,
  DocumentVersionSnapshot,
  InvoiceRecord,
  ProjectRecord,
} from '../types/erp';
import { loadMasterSettings } from '../utils/erpSettings';
import { formatInrFull } from '../utils/formatters';
import { downloadDocumentPdf } from '../utils/pdfGenerator';
import { DocumentActionBar } from './DocumentActionBar';
import type { EmailComposeContext } from './EmailComposeModal';
import type { SmsVerifyModalContext } from './SmsVerifyModal';
import { VersionsModal } from './VersionsModal';

interface InvoicingBillingViewProps {
  clients: ClientRecord[];
  projects: ProjectRecord[];
  invoices: InvoiceRecord[];
  invoiceSnapshots: DocumentVersionSnapshot[];
  onCreateInvoice: (invoice: InvoiceRecord) => void;
  onUpdateInvoice: (invoice: InvoiceRecord) => void;
  onSaveInvoiceSnapshot: (invoice: InvoiceRecord, note?: string) => void;
  onTriggerSmsVerify: (ctx: SmsVerifyModalContext) => void;
  onOpenEmailCompose: (ctx: EmailComposeContext) => void;
}

export const InvoicingBillingView: React.FC<InvoicingBillingViewProps> = ({
  clients,
  projects,
  invoices,
  invoiceSnapshots,
  onCreateInvoice,
  onUpdateInvoice,
  onSaveInvoiceSnapshot,
  onTriggerSmsVerify,
  onOpenEmailCompose,
}) => {
  const [selectedId, setSelectedId] = useState(invoices[0]?.id || '');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [newProjectId, setNewProjectId] = useState(projects[0]?.id || '');
  const [billingPeriod, setBillingPeriod] = useState(() =>
    new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  );
  const [poNumber, setPoNumber] = useState('PO/VIS/2026/004');
  const [dueDate, setDueDate] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [placeOfSupply, setPlaceOfSupply] = useState<'Intra-State' | 'Inter-State'>('Intra-State');
  const [extraAmount, setExtraAmount] = useState('0');
  const [deductions, setDeductions] = useState('0');

  const active = invoices.find((i) => i.id === selectedId) || invoices[0];

  const handleGenerateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const settings = loadMasterSettings();
    const gstPct = settings.defaultGstPct;
    const project = projects.find((p) => p.id === newProjectId) || projects[0];
    if (!project) return;
    const client = clients.find((c) => c.id === project.clientId);
    const baseAmt = Math.round(project.monthlyBilling);
    const extra = Number(extraAmount) || 0;
    const ded = Number(deductions) || 0;
    const taxableValue = Math.max(0, baseAmt + extra - ded);
    const halfRate = gstPct / 2 / 100;
    const fullRate = gstPct / 100;
    const cgst = placeOfSupply === 'Intra-State' ? Math.round(taxableValue * halfRate) : 0;
    const sgst = placeOfSupply === 'Intra-State' ? Math.round(taxableValue * halfRate) : 0;
    const igst = placeOfSupply === 'Inter-State' ? Math.round(taxableValue * fullRate) : 0;
    const totalAmount = taxableValue + cgst + sgst + igst;
    const maxInvSeq = invoices.reduce((max, inv) => {
      const m = inv.invoiceNumber.match(/(\d+)$/);
      return Math.max(max, m ? Number(m[1]) : 0);
    }, 1460);
    const nextNum = `INV-${String(maxInvSeq + 1).padStart(5, '0')}`;

    const invoice: InvoiceRecord = {
      id: nextNum,
      invoiceNumber: nextNum,
      projectId: project.id,
      clientId: project.clientId,
      clientName: project.clientName,
      gstin: client?.gstin || '27AABCU9603R1ZM',
      placeOfSupply,
      billingPeriod,
      poNumber,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: dueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      lineItems: [
        {
          id: `LI-${Date.now()}`,
          description: `Monthly Facility Management Charges (${billingPeriod})`,
          sourceRef: `${project.agreementId} / Contract Rate`,
          amount: baseAmt,
        },
        ...(extra > 0
          ? [
              {
                id: `LI-EX-${Date.now()}`,
                description: 'Approved Additional Services / Consumables',
                sourceRef: 'Approved Variation Order',
                amount: extra,
              },
            ]
          : []),
      ],
      deductions: ded,
      taxableValue,
      cgst,
      sgst,
      igst,
      totalAmount,
      paidAmount: 0,
      tdsAmount: 0,
      creditNoteAmount: 0,
      status: 'Pending Approval',
      financeSmsVerified: false,
    };

    onCreateInvoice(invoice);
    setSelectedId(invoice.id);
    setShowNewModal(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#14263D]">Stage 06 · Contract-Linked Invoicing & GST Billing</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Every invoice line traces directly to an executed agreement or approved variation. Intra/Inter-State GST rules apply automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Generate Contract Invoice
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[#14263D]">Invoice Ledger ({invoices.length})</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => setSelectedId(inv.id)}
                className={`w-full text-left p-4 hover:bg-[#F3F6FA]/70 transition-colors ${
                  active?.id === inv.id ? 'bg-blue-50/50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-[#2463EB]">{inv.invoiceNumber}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                      inv.status === 'Paid' || inv.status === 'Issued'
                        ? 'bg-[#E8F5EE] text-emerald-800'
                        : inv.status === 'Partially Paid'
                        ? 'bg-blue-50 text-[#2463EB]'
                        : 'bg-[#FFF2E5] text-amber-800'
                    }`}
                  >
                    {inv.status}
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-[#14263D]">{inv.clientName}</div>
                <div className="mt-1 flex justify-between text-xs text-slate-500 tabular-nums">
                  <span>{inv.billingPeriod} · Due {inv.dueDate}</span>
                  <span className="font-mono font-semibold text-[#14263D]">{formatInrFull(inv.totalAmount)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {active && (() => {
          const activeClient = clients.find((c) => c.id === active.clientId);
          const activeProject = projects.find((p) => p.id === active.projectId);
          const activeSnapshots = invoiceSnapshots.filter((s) => s.entityId === active.id);
          const invoicePdfName = `${active.invoiceNumber}.pdf`;
          const effectiveIgstRate =
            active.taxableValue > 0
              ? Math.round(((active.cgst + active.sgst + active.igst) / active.taxableValue) * 1000) / 10
              : 18;
          const halfGstLabel = Math.round((effectiveIgstRate / 2) * 10) / 10;

          const handleSaveInvoice = () => {
            onUpdateInvoice({ ...active });
            onSaveInvoiceSnapshot(active, `Saved Tax Invoice ${active.invoiceNumber} (${active.status})`);
            setLastSavedAt(new Date().toISOString());
          };

          const handleDownloadInvoicePdf = () => {
            downloadDocumentPdf({
              filename: invoicePdfName,
              headerBanner: 'FACILITY MANAGEMENT ERP · TAX INVOICE',
              title: active.clientName,
              subtitle: `Invoice ${active.invoiceNumber} · Billing Period ${active.billingPeriod}`,
              metaPairs: [
                ['Invoice No', active.invoiceNumber],
                ['Issue Date', active.issueDate],
                ['Due Date', active.dueDate],
                ['Client GSTIN', active.gstin],
                ['PO Number', active.poNumber],
                ['Place of Supply', active.placeOfSupply],
              ],
              tableTitle: 'Contract-Linked Billing Particulars',
              tableHeaders: ['Description', 'Contract Traceability', 'Amount'],
              tableRows: [
                ...active.lineItems.map((li) => [
                  li.description,
                  li.sourceRef,
                  formatInrFull(li.amount),
                ]),
                ...(active.deductions > 0
                  ? [['Applicable Deductions / SLA Credit', 'Contract SLA', `-${formatInrFull(active.deductions)}`]]
                  : []),
              ],
              summaryRows: [
                ['Taxable Value', formatInrFull(active.taxableValue)],
                ...(active.placeOfSupply === 'Intra-State'
                  ? [
                      [`CGST (${halfGstLabel}%)`, formatInrFull(active.cgst)] as [string, string],
                      [`SGST (${halfGstLabel}%)`, formatInrFull(active.sgst)] as [string, string],
                    ]
                  : [[`IGST (${effectiveIgstRate}%)`, formatInrFull(active.igst)] as [string, string]]),
                ['Invoice Total', formatInrFull(active.totalAmount)],
              ],
              footerNote: `Project: ${activeProject?.code || active.projectId} · Status: ${active.status}`,
            });
          };

          const handleOpenInvoiceEmail = () => {
            onOpenEmailCompose({
              projectId: active.projectId,
              projectCode: activeProject?.code || active.projectId,
              entityType: 'invoice',
              entityId: active.id,
              entityReference: active.invoiceNumber,
              clientId: active.clientId,
              clientName: active.clientName,
              toEmail: activeClient?.email || '',
              subject: `Tax Invoice ${active.invoiceNumber} (${active.billingPeriod}) — ${active.clientName}`,
              body: `Dear ${activeClient?.contactPerson || 'Accounts Payable Team'},\n\nPlease find attached Tax Invoice ${active.invoiceNumber} for the billing period ${active.billingPeriod} against PO ${active.poNumber}.\n\nInvoice Summary:\n- Taxable Value: ${formatInrFull(active.taxableValue)}\n- Total GST (${active.placeOfSupply}): ${formatInrFull(active.cgst + active.sgst + active.igst)}\n- Invoice Total: ${formatInrFull(active.totalAmount)}\n- Due Date: ${active.dueDate}\n\nKindly process payment on or before the due date and share UTR details for reconciliation.\n\nRegards,\nFinance & Billing Desk\nFacility Management ERP`,
              attachmentName: invoicePdfName,
              onDownloadPdf: handleDownloadInvoicePdf,
            });
          };

          return (
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-[#2463EB]" />
                  <span className="font-mono text-xs font-semibold text-[#2463EB]">{active.invoiceNumber}</span>
                </div>
                <h2 className="text-lg font-bold text-[#14263D] mt-1">{active.clientName}</h2>
                <p className="text-xs text-slate-600 font-mono">
                  GSTIN: {active.gstin} · PO: {active.poNumber} · {active.placeOfSupply}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 no-print">
                <DocumentActionBar
                  onSave={handleSaveInvoice}
                  onOpenVersions={() => setShowVersionsModal(true)}
                  onOpenEmail={handleOpenInvoiceEmail}
                  onDownloadPdf={handleDownloadInvoicePdf}
                  versionCount={activeSnapshots.length || 1}
                  lastSavedAt={lastSavedAt}
                />
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-[#14263D] hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </button>
                {!active.financeSmsVerified ? (
                  <button
                    type="button"
                    onClick={() =>
                      onTriggerSmsVerify({
                        title: 'Finance Approval & Issue Invoice via SMS',
                        subtitle: `Authorize ${active.invoiceNumber} (${formatInrFull(active.totalAmount)})`,
                        phone: '+919840123980',
                        recipientName: 'Suresh Iyer (Finance Manager)',
                        purpose: 'invoice_approval',
                        entityType: 'invoice',
                        entityId: active.id,
                        entityLabel: `${active.invoiceNumber} · ${active.clientName}`,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Approve & Issue (SMS OTP)
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[#E8F5EE] px-3 py-2 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Finance SMS Verified
                  </span>
                )}
              </div>
            </div>

            <table className="w-full text-left text-xs border border-slate-200">
              <thead className="bg-[#F3F6FA] text-slate-600">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Line Item Description</th>
                  <th className="px-3 py-2.5 font-semibold">Contract Traceability</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {active.lineItems.map((li) => (
                  <tr key={li.id}>
                    <td className="px-3 py-2.5 font-medium text-[#14263D]">{li.description}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{li.sourceRef}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatInrFull(li.amount)}</td>
                  </tr>
                ))}
                {active.deductions > 0 && (
                  <tr>
                    <td className="px-3 py-2 text-rose-700">Applicable Deductions / SLA Credit</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-500">Contract SLA</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-rose-700">
                      -{formatInrFull(active.deductions)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="rounded-lg border border-slate-200 bg-[#F3F6FA] p-4 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">Taxable Value</span>
                <span className="font-mono font-semibold tabular-nums">{formatInrFull(active.taxableValue)}</span>
              </div>
              {active.placeOfSupply === 'Intra-State' ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-600">CGST ({halfGstLabel}%)</span>
                    <span className="font-mono tabular-nums">{formatInrFull(active.cgst)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">SGST ({halfGstLabel}%)</span>
                    <span className="font-mono tabular-nums">{formatInrFull(active.sgst)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="text-slate-600">IGST ({effectiveIgstRate}%)</span>
                  <span className="font-mono tabular-nums">{formatInrFull(active.igst)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-300 pt-2 text-sm font-bold text-[#14263D]">
                <span>Invoice Total</span>
                <span className="font-mono tabular-nums">{formatInrFull(active.totalAmount)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Client PO Reference</label>
                <input
                  type="text"
                  value={active.poNumber}
                  onChange={(e) => onUpdateInvoice({ ...active, poNumber: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-mono text-[#14263D] focus:border-[#2463EB] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Payment Due Date</label>
                <input
                  type="date"
                  value={active.dueDate}
                  onChange={(e) => onUpdateInvoice({ ...active, dueDate: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-mono text-[#14263D] focus:border-[#2463EB] focus:outline-none"
                />
              </div>
            </div>
          </div>
          );
        })()}
      </div>

      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="bg-[#14263D] px-5 py-4 text-white flex justify-between items-center">
              <h2 className="text-sm font-semibold">Generate Contract-Linked Invoice</h2>
              <button type="button" onClick={() => setShowNewModal(false)} className="text-slate-300 hover:text-white">
                ×
              </button>
            </div>
            <form onSubmit={handleGenerateInvoice} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Active Project</label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.clientName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Billing Period</label>
                  <input
                    type="text"
                    value={billingPeriod}
                    onChange={(e) => setBillingPeriod(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Place of Supply</label>
                  <select
                    value={placeOfSupply}
                    onChange={(e) => setPlaceOfSupply(e.target.value as 'Intra-State' | 'Inter-State')}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    <option value="Intra-State">Intra-State (CGST+SGST)</option>
                    <option value="Inter-State">Inter-State (IGST)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Client PO Number</label>
                  <input
                    type="text"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Approved Extra Charges (₹)</label>
                  <input
                    type="number"
                    value={extraAmount}
                    onChange={(e) => setExtraAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contract Deductions (₹)</label>
                  <input
                    type="number"
                    value={deductions}
                    onChange={(e) => setDeductions(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#2463EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Create Draft Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {active && (
        <VersionsModal
          isOpen={showVersionsModal}
          onClose={() => setShowVersionsModal(false)}
          title={`Invoice Revision History · ${active.invoiceNumber}`}
          subtitle={`${active.clientName} · ${active.billingPeriod}`}
          mode="snapshot"
          snapshots={invoiceSnapshots.filter((s) => s.entityId === active.id)}
          onCreateSnapshot={(note) => {
            onSaveInvoiceSnapshot(active, note);
            setLastSavedAt(new Date().toISOString());
          }}
        />
      )}
    </div>
  );
};
