import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Mail, Paperclip } from 'lucide-react';
import type { SmtpDailyMetric, SmtpMetrics30Days } from '../services/smtpApi';

interface SmtpActivityMetricsProps {
  metrics: SmtpMetrics30Days;
  loading?: boolean;
  onConfigureSmtp?: () => void;
}

export const SmtpActivityMetrics: React.FC<SmtpActivityMetricsProps> = ({
  metrics,
  loading = false,
  onConfigureSmtp,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const {
    total30Days,
    sentCount,
    failedCount,
    successRatePct,
    withAttachmentsCount,
    dailySeries,
  } = metrics;

  const failureRatePct =
    total30Days > 0 ? Math.round((failedCount / total30Days) * 1000) / 10 : 0;

  const { maxDaily, yTicks } = useMemo(() => {
    const rawMax = dailySeries.reduce((max, item) => Math.max(max, item.total), 0);
    if (rawMax <= 4) {
      return { maxDaily: 4, yTicks: [4, 2, 0] };
    }
    const step = Math.ceil(rawMax / 4);
    const top = step * 4;
    return {
      maxDaily: top,
      yTicks: [top, top / 2, 0],
    };
  }, [dailySeries]);

  const activeDay: SmtpDailyMetric | null =
    hoveredIndex !== null && dailySeries[hoveredIndex] ? dailySeries[hoveredIndex] : null;

  const peakDay = useMemo(() => {
    return dailySeries.reduce<SmtpDailyMetric | null>((best, curr) => {
      if (curr.total === 0) return best;
      if (!best || curr.total > best.total) return curr;
      return best;
    }, null);
  }, [dailySeries]);

  // SVG Donut ring math
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const sentArc = total30Days > 0 ? (sentCount / total30Days) * circumference : 0;
  const failedArc = total30Days > 0 ? (failedCount / total30Days) * circumference : 0;

  const dateRangeLabel =
    dailySeries.length >= 2
      ? `${dailySeries[0].label} – ${dailySeries[dailySeries.length - 1].label}`
      : 'Past 30 Days';

  if (loading && total30Days === 0) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 animate-pulse"
            >
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="h-7 w-16 rounded bg-slate-200" />
              <div className="h-2.5 w-32 rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-5 h-72 animate-pulse" />
          <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 h-72 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 4-Column KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">30-Day Dispatches</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#14263D]">
            {total30Days}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {dateRangeLabel}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Delivered (Sent)</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A]" />
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#16A34A]">
            {sentCount}
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-600">
            {total30Days > 0 ? `${successRatePct.toFixed(1)}% success rate` : 'No dispatches yet'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Failed Attempts</span>
            <AlertCircle className="h-3.5 w-3.5 text-[#DC2626]" />
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#DC2626]">
            {failedCount}
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-600">
            {total30Days > 0 ? `${failureRatePct.toFixed(1)}% failure rate` : '0 relay errors'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>With PDF Attachments</span>
            <Paperclip className="h-3.5 w-3.5 text-[#2463EB]" />
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#14263D]">
            {withAttachmentsCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Proposals, invoices & reports
          </div>
        </div>
      </div>

      {/* Charts Row: 30-Day Daily Volume Bar Chart + Success/Failure Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Daily Bar Chart (8 cols) */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-[#14263D]">
                Daily Emails Sent — Past 30 Days
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                {activeDay ? (
                  <>
                    <span className="font-semibold text-[#14263D]">{activeDay.label}</span>
                    {' · '}
                    <span>{activeDay.total} total</span>
                    {' · '}
                    <span className="text-[#16A34A]">{activeDay.sent} sent</span>
                    {' · '}
                    <span className="text-[#DC2626]">{activeDay.failed} failed</span>
                  </>
                ) : peakDay ? (
                  <>
                    <span>{dateRangeLabel}</span>
                    {' · '}
                    <span>
                      Peak: {peakDay.label} ({peakDay.total})
                    </span>
                  </>
                ) : (
                  <span>{dateRangeLabel} · Hover any day bar to inspect counts</span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#16A34A]" aria-hidden="true" />
                Sent
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#DC2626]" aria-hidden="true" />
                Failed
              </span>
            </div>
          </div>

          <div className="relative pt-5 pb-2">
            <div className="flex gap-3">
              {/* Y-Axis Scale */}
              <div className="flex flex-col justify-between h-44 text-[11px] font-mono tabular-nums text-slate-400 text-right pr-1 select-none shrink-0 w-7">
                {yTicks.map((tick) => (
                  <span key={tick} className="leading-none">
                    {tick}
                  </span>
                ))}
              </div>

              {/* Plot Area */}
              <div className="relative flex-1 h-44">
                {/* Horizontal Hairline Gridlines */}
                <div
                  className="pointer-events-none absolute inset-0 flex flex-col justify-between"
                  aria-hidden="true"
                >
                  {yTicks.map((tick) => (
                    <div
                      key={tick}
                      className={`w-full border-b ${
                        tick === 0 ? 'border-slate-300' : 'border-slate-100'
                      }`}
                    />
                  ))}
                </div>

                {/* 30 Daily Columns */}
                <div
                  className="relative z-10 grid h-full items-end gap-1"
                  style={{ gridTemplateColumns: `repeat(${dailySeries.length}, minmax(0, 1fr))` }}
                  role="img"
                  aria-label="Bar chart of daily SMTP emails sent and failed over the past 30 days"
                >
                  {dailySeries.map((day, idx) => {
                    const sentHeightPct =
                      maxDaily > 0 ? (day.sent / maxDaily) * 100 : 0;
                    const failedHeightPct =
                      maxDaily > 0 ? (day.failed / maxDaily) * 100 : 0;
                    const isHovered = hoveredIndex === idx;

                    const tooltipAlignClass =
                      idx <= 4
                        ? 'left-0 translate-x-0'
                        : idx >= dailySeries.length - 5
                          ? 'right-0 translate-x-0'
                          : 'left-1/2 -translate-x-1/2';

                    return (
                      <div
                        key={day.date}
                        className="relative h-full flex flex-col justify-end items-center group"
                      >
                        {isHovered && (
                          <div
                            className={`pointer-events-none absolute -top-11 z-20 whitespace-nowrap rounded-md bg-[#14263D] px-2.5 py-1.5 text-[11px] text-white shadow-md ${tooltipAlignClass}`}
                          >
                            <div className="font-semibold">{day.label}</div>
                            <div className="font-mono tabular-nums text-slate-200">
                              Sent: {day.sent} · Failed: {day.failed}
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onMouseEnter={() => setHoveredIndex(idx)}
                          onMouseLeave={() => setHoveredIndex(null)}
                          onFocus={() => setHoveredIndex(idx)}
                          onBlur={() => setHoveredIndex(null)}
                          aria-label={`${day.label}: ${day.sent} sent, ${day.failed} failed`}
                          className={`w-full h-full flex flex-col justify-end items-center rounded-t px-[1px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2463EB] ${
                            isHovered ? 'bg-[#F3F6FA]' : ''
                          }`}
                        >
                          <div className="w-full max-w-[14px] h-full flex flex-col justify-end">
                            {day.total > 0 ? (
                              <div className="w-full h-full flex flex-col justify-end gap-[1px]">
                                {day.failed > 0 && (
                                  <div
                                    className="w-full bg-[#DC2626] rounded-t-[2px] transition-opacity"
                                    style={{
                                      height: `${Math.max(failedHeightPct, 3)}%`,
                                    }}
                                  />
                                )}
                                {day.sent > 0 && (
                                  <div
                                    className={`w-full bg-[#16A34A] transition-opacity ${
                                      day.failed === 0 ? 'rounded-t-[2px]' : ''
                                    }`}
                                    style={{
                                      height: `${Math.max(sentHeightPct, 3)}%`,
                                    }}
                                  />
                                )}
                              </div>
                            ) : (
                              <div className="w-full h-[2px] bg-slate-200 rounded-t-[1px]" />
                            )}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {total30Days === 0 && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="pointer-events-auto rounded-lg border border-slate-200 bg-white/95 px-4 py-2.5 text-center shadow-sm">
                      <div className="text-xs font-semibold text-[#14263D]">
                        No SMTP volume recorded in the last 30 days
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Daily bar counts update automatically when proposals, invoices, or test emails are sent.
                      </p>
                      {onConfigureSmtp && (
                        <button
                          type="button"
                          onClick={onConfigureSmtp}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#2463EB] px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                        >
                          <Mail className="h-3 w-3" />
                          Configure & Send Test
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* X-Axis Date Labels */}
            <div className="mt-2 pl-10 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500">
              <span>{dailySeries[0]?.label}</span>
              <span>{dailySeries[7]?.label}</span>
              <span>{dailySeries[14]?.label}</span>
              <span>{dailySeries[21]?.label}</span>
              <span className="font-semibold text-[#14263D]">Today</span>
            </div>
          </div>
        </div>

        {/* Success / Failure Status Breakdown (4 cols) */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-[#14263D]">
              Status Breakdown (30 Days)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Success vs. failure share across all SMTP attempts
            </p>
          </div>

          {/* Proportional Donut Visualization */}
          <div className="my-4 flex items-center justify-center">
            <div className="relative h-32 w-32 flex items-center justify-center">
              <svg
                viewBox="0 0 112 112"
                className="h-32 w-32 -rotate-90"
                role="img"
                aria-label={`SMTP delivery breakdown: ${sentCount} sent (${successRatePct}%), ${failedCount} failed (${failureRatePct}%)`}
              >
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="12"
                />
                {total30Days > 0 && failedArc > 0 && (
                  <circle
                    cx="56"
                    cy="56"
                    r={radius}
                    fill="none"
                    stroke="#DC2626"
                    strokeWidth="12"
                    strokeDasharray={`${failedArc} ${circumference}`}
                    strokeDashoffset={-sentArc}
                    strokeLinecap="butt"
                  />
                )}
                {total30Days > 0 && sentArc > 0 && (
                  <circle
                    cx="56"
                    cy="56"
                    r={radius}
                    fill="none"
                    stroke="#16A34A"
                    strokeWidth="12"
                    strokeDasharray={`${sentArc} ${circumference}`}
                    strokeDashoffset={0}
                    strokeLinecap="butt"
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-bold font-mono tabular-nums text-[#14263D]">
                  {total30Days > 0 ? `${Math.round(successRatePct)}%` : '—'}
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  Success Rate
                </span>
              </div>
            </div>
          </div>

          {/* Horizontal Ratio Bar + Explicit Label Rows */}
          <div className="space-y-3">
            <div
              className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex"
              aria-hidden="true"
            >
              {total30Days > 0 && (
                <>
                  {sentCount > 0 && (
                    <div
                      className="h-full bg-[#16A34A]"
                      style={{ width: `${successRatePct}%` }}
                    />
                  )}
                  {failedCount > 0 && (
                    <div
                      className="h-full bg-[#DC2626]"
                      style={{ width: `${failureRatePct}%` }}
                    />
                  )}
                </>
              )}
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="flex items-center justify-between py-2">
                <span className="inline-flex items-center gap-2 font-medium text-[#14263D]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A]" />
                  Sent (Delivered)
                </span>
                <span className="font-mono tabular-nums text-slate-700">
                  <strong className="text-[#14263D]">{sentCount}</strong>
                  <span className="text-slate-400"> · {successRatePct.toFixed(1)}%</span>
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="inline-flex items-center gap-2 font-medium text-[#14263D]">
                  <AlertCircle className="h-3.5 w-3.5 text-[#DC2626]" />
                  Failed (Rejected)
                </span>
                <span className="font-mono tabular-nums text-slate-700">
                  <strong className="text-[#14263D]">{failedCount}</strong>
                  <span className="text-slate-400"> · {failureRatePct.toFixed(1)}%</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
