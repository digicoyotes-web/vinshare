import React, { useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import type {
  AgreementRecord,
  ClientRecord,
  InvoiceRecord,
  LoiRecord,
  ProjectRecord,
  ProposalRecord,
} from '../types/erp';
import { downloadCsv, formatInrFull } from '../utils/formatters';

interface ReportsAnalyticsViewProps {
  clients: ClientRecord[];
  proposals: ProposalRecord[];
  lois: LoiRecord[];
  agreements: AgreementRecord[];
  projects: ProjectRecord[];
  invoices: InvoiceRecord[];
}

export const ReportsAnalyticsView: React.FC<ReportsAnalyticsViewProps> = ({
  clients,
  proposals,
  lois,
  agreements,
  projects,
  invoices,
}) => {
  const [dept, setDept] = useState<'Sales' | 'Estimation' | 'Contracts' | 'Operations' | 'Finance'>('Sales');

  const handleExportReport = () => {
    if (dept === 'Finance') {
      downloadCsv(
        'finance-billing-report.csv',
        ['Invoice', 'Client', 'Period', 'Taxable', 'Total', 'Paid', 'Status'],
        invoices.map((i) => [
          i.invoiceNumber,
          i.clientName,
          i.billingPeriod,
          i.taxableValue,
          i.totalAmount,
          i.paidAmount,
          i.status,
        ])
      );
      return;
    }
    if (dept === 'Estimation') {
      downloadCsv(
        'estimation-costing-report.csv',
        ['Proposal', 'Industry', 'Version', 'Monthly Cost', 'Selling Price', 'Margin %', 'Status'],
        proposals.map((p) => {
          const v = p.versions[p.versions.length - 1];
          return [
            p.reference,
            p.industry,
            v.version,
            v.totalOperatingCost,
            v.monthlySellingPrice,
            v.grossMarginPct,
            v.status,
          ];
        })
      );
      return;
    }
    downloadCsv(
      `${dept.toLowerCase()}-erp-report.csv`,
      ['ID', 'Client', 'Sector', 'Mobile Verified', 'Status'],
      clients.map((c) => [c.id, c.companyName, c.industry, c.mobileVerified ? 'Yes' : 'No', c.status])
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#14263D]">Department Reports & Analytics</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Live department metrics reconciled with ERP source records across Sales, Estimation, Contracts, Operations, and Finance.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportReport}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#14263D] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <Download className="h-3.5 w-3.5" />
          Export {dept} CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-2 w-fit">
        {(['Sales', 'Estimation', 'Contracts', 'Operations', 'Finance'] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDept(d)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              dept === d ? 'bg-[#2463EB] text-white' : 'text-slate-600 hover:bg-[#F3F6FA]'
            }`}
          >
            {d} Report
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
          <BarChart3 className="h-4 w-4 text-[#2463EB]" />
          <h2 className="text-sm font-semibold text-[#14263D]">{dept} Performance Summary</h2>
        </div>

        {dept === 'Sales' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F3F6FA] text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">Client</th>
                <th className="px-3 py-2 font-semibold">Sector</th>
                <th className="px-3 py-2 font-semibold">Contact Mobile</th>
                <th className="px-3 py-2 font-semibold">SMS Verification</th>
                <th className="px-3 py-2 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2.5 font-semibold text-[#14263D]">{c.companyName}</td>
                  <td className="px-3 py-2.5 text-slate-600">{c.industry}</td>
                  <td className="px-3 py-2.5 font-mono">{c.mobile}</td>
                  <td className="px-3 py-2.5">{c.mobileVerified ? 'Verified' : 'Pending'}</td>
                  <td className="px-3 py-2.5 text-right">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {dept === 'Estimation' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F3F6FA] text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">Proposal</th>
                <th className="px-3 py-2 font-semibold">Version</th>
                <th className="px-3 py-2 font-semibold text-right">Monthly Cost</th>
                <th className="px-3 py-2 font-semibold text-right">Monthly Price</th>
                <th className="px-3 py-2 font-semibold text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {proposals.map((p) => {
                const v = p.versions[p.versions.length - 1];
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2.5 font-semibold text-[#14263D]">{p.reference}</td>
                    <td className="px-3 py-2.5 font-mono">{v.version}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatInrFull(v.totalOperatingCost)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatInrFull(v.monthlySellingPrice)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700">{v.grossMarginPct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {dept === 'Contracts' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F3F6FA] text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">Document</th>
                <th className="px-3 py-2 font-semibold">Client</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold text-right">Annual Value</th>
                <th className="px-3 py-2 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lois.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2.5 font-mono font-semibold text-[#2463EB]">{l.reference}</td>
                  <td className="px-3 py-2.5 text-[#14263D]">{l.clientName}</td>
                  <td className="px-3 py-2.5">LOI</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatInrFull(l.loiValueAnnual)}</td>
                  <td className="px-3 py-2.5 text-right">{l.status}</td>
                </tr>
              ))}
              {agreements.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2.5 font-mono font-semibold text-[#14263D]">{a.reference}</td>
                  <td className="px-3 py-2.5 text-[#14263D]">{a.clientName}</td>
                  <td className="px-3 py-2.5">Agreement</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatInrFull(a.annualValue)}</td>
                  <td className="px-3 py-2.5 text-right">{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {dept === 'Operations' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F3F6FA] text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">Project Code</th>
                <th className="px-3 py-2 font-semibold">Client & Site</th>
                <th className="px-3 py-2 font-semibold">Ops Manager</th>
                <th className="px-3 py-2 font-semibold text-right">Manpower</th>
                <th className="px-3 py-2 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2.5 font-mono font-semibold text-[#2463EB]">{p.code}</td>
                  <td className="px-3 py-2.5 text-[#14263D]">{p.clientName} · {p.siteName}</td>
                  <td className="px-3 py-2.5">{p.opsManager}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{p.approvedManpower}</td>
                  <td className="px-3 py-2.5 text-right">{p.closingStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {dept === 'Finance' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F3F6FA] text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">Invoice</th>
                <th className="px-3 py-2 font-semibold">Client</th>
                <th className="px-3 py-2 font-semibold text-right">Total Billed</th>
                <th className="px-3 py-2 font-semibold text-right">Settled</th>
                <th className="px-3 py-2 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2.5 font-mono font-semibold text-[#2463EB]">{i.invoiceNumber}</td>
                  <td className="px-3 py-2.5 text-[#14263D]">{i.clientName}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatInrFull(i.totalAmount)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700">{formatInrFull(i.paidAmount)}</td>
                  <td className="px-3 py-2.5 text-right">{i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
