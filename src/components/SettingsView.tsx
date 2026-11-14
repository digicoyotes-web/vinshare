import React, { useState } from 'react';
import { CheckCircle2, RotateCcw, Settings, ShieldCheck } from 'lucide-react';
import { INDUSTRY_TEMPLATES, SERVICE_MASTER } from '../data/seedData';
import {
  loadMasterSettings,
  resetMasterSettings,
  saveMasterSettings,
} from '../utils/erpSettings';

export const SettingsView: React.FC = () => {
  const initial = loadMasterSettings();
  const [defaultGstPct, setDefaultGstPct] = useState(initial.defaultGstPct);
  const [defaultManagementFeePct, setDefaultManagementFeePct] = useState(
    initial.defaultManagementFeePct
  );
  const [statutoryPfEsicPct, setStatutoryPfEsicPct] = useState(initial.statutoryPfEsicPct);
  const [minMarginThreshold, setMinMarginThreshold] = useState(initial.minMarginThreshold);
  const [otpExpiryMinutes, setOtpExpiryMinutes] = useState(initial.otpExpiryMinutes);
  const [maxOtpAttempts, setMaxOtpAttempts] = useState(initial.maxOtpAttempts);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = saveMasterSettings({
      defaultGstPct,
      defaultManagementFeePct,
      statutoryPfEsicPct,
      minMarginThreshold,
      otpExpiryMinutes,
      maxOtpAttempts,
    });
    setDefaultGstPct(saved.defaultGstPct);
    setDefaultManagementFeePct(saved.defaultManagementFeePct);
    setStatutoryPfEsicPct(saved.statutoryPfEsicPct);
    setMinMarginThreshold(saved.minMarginThreshold);
    setOtpExpiryMinutes(saved.otpExpiryMinutes);
    setMaxOtpAttempts(saved.maxOtpAttempts);
    setSavedNotice(
      'Master configuration saved to browser storage. New proposals, GST invoices, and SMS OTP challenges will apply these defaults.'
    );
    setTimeout(() => setSavedNotice(null), 3500);
  };

  const handleReset = () => {
    const defaults = resetMasterSettings();
    setDefaultGstPct(defaults.defaultGstPct);
    setDefaultManagementFeePct(defaults.defaultManagementFeePct);
    setStatutoryPfEsicPct(defaults.statutoryPfEsicPct);
    setMinMarginThreshold(defaults.minMarginThreshold);
    setOtpExpiryMinutes(defaults.otpExpiryMinutes);
    setMaxOtpAttempts(defaults.maxOtpAttempts);
    setSavedNotice('Master configuration restored to factory defaults.');
    setTimeout(() => setSavedNotice(null), 3500);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[#14263D]">Master Data & SMS Gateway Configuration</h1>
        <p className="text-xs text-slate-600 mt-0.5">
          Configure costing defaults (GST %, management fee %, statutory PF/ESIC %), approval thresholds, and SMS OTP security policies.
        </p>
      </div>

      {savedNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-[#E8F5EE] px-4 py-3 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <form
          onSubmit={handleSave}
          className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Settings className="h-4 w-4 text-[#2463EB]" />
            <h2 className="text-sm font-semibold text-[#14263D]">Costing & SMS Security Rules</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Default GST Rate (%)
              </label>
              <input
                type="number"
                step="0.5"
                min={0}
                max={28}
                value={defaultGstPct}
                onChange={(e) => setDefaultGstPct(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Default Management Fee (%)
              </label>
              <input
                type="number"
                step="0.5"
                min={0}
                max={50}
                value={defaultManagementFeePct}
                onChange={(e) => setDefaultManagementFeePct(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Default Statutory (EPF/ESIC %)
              </label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={50}
                value={statutoryPfEsicPct}
                onChange={(e) => setStatutoryPfEsicPct(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Director Approval Margin Threshold %
              </label>
              <input
                type="number"
                step="0.5"
                min={0}
                max={50}
                value={minMarginThreshold}
                onChange={(e) => setMinMarginThreshold(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                SMS OTP Expiry (Minutes)
              </label>
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
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Max Verification Attempts
              </label>
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
              Inbound carrier webhooks can POST directly to{' '}
              <code className="font-mono text-[#14263D]">/api/sms/receive</code> or{' '}
              <code className="font-mono text-[#14263D]">/api/sms/webhook</code> with{' '}
              <code className="font-mono">from</code> and <code className="font-mono">body</code>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-[#14263D] px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Save Master Configuration
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </form>

        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[#14263D]">
              Configured Industry Sector Templates & Service Master
            </h2>
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
              <div className="text-xs font-semibold text-[#14263D] mb-2">
                Active Service Master ({SERVICE_MASTER.length})
              </div>
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
