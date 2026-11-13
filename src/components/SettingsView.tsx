import React, { useState } from 'react';
import { CheckCircle2, Settings, ShieldCheck } from 'lucide-react';
import { INDUSTRY_TEMPLATES, SERVICE_MASTER } from '../data/seedData';

export const SettingsView: React.FC = () => {
  const [otpExpiryMinutes, setOtpExpiryMinutes] = useState(5);
  const [maxOtpAttempts, setMaxOtpAttempts] = useState(5);
  const [statutoryPfEsicPct, setStatutoryPfEsicPct] = useState(21.6);
  const [minMarginThreshold, setMinMarginThreshold] = useState(11.0);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[#14263D]">Master Data & SMS Gateway Configuration</h1>
        <p className="text-xs text-slate-600 mt-0.5">
          Configure industry templates, service rates, statutory costing rules, approval thresholds, and SMS verification policies.
        </p>
      </div>

      {savedNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-[#E8F5EE] px-4 py-3 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          Master configuration updated. Historical approved proposals and issued invoices remain preserved.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <form onSubmit={handleSave} className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Settings className="h-4 w-4 text-[#2463EB]" />
            <h2 className="text-sm font-semibold text-[#14263D]">Costing & SMS Security Rules</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Default Statutory (EPF/ESIC %)</label>
              <input
                type="number"
                step="0.1"
                value={statutoryPfEsicPct}
                onChange={(e) => setStatutoryPfEsicPct(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Director Approval Margin Threshold %</label>
              <input
                type="number"
                step="0.5"
                value={minMarginThreshold}
                onChange={(e) => setMinMarginThreshold(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">SMS OTP Expiry (Minutes)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={otpExpiryMinutes}
                onChange={(e) => setOtpExpiryMinutes(Number(e.target.value) || 5)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Max Verification Attempts</label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxOtpAttempts}
                onChange={(e) => setMaxOtpAttempts(Number(e.target.value) || 5)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-[#F3F6FA] p-3.5 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-[#14263D]">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              SMS Reception & Webhook Endpoint
            </div>
            <p className="text-[11px] text-slate-600">
              Inbound carrier webhooks can POST directly to <code className="font-mono text-[#14263D]">/api/sms/receive</code> or{' '}
              <code className="font-mono text-[#14263D]">/api/sms/webhook</code> with <code className="font-mono">from</code> and <code className="font-mono">body</code>.
            </p>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-[#14263D] px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Save Master Configuration
          </button>
        </form>

        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[#14263D]">Configured Industry Sector Templates & Service Master</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {INDUSTRY_TEMPLATES.map((t) => (
                <div key={t.category} className="rounded-lg border border-slate-200 p-3 text-xs">
                  <div className="flex justify-between font-semibold text-[#14263D]">
                    <span>{t.category}</span>
                    <span className="font-mono text-[#2463EB]">Target {t.defaultMarginPct}%</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{t.typicalFacilities}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 pt-3">
              <div className="text-xs font-semibold text-[#14263D] mb-2">Active Service Master ({SERVICE_MASTER.length})</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {SERVICE_MASTER.map((s) => (
                  <div key={s.name} className="rounded border border-slate-200 bg-[#F3F6FA] px-3 py-2">
                    <div className="font-medium text-[#14263D]">{s.name}</div>
                    <div className="text-[11px] font-mono text-slate-600 tabular-nums">
                      ₹ {s.defaultRate.toLocaleString('en-IN')} / {s.unit}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
