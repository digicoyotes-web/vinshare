import React, { useMemo, useState } from 'react';
import {
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
  TrendingUp,
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
import { formatInrCompact } from '../utils/formatters';
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
  const [periodFilter, setPeriodFilter] = useState<'month' | 'quarter' | 'fy'>('month');
  const [chartGranularity, setChartGranularity] = useState<'monthly' | 'quarterly'>('monthly');
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  // Reconcile live KPI values from ERP source records + baseline historical portfolio
  const metrics = useMemo(() => {
    const baseClientOffset = 122; // + 6 seeded = 128 matching portfolio scale
    const totalClients = baseClientOffset + clients.length;

    const baseProjectOffset = 40; // + 2 seeded = 42
    const totalProjects = baseProjectOffset + projects.length;

    const activeProposalsCount =
      16 +
      proposals.filter((p) => {
        const cur = p.versions.find((v) => v.version === p.currentVersion);
        return cur && cur.status !== 'Rejected' && cur.status !== 'Superseded';
      }).length;

    const pendingLoisCount =
      6 + lois.filter((l) => l.status !== 'Accepted' && l.status !== 'Rejected').length;

    const signedAgreementsCount =
      34 + agreements.filter((a) => a.status === 'Executed').length;

    const activeContractValue =
      102450000 +
      agreements.reduce((sum, a) => sum + (a.status === 'Executed' ? a.annualValue : 0), 0) +
      projects.reduce((sum, p) => sum + (p.closingStatus === 'Project Activated' ? p.annualValue * 0.2 : 0), 0);

    const liveInvoiced = invoices.reduce((sum, i) => sum + i.totalAmount, 0);
    const livePaid = invoices.reduce((sum, i) => sum + i.paidAmount, 0);
    const invoicedThisMonth = 22926133 + liveInvoiced; // ~2.86 Cr
    const receivedThisMonth = 20280833 + livePaid; // ~2.31 Cr
    const outstandingAmount = Math.max(0, invoicedThisMonth - receivedThisMonth);

    return {
      totalClients,
      totalProjects,
      activeProposalsCount,
      pendingLoisCount,
      signedAgreementsCount,
      activeContractValue,
      invoicedThisMonth,
      receivedThisMonth,
      outstandingAmount,
    };
  }, [clients, proposals, lois, agreements, projects, invoices]);

  const pipelineSegments = [
    { label: 'Proposal', count: 6 + proposals.length, color: '#2463EB' },
    { label: 'LOI', count: 3 + lois.length, color: '#16A34A' },
    { label: 'Agreement', count: 2 + agreements.length, color: '#F59E0B' },
    { label: 'Handover', count: 2 + projects.filter((p) => p.closingStatus !== 'Project Activated').length, color: '#7C3AED' },
    { label: 'Operations', count: 21 + projects.filter((p) => p.closingStatus === 'Project Activated').length, color: '#38BDF8' },
  ];
  const pipelineTotal = pipelineSegments.reduce((s, x) => s + x.count, 0);

  const revenueBars =
    chartGranularity === 'monthly'
      ? HISTORICAL_REVENUE_SERIES
      : [
          { month: 'Q2 FY25', invoicedCr: 4.18, receivedCr: 3.44 },
          { month: 'Q3 FY25', invoicedCr: 5.87, receivedCr: 4.82 },
        ];

  const maxRev = Math.max(...revenueBars.map((r) => Math.max(r.invoicedCr, r.receivedCr)), 2.5);

  const recentActivities = [
    {
      title: 'Agreement signed with Urban Square Facilities',
      meta: 'Contract value: ₹ 1.85 Cr · 10 mins ago',
      icon: FileSignature,
      tone: 'bg-[#E8F5EE] text-emerald-700',
      target: 'agreements' as NavModuleId,
    },
    {
      title: 'LOI received from Apex Business Park',
      meta: 'Estimated value: ₹ 0.92 Cr · SMS awaiting verification',
      icon: FileCheck2,
      tone: 'bg-blue-50 text-[#2463EB]',
      target: 'loi' as NavModuleId,
    },
    {
      title: 'Proposal revised for Greenfield Estates',
      meta: 'Revision V2 · Pending approval',
      icon: FileText,
      tone: 'bg-[#FFF2E5] text-amber-700',
      target: 'attrition' as NavModuleId,
    },
    {
      title: 'Invoice INV-01458 generated for Metro Corporate Tower',
      meta: 'Amount: ₹ 24.80 L · Finance SMS verified',
      icon: Receipt,
      tone: 'bg-slate-100 text-slate-700',
      target: 'invoicing' as NavModuleId,
    },
  ];

  const upcomingDates = [
    { event: 'Proposal Validity', entity: 'Apex Business Park', date: 'Jan 18, 2025', target: 'proposals' as NavModuleId },
    { event: 'Agreement Renewal', entity: 'Sunrise Hospitals', date: 'Jan 25, 2025', target: 'agreements' as NavModuleId },
    { event: 'Invoice Due', entity: 'Metro Corporate Tower', date: 'Jan 28, 2025', target: 'invoicing' as NavModuleId },
    { event: 'Project Handover', entity: 'Riverside Resort', date: 'Feb 03, 2025', target: 'projects' as NavModuleId },
  ];

  const kpiCards = [
    {
      label: 'Total Clients',
      value: String(metrics.totalClients),
      delta: '+8% vs last month',
      positive: true,
      icon: Users,
      iconBg: 'bg-blue-50 text-[#2463EB]',
      target: 'clients' as NavModuleId,
    },
    {
      label: 'Total Projects',
      value: String(metrics.totalProjects),
      delta: '+12% vs last month',
      positive: true,
      icon: Briefcase,
      iconBg: 'bg-[#E8F5EE] text-emerald-700',
      target: 'projects' as NavModuleId,
    },
    {
      label: 'Active Proposals',
      value: String(metrics.activeProposalsCount),
      delta: '+20% vs last month',
      positive: true,
      icon: FileText,
      iconBg: 'bg-[#FFF2E5] text-amber-700',
      target: 'proposals' as NavModuleId,
    },
    {
      label: 'Pending LOIs',
      value: String(metrics.pendingLoisCount),
      delta: '-13% vs last month',
      positive: false,
      icon: FileCheck2,
      iconBg: 'bg-indigo-50 text-indigo-700',
      target: 'loi' as NavModuleId,
    },
    {
      label: 'Agreements Signed',
      value: String(metrics.signedAgreementsCount),
      delta: '+17% vs last month',
      positive: true,
      icon: FileSignature,
      iconBg: 'bg-sky-50 text-sky-700',
      target: 'agreements' as NavModuleId,
    },
    {
      label: 'Total Contract Value',
      value: formatInrCompact(metrics.activeContractValue),
      delta: '+22% vs last month',
      positive: true,
      icon: IndianRupee,
      iconBg: 'bg-[#E8F5EE] text-emerald-700',
      target: 'reports' as NavModuleId,
    },
  ];

  // Build SVG Donut arcs
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let cumulativeFraction = 0;

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#14263D]">
            Welcome Back, {userName}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Live commercial, operational, and SMS-verified financial summary across all six ERP stages.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('sms')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-[#14263D] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span className="tabular-nums">
              SMS Verified: {smsStats.totalVerified} / {smsStats.totalDispatched}
            </span>
          </button>
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <Calendar className="h-4 w-4 text-slate-500" />
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as 'month' | 'quarter' | 'fy')}
              aria-label="Select dashboard reporting period"
              className="bg-transparent text-xs font-medium text-[#14263D] focus:outline-none"
            >
              <option value="month">This Month (Jan 01 – Jan 31, 2025)</option>
              <option value="quarter">Quarter (Nov 2024 – Jan 2025)</option>
              <option value="fy">Financial Year 2024–25</option>
            </select>
          </div>
        </div>
      </div>

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => onNavigate(card.target)}
              className="text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-[#2463EB]/50 transition-colors focus-visible:outline-2 focus-visible:outline-[#2463EB]"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${card.iconBg}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-bold text-[#14263D] tabular-nums truncate">
                    {card.value}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{card.label}</div>
                </div>
              </div>
              <div
                className={`mt-3 text-xs font-medium tabular-nums ${
                  card.positive ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {card.delta}
              </div>
            </button>
          );
        })}
      </div>

      {/* Middle Row: Revenue Overview + Project Pipeline + Invoices & Collections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Revenue Overview */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#14263D]">Revenue Overview</h2>
              <div className="mt-1 flex items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#2463EB]" />
                  Invoiced
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#16A34A]" />
                  Received
                </span>
              </div>
            </div>
            <div className="inline-flex rounded-lg bg-[#F3F6FA] p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setChartGranularity('monthly')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  chartGranularity === 'monthly'
                    ? 'bg-white text-[#14263D] shadow-xs'
                    : 'text-slate-600 hover:text-[#14263D]'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setChartGranularity('quarterly')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  chartGranularity === 'quarterly'
                    ? 'bg-white text-[#14263D] shadow-xs'
                    : 'text-slate-600 hover:text-[#14263D]'
                }`}
              >
                Quarterly
              </button>
            </div>
          </div>

          <div className="h-56 flex flex-col justify-end">
            <div className="flex-1 flex items-end justify-between gap-3 border-b border-slate-200 pb-2 px-1">
              {revenueBars.map((bar) => {
                const invHeight = Math.max(12, Math.round((bar.invoicedCr / maxRev) * 156));
                const recHeight = Math.max(10, Math.round((bar.receivedCr / maxRev) * 156));
                const isHovered = hoveredMonth === bar.month;
                return (
                  <div
                    key={bar.month}
                    onMouseEnter={() => setHoveredMonth(bar.month)}
                    onMouseLeave={() => setHoveredMonth(null)}
                    className="relative flex-1 flex flex-col items-center group"
                  >
                    {isHovered && (
                      <div className="absolute -top-11 z-10 whitespace-nowrap rounded-md bg-[#14263D] px-2 py-1 text-[11px] text-white shadow-md tabular-nums">
                        Inv: ₹ {bar.invoicedCr.toFixed(2)} Cr · Rec: ₹ {bar.receivedCr.toFixed(2)} Cr
                      </div>
                    )}
                    <div className="flex items-end gap-1.5 h-40">
                      <div
                        style={{ height: `${invHeight}px` }}
                        className="w-4 sm:w-5 rounded-t bg-[#2463EB] transition-opacity group-hover:opacity-90"
                        title={`Invoiced: ₹ ${bar.invoicedCr} Cr`}
                      />
                      <div
                        style={{ height: `${recHeight}px` }}
                        className="w-4 sm:w-5 rounded-t bg-[#16A34A] transition-opacity group-hover:opacity-90"
                        title={`Received: ₹ ${bar.receivedCr} Cr`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between gap-3 pt-2 px-1">
              {revenueBars.map((bar) => (
                <div key={bar.month} className="flex-1 text-center text-[11px] font-medium text-slate-500 tabular-nums">
                  {bar.month}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Project Pipeline Donut */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[#14263D]">Project Pipeline</h2>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="text-xs font-medium text-[#2463EB] hover:underline"
            >
              View Projects
            </button>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="relative h-40 w-40 shrink-0">
              <svg viewBox="0 0 150 150" className="h-full w-full -rotate-90">
                {pipelineSegments.map((seg) => {
                  const fraction = seg.count / pipelineTotal;
                  const dash = fraction * circumference;
                  const offset = -cumulativeFraction * circumference;
                  cumulativeFraction += fraction;
                  return (
                    <circle
                      key={seg.label}
                      cx="75"
                      cy="75"
                      r={radius}
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="22"
                      strokeDasharray={`${dash} ${circumference}`}
                      strokeDashoffset={offset}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-bold text-[#14263D] tabular-nums">{pipelineTotal}</span>
                <span className="text-xs text-slate-500">Projects</span>
              </div>
            </div>

            <div className="w-full space-y-2.5">
              {pipelineSegments.map((seg) => {
                const pct = Math.round((seg.count / pipelineTotal) * 100);
                return (
                  <div key={seg.label} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
                      <span className="font-medium text-slate-700">{seg.label}</span>
                    </div>
                    <div className="flex items-center gap-3 tabular-nums">
                      <span className="text-slate-500">({seg.count})</span>
                      <span className="w-8 text-right font-semibold text-[#14263D]">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Invoices & Collections */}
        <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-[#14263D]">Invoices & Collections</h2>
              <button
                type="button"
                onClick={() => onNavigate('payments')}
                className="text-xs font-medium text-[#2463EB] hover:underline"
              >
                Ledger
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#2463EB]">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#14263D] tabular-nums">
                      {formatInrCompact(metrics.invoicedThisMonth)}
                    </div>
                    <div className="text-xs text-slate-500">Invoiced This Month</div>
                  </div>
                </div>
                <span className="rounded bg-[#E8F5EE] px-2 py-0.5 text-[11px] font-semibold text-emerald-800 tabular-nums">
                  +18%
                </span>
              </div>

              <div className="py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E8F5EE] text-emerald-700">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#14263D] tabular-nums">
                      {formatInrCompact(metrics.receivedThisMonth)}
                    </div>
                    <div className="text-xs text-slate-500">Received This Month</div>
                  </div>
                </div>
                <span className="rounded bg-[#E8F5EE] px-2 py-0.5 text-[11px] font-semibold text-emerald-800 tabular-nums">
                  +15%
                </span>
              </div>

              <div className="py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF2E5] text-amber-700">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#14263D] tabular-nums">
                      {formatInrCompact(metrics.outstandingAmount)}
                    </div>
                    <div className="text-xs text-slate-500">Outstanding Amount</div>
                  </div>
                </div>
                <span className="rounded bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 tabular-nums">
                  +6%
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenSmsInbox}
            className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-200 bg-[#F3F6FA] px-3 py-2.5 text-xs font-medium text-[#14263D] hover:bg-slate-100 transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#2463EB]" />
              Open Live SMS Receiver ({smsStats.pendingVerification} pending)
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Bottom Row: Recent Activities + Upcoming Key Dates + Project Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Recent Activities */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-[#14263D]">Recent Activities</h2>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-[#2463EB] hover:underline"
            >
              View All
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentActivities.map((act) => {
              const Icon = act.icon;
              return (
                <button
                  key={act.title}
                  type="button"
                  onClick={() => onNavigate(act.target)}
                  className="w-full py-3 flex items-start gap-3 text-left hover:bg-[#F3F6FA]/70 rounded-lg px-1.5 transition-colors"
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 mt-0.5 ${act.tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#14263D] leading-snug">{act.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{act.meta}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Upcoming Key Dates */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-[#14263D]">Upcoming Key Dates</h2>
            <button
              type="button"
              onClick={() => onNavigate('agreements')}
              className="text-xs font-medium text-[#2463EB] hover:underline"
            >
              View All
            </button>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 font-medium">Event</th>
                <th className="py-2 font-medium">Client / Project</th>
                <th className="py-2 font-medium text-right">Due Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {upcomingDates.map((item) => (
                <tr
                  key={item.event}
                  onClick={() => onNavigate(item.target)}
                  className="cursor-pointer hover:bg-[#F3F6FA] transition-colors"
                >
                  <td className="py-2.5 font-medium text-[#14263D]">{item.event}</td>
                  <td className="py-2.5 text-slate-600">{item.entity}</td>
                  <td className="py-2.5 text-right font-medium text-rose-700 tabular-nums whitespace-nowrap">
                    {item.date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Project Status */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-[#14263D]">Project Status</h2>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="text-xs font-medium text-[#2463EB] hover:underline"
            >
              View All
            </button>
          </div>
          <div className="space-y-4 pt-1">
            {[
              { label: 'In Operations', count: pipelineSegments[4].count, color: 'bg-[#16A34A]' },
              { label: 'Handover', count: pipelineSegments[3].count, color: 'bg-[#7C3AED]' },
              { label: 'Agreement', count: pipelineSegments[2].count, color: 'bg-[#F59E0B]' },
              { label: 'LOI', count: pipelineSegments[1].count, color: 'bg-[#2463EB]' },
              { label: 'Proposal', count: pipelineSegments[0].count, color: 'bg-sky-400' },
            ].map((row) => {
              const pct = Math.round((row.count / pipelineTotal) * 100);
              return (
                <div key={row.label} className="grid grid-cols-12 items-center gap-3 text-xs">
                  <span className="col-span-4 font-medium text-slate-700 truncate">{row.label}</span>
                  <div className="col-span-6 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="col-span-2 text-right font-semibold text-[#14263D] tabular-nums">
                    {row.count} / {pipelineTotal}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              6 Industry Sectors Active
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
