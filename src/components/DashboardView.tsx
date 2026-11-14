import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Briefcase,
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  FileCheck2,
  FileSignature,
  FileText,
  IndianRupee,
  Receipt,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { HISTORICAL_REVENUE_SERIES } from '../data/seedData';
import type {
  AgreementRecord,
  ClientRecord,
  InvoiceRecord,
  LoiRecord,
  NavModuleId,
  ProjectRecord,
  ProposalRecord,
  SmsVerificationStats,
} from '../types/erp';
import { formatInrCompact, formatInrFull } from '../utils/formatters';
import { DashboardQrWidget } from './DashboardQrWidget';

interface DashboardViewProps {
  userName: string;
  clients: ClientRecord[];
  proposals: ProposalRecord[];
  lois: LoiRecord[];
  agreements: AgreementRecord[];
  projects: ProjectRecord[];
  invoices: InvoiceRecord[];
  smsStats: SmsVerificationStats;
  onNavigate: (tab: NavModuleId) => void;
  onOpenProjectSite: (projectId: string) => void;
  onOpenSmsInbox: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  userName,
  clients,
  proposals,
  lois,
  agreements,
  projects,
  invoices,
  smsStats,
  onNavigate,
  onOpenProjectSite,
  onOpenSmsInbox,
}) => {
  const [periodFilter, setPeriodFilter] = useState<'all' | 'fy26' | 'fy25'>('all');
  const [chartGranularity, setChartGranularity] = useState<'monthly' | 'quarterly' | 'live'>('monthly');
  const [hoveredBarKey, setHoveredBarKey] = useState<string | null>(null);

  // Reconcile 100% live KPIs from ERP state (zero inflated placeholder offsets)
  const metrics = useMemo(() => {
    const verifiedClients = clients.filter((c) => c.mobileVerified).length;
    const activatedProjects = projects.filter((p) => p.closingStatus === 'Project Activated').length;
    const totalManpower = projects.reduce((sum, p) => sum + p.approvedManpower, 0);

    const activeProposals = proposals.filter((p) => {
      const cur = p.versions.find((v) => v.version === p.currentVersion);
      return cur && cur.status !== 'Rejected' && cur.status !== 'Superseded';
    });
    const approvedProposals = proposals.filter((p) => {
      const cur = p.versions.find((v) => v.version === p.currentVersion);
      return cur?.status === 'Approved';
    }).length;

    const pendingLois = lois.filter((l) => l.status !== 'Accepted' && l.status !== 'Rejected').length;
    const executedAgreements = agreements.filter((a) => a.status === 'Executed').length;

    const contractPortfolioValue =
      agreements.reduce((sum, a) => sum + a.annualValue, 0) +
      projects
        .filter((p) => !agreements.some((a) => a.id === p.agreementId))
        .reduce((sum, p) => sum + p.annualValue, 0);

    const invoicedTotal = invoices.reduce((sum, i) => sum + i.totalAmount, 0);
    const receivedTotal = invoices.reduce((sum, i) => sum + i.paidAmount, 0);
    const tdsTotal = invoices.reduce((sum, i) => sum + i.tdsAmount, 0);
    const outstandingTotal = Math.max(0, invoicedTotal - receivedTotal - tdsTotal);
    const collectionRatio =
      invoicedTotal > 0 ? Math.round(((receivedTotal + tdsTotal) / invoicedTotal) * 100) : 0;

    return {
      totalClients: clients.length,
      verifiedClients,
      totalProjects: projects.length,
      activatedProjects,
      totalManpower,
      activeProposalsCount: activeProposals.length,
      approvedProposals,
      pendingLoisCount: pendingLois,
      totalLoisCount: lois.length,
      totalAgreementsCount: agreements.length,
      executedAgreements,
      contractPortfolioValue,
      invoicedTotal,
      receivedTotal,
      tdsTotal,
      outstandingTotal,
      collectionRatio,
    };
  }, [clients, proposals, lois, agreements, projects, invoices]);

  // Live pipeline breakdown across actual ERP records
  const pipelineSegments = useMemo(() => {
    const proposalStage = proposals.length;
    const loiStage = lois.length;
    const agreementStage = agreements.length;
    const handoverStage = projects.filter((p) => p.closingStatus !== 'Project Activated').length;
    const operationsStage = projects.filter((p) => p.closingStatus === 'Project Activated').length;

    return [
      { label: 'Proposals', count: proposalStage, color: '#2463EB' },
      { label: 'LOIs', count: loiStage, color: '#059669' },
      { label: 'Agreements', count: agreementStage, color: '#D97706' },
      { label: 'Handover', count: handoverStage, color: '#7C3AED' },
      { label: 'Operations', count: operationsStage, color: '#0284C7' },
    ];
  }, [proposals.length, lois.length, agreements.length, projects]);

  const pipelineTotal = Math.max(
    1,
    pipelineSegments.reduce((sum, seg) => sum + seg.count, 0)
  );

  // Chart data with genuine scale (Lakhs / Crores)
  const revenueBars = useMemo(() => {
    if (chartGranularity === 'live') {
      return invoices.map((inv) => ({
        key: inv.id,
        label: inv.invoiceNumber,
        invoicedVal: Number((inv.totalAmount / 100000).toFixed(2)), // Lakhs
        receivedVal: Number(((inv.paidAmount + inv.tdsAmount) / 100000).toFixed(2)),
        unit: 'L',
      }));
    }
    if (chartGranularity === 'quarterly') {
      return [
        { key: 'Q2-FY25', label: 'Q2 FY25', invoicedVal: 4.18, receivedVal: 3.44, unit: 'Cr' },
        { key: 'Q3-FY25', label: 'Q3 FY25', invoicedVal: 5.87, receivedVal: 4.82, unit: 'Cr' },
        {
          key: 'CURR',
          label: 'Active Cycle',
          invoicedVal: Number((metrics.invoicedTotal / 10000000).toFixed(2)),
          receivedVal: Number((metrics.receivedTotal / 10000000).toFixed(2)),
          unit: 'Cr',
        },
      ];
    }
    return HISTORICAL_REVENUE_SERIES.map((d) => ({
      key: d.month,
      label: d.month,
      invoicedVal: d.invoicedCr,
      receivedVal: d.receivedCr,
      unit: 'Cr',
    }));
  }, [chartGranularity, invoices, metrics.invoicedTotal, metrics.receivedTotal]);

  const chartUnit = revenueBars[0]?.unit || 'Cr';
  const rawMax = Math.max(...revenueBars.map((b) => Math.max(b.invoicedVal, b.receivedVal)), 1);
  const yMax = chartUnit === 'L' ? Math.ceil(rawMax / 5) * 5 : Math.ceil(rawMax * 2) / 2;
  const yTicks = [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0];

  const totalBarInvoiced = revenueBars.reduce((s, b) => s + b.invoicedVal, 0);
  const totalBarReceived = revenueBars.reduce((s, b) => s + b.receivedVal, 0);
  const barCollectionPct =
    totalBarInvoiced > 0 ? Math.round((totalBarReceived / totalBarInvoiced) * 100) : 0;

  // Dynamic Recent Operations Feed built from actual ERP records
  const liveFeed = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      meta: string;
      icon: React.FC<{ className?: string }>;
      tone: string;
      target: NavModuleId;
    }> = [];

    if (proposals[0]) {
      const p0 = proposals[0];
      const v0 = p0.versions.find((v) => v.version === p0.currentVersion) || p0.versions[0];
      const c0 = clients.find((c) => c.id === p0.clientId);
      items.push({
        id: p0.id,
        title: `${p0.reference} · ${c0?.companyName || p0.siteName}`,
        meta: `${v0.version} (${v0.status}) · ${formatInrFull(v0.monthlySellingPrice)}/mo`,
        icon: FileText,
        tone: 'bg-blue-50 text-[#2463EB]',
        target: 'proposals',
      });
    }

    if (lois[0]) {
      const l0 = lois[0];
      items.push({
        id: l0.id,
        title: `${l0.reference} · ${l0.clientName}`,
        meta: `${l0.status} · ${l0.paymentTerms}`,
        icon: FileCheck2,
        tone: 'bg-emerald-50 text-emerald-700',
        target: 'loi',
      });
    }

    const pendingAgreement = agreements.find((a) => a.status !== 'Executed') || agreements[0];
    if (pendingAgreement) {
      items.push({
        id: pendingAgreement.id,
        title: `${pendingAgreement.reference} · ${pendingAgreement.clientName}`,
        meta: `${pendingAgreement.status} · ${formatInrCompact(pendingAgreement.annualValue)}/yr`,
        icon: FileSignature,
        tone: 'bg-amber-50 text-amber-700',
        target: 'agreements',
      });
    }

    const pendingInvoice = invoices.find((i) => i.status !== 'Paid') || invoices[0];
    if (pendingInvoice) {
      items.push({
        id: pendingInvoice.id,
        title: `${pendingInvoice.invoiceNumber} · ${pendingInvoice.clientName}`,
        meta: `${pendingInvoice.status} · Due ${pendingInvoice.dueDate}`,
        icon: Receipt,
        tone: 'bg-slate-100 text-slate-700',
        target: 'invoicing',
      });
    }

    return items;
  }, [proposals, clients, lois, agreements, invoices]);

  // Dynamic Schedule / Due Dates pulled from real records
  const upcomingDates = useMemo(() => {
    const rows: Array<{
      id: string;
      event: string;
      entity: string;
      date: string;
      target: NavModuleId;
    }> = [];

    proposals.slice(0, 2).forEach((p) => {
      const c = clients.find((cl) => cl.id === p.clientId);
      rows.push({
        id: `due-${p.id}`,
        event: 'Proposal Validity',
        entity: c?.companyName || p.siteName,
        date: p.validityDate,
        target: 'proposals',
      });
    });

    projects
      .filter((p) => p.closingStatus !== 'Project Activated')
      .slice(0, 1)
      .forEach((p) => {
        rows.push({
          id: `due-${p.id}`,
          event: 'Site Mobilization',
          entity: p.clientName,
          date: p.mobilizationDate,
          target: 'projects',
        });
      });

    invoices
      .filter((i) => i.status !== 'Paid')
      .slice(0, 2)
      .forEach((inv) => {
        rows.push({
          id: `due-${inv.id}`,
          event: `Invoice ${inv.invoiceNumber}`,
          entity: inv.clientName,
          date: inv.dueDate,
          target: 'invoicing',
        });
      });

    return rows.slice(0, 4);
  }, [proposals, clients, projects, invoices]);

  const kpiCards = [
    {
      label: 'Clients',
      value: String(metrics.totalClients),
      sub: `${metrics.verifiedClients} SMS verified`,
      icon: Users,
      iconBg: 'bg-blue-50 text-[#2463EB]',
      target: 'clients' as NavModuleId,
    },
    {
      label: 'Active Sites',
      value: String(metrics.totalProjects),
      sub: `${metrics.totalManpower} deployed staff`,
      icon: Briefcase,
      iconBg: 'bg-emerald-50 text-emerald-700',
      target: 'projects' as NavModuleId,
    },
    {
      label: 'Proposals',
      value: String(metrics.activeProposalsCount),
      sub: `${metrics.approvedProposals} approved`,
      icon: FileText,
      iconBg: 'bg-amber-50 text-amber-700',
      target: 'proposals' as NavModuleId,
    },
    {
      label: 'Open LOIs',
      value: String(metrics.pendingLoisCount),
      sub: `${metrics.totalLoisCount} total issued`,
      icon: FileCheck2,
      iconBg: 'bg-indigo-50 text-indigo-700',
      target: 'loi' as NavModuleId,
    },
    {
      label: 'Agreements',
      value: String(metrics.totalAgreementsCount),
      sub: `${metrics.executedAgreements} executed`,
      icon: FileSignature,
      iconBg: 'bg-sky-50 text-sky-700',
      target: 'agreements' as NavModuleId,
    },
    {
      label: 'Contract Book',
      value: formatInrCompact(metrics.contractPortfolioValue),
      sub: 'Annualized value',
      icon: IndianRupee,
      iconBg: 'bg-emerald-50 text-emerald-700',
      target: 'reports' as NavModuleId,
    },
  ];

  // Crisp compact SVG Donut geometry (never clips)
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let cumulativeFraction = 0;

  return (
    <div className="space-y-5">
      {/* Operational Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#14263D]">
            Operations & Commercial Control Desk
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Signed in as <span className="font-semibold text-[#14263D]">{userName}</span> · Reconciled live across Clients, Cost Sheets, LOIs, Sites & Billing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('sms')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-[#14263D] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="tabular-nums">
              SMS Verified: {smsStats.totalVerified}/{smsStats.totalDispatched}
            </span>
          </button>
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as 'all' | 'fy26' | 'fy25')}
              aria-label="Select reporting cycle"
              className="bg-transparent text-xs font-medium text-[#14263D] focus:outline-none"
            >
              <option value="all">All Active Cycles</option>
              <option value="fy26">FY 2026–27 (Current)</option>
              <option value="fy25">FY 2025–26</option>
            </select>
          </div>
        </div>
      </div>

      {/* 6 Reconciled KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => onNavigate(card.target)}
              className="group text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-[#2463EB]/60 transition-colors focus-visible:outline-2 focus-visible:outline-[#2463EB]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${card.iconBg}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-[#2463EB] transition-colors" />
              </div>
              <div className="mt-3 text-xl font-bold text-[#14263D] tabular-nums truncate">
                {card.value}
              </div>
              <div className="text-xs font-medium text-slate-700 truncate">{card.label}</div>
              <div className="mt-1 text-[11px] text-slate-500 tabular-nums truncate">{card.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Middle Row: Revenue Overview + Project Pipeline + Billing Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Revenue & Collection Chart with Real Y-Axis & Gridlines */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#14263D]">Billing & Collection Trend</h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-600 tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-xs bg-[#2463EB]" />
                  Invoiced ({totalBarInvoiced.toFixed(2)} {chartUnit})
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-xs bg-[#16A34A]" />
                  Received ({barCollectionPct}%)
                </span>
              </div>
            </div>
            <div className="inline-flex rounded-lg bg-[#F3F6FA] p-0.5 border border-slate-200">
              {(
                [
                  { id: 'monthly', label: 'Monthly' },
                  { id: 'quarterly', label: 'Quarterly' },
                  { id: 'live', label: 'Live Bills' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setChartGranularity(tab.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    chartGranularity === tab.id
                      ? 'bg-white text-[#14263D] shadow-xs'
                      : 'text-slate-600 hover:text-[#14263D]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2.5 pt-2">
            {/* Y-Axis Labels */}
            <div className="flex flex-col justify-between h-44 text-[10px] font-mono text-slate-400 tabular-nums text-right pr-1 shrink-0 select-none pb-0.5">
              {yTicks.map((tick) => (
                <span key={tick}>
                  {tick === 0 ? '0' : `₹${tick.toFixed(chartUnit === 'L' ? 0 : 1)}${chartUnit}`}
                </span>
              ))}
            </div>

            {/* Plot Area */}
            <div className="flex-1 min-w-0">
              <div className="relative h-44 flex items-end justify-between gap-2 border-b border-l border-slate-200 px-2">
                {/* Horizontal Dashed Reference Lines */}
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                  {yTicks.slice(0, -1).map((tick) => (
                    <div key={tick} className="w-full border-t border-dashed border-slate-100" />
                  ))}
                  <div />
                </div>

                {revenueBars.map((bar) => {
                  const invPct = Math.max(4, Math.min(100, (bar.invoicedVal / yMax) * 100));
                  const recPct = Math.max(2, Math.min(100, (bar.receivedVal / yMax) * 100));
                  const isHovered = hoveredBarKey === bar.key;

                  return (
                    <div
                      key={bar.key}
                      onMouseEnter={() => setHoveredBarKey(bar.key)}
                      onMouseLeave={() => setHoveredBarKey(null)}
                      className="relative z-10 flex-1 h-full flex items-end justify-center group"
                    >
                      {isHovered && (
                        <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded border border-slate-700 bg-[#14263D] px-2 py-1 text-[10px] font-mono text-white shadow-md tabular-nums">
                          Inv ₹{bar.invoicedVal}{bar.unit} · Rec ₹{bar.receivedVal}{bar.unit}
                        </div>
                      )}
                      <div className="flex items-end gap-1 h-full pb-px">
                        <div
                          style={{ height: `${invPct}%` }}
                          className="w-3 sm:w-4 rounded-t-[2px] bg-[#2463EB] transition-opacity group-hover:opacity-85"
                        />
                        <div
                          style={{ height: `${recPct}%` }}
                          className="w-3 sm:w-4 rounded-t-[2px] bg-[#16A34A] transition-opacity group-hover:opacity-85"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between gap-2 pt-2 px-2">
                {revenueBars.map((bar) => (
                  <div
                    key={bar.key}
                    className="flex-1 text-center text-[10px] font-medium text-slate-500 tabular-nums truncate"
                  >
                    {bar.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Project Pipeline (Responsive Layout — Zero Overflow) */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#14263D]">Commercial Pipeline</h2>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="text-xs font-medium text-[#2463EB] hover:underline"
            >
              View Sites
            </button>
          </div>
          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-4">
            <div className="relative h-28 w-28 shrink-0">
              <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90">
                {pipelineSegments.map((seg) => {
                  const fraction = seg.count / pipelineTotal;
                  const dash = fraction * circumference;
                  const offset = -cumulativeFraction * circumference;
                  cumulativeFraction += fraction;
                  return (
                    <circle
                      key={seg.label}
                      cx="56"
                      cy="56"
                      r={radius}
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="15"
                      strokeDasharray={`${dash} ${circumference}`}
                      strokeDashoffset={offset}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-lg font-bold text-[#14263D] tabular-nums leading-none">
                  {pipelineTotal}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">Records</span>
              </div>
            </div>

            <div className="w-full min-w-0 flex-1 space-y-2">
              {pipelineSegments.map((seg) => {
                const pct = Math.round((seg.count / pipelineTotal) * 100);
                return (
                  <div key={seg.label} className="flex items-center justify-between gap-2 text-xs min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2 w-2 rounded-xs shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="font-medium text-slate-700 truncate">{seg.label}</span>
                    </div>
                    <div className="flex items-center gap-2 tabular-nums shrink-0">
                      <span className="text-slate-500">({seg.count})</span>
                      <span className="w-9 text-right font-semibold text-[#14263D]">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Invoices & Collections (Reconciled Live Ledger) */}
        <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#14263D]">Receivables Ledger</h2>
              <button
                type="button"
                onClick={() => onNavigate('payments')}
                className="text-xs font-medium text-[#2463EB] hover:underline"
              >
                Payments
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#2463EB] shrink-0">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#14263D] tabular-nums truncate">
                      {formatInrFull(metrics.invoicedTotal)}
                    </div>
                    <div className="text-[11px] text-slate-500">Total Billed ({invoices.length} bills)</div>
                  </div>
                </div>
              </div>

              <div className="py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#14263D] tabular-nums truncate">
                      {formatInrFull(metrics.receivedTotal)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Collected · {metrics.collectionRatio}% settled
                    </div>
                  </div>
                </div>
              </div>

              <div className="py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700 shrink-0">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#14263D] tabular-nums truncate">
                      {formatInrFull(metrics.outstandingTotal)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Net Outstanding (TDS {formatInrCompact(metrics.tdsTotal)})
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenSmsInbox}
            className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-200 bg-[#F3F6FA] px-3 py-2 text-xs font-medium text-[#14263D] hover:bg-slate-100 transition-colors"
          >
            <span className="truncate tabular-nums">
              SMS Inbox ({smsStats.pendingVerification} pending verification)
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
          </button>
        </div>
      </div>

      {/* Bottom Row: Live Operations Queue + Upcoming Dates + Stage Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Live Record Queue */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#14263D]">Active Commercial Records</h2>
            <button
              type="button"
              onClick={() => onNavigate('proposals')}
              className="text-xs font-medium text-[#2463EB] hover:underline"
            >
              Proposals
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {liveFeed.map((act) => {
              const Icon = act.icon;
              return (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => onNavigate(act.target)}
                  className="w-full py-2.5 flex items-start gap-3 text-left hover:bg-[#F3F6FA]/70 rounded-lg px-1.5 transition-colors"
                >
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md shrink-0 mt-0.5 ${act.tone}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#14263D] leading-snug truncate">
                      {act.title}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">{act.meta}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Upcoming Milestones & Due Dates */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#14263D]">Scheduled Deadlines</h2>
            <button
              type="button"
              onClick={() => onNavigate('invoicing')}
              className="text-xs font-medium text-[#2463EB] hover:underline"
            >
              Billing Schedule
            </button>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 font-medium">Milestone</th>
                <th className="py-2 font-medium">Client</th>
                <th className="py-2 font-medium text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {upcomingDates.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => onNavigate(item.target)}
                  className="cursor-pointer hover:bg-[#F3F6FA] transition-colors"
                >
                  <td className="py-2.5 font-medium text-[#14263D] truncate max-w-[110px]">
                    {item.event}
                  </td>
                  <td className="py-2.5 text-slate-600 truncate max-w-[130px]">{item.entity}</td>
                  <td className="py-2.5 text-right font-mono text-[11px] font-medium text-slate-700 tabular-nums whitespace-nowrap">
                    {item.date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Stage Distribution */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#14263D]">Workflow Stage Distribution</h2>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="text-xs font-medium text-[#2463EB] hover:underline"
            >
              Site Handover
            </button>
          </div>
          <div className="space-y-3.5 pt-1">
            {[
              { label: 'In Operations', count: pipelineSegments[4].count, color: 'bg-[#0284C7]' },
              { label: 'Handover', count: pipelineSegments[3].count, color: 'bg-[#7C3AED]' },
              { label: 'Agreements', count: pipelineSegments[2].count, color: 'bg-[#D97706]' },
              { label: 'LOIs', count: pipelineSegments[1].count, color: 'bg-[#059669]' },
              { label: 'Proposals', count: pipelineSegments[0].count, color: 'bg-[#2463EB]' },
            ].map((row) => {
              const pct = Math.round((row.count / pipelineTotal) * 100);
              return (
                <div key={row.label} className="grid grid-cols-12 items-center gap-2.5 text-xs">
                  <span className="col-span-4 font-medium text-slate-700 truncate">{row.label}</span>
                  <div className="col-span-5 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="col-span-3 text-right font-mono text-[11px] font-semibold text-[#14263D] tabular-nums">
                    {row.count} / {pipelineTotal}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              {metrics.totalManpower} Approved Site Personnel
            </span>
            <button
              type="button"
              onClick={() => onNavigate('proposals')}
              className="font-medium text-[#2463EB] hover:underline"
            >
              New Proposal
            </button>
          </div>
        </div>
      </div>

      {/* Site-Specific Quick-Access Field QR Portal */}
      <DashboardQrWidget projects={projects} onOpenSitePortal={onOpenProjectSite} />
    </div>
  );
};
