import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  History,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Stethoscope,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import { INDUSTRY_TEMPLATES, SERVICE_MASTER } from '../data/seedData';
import { checkSmtpConnection } from '../services/smtp';
import {
  buildEmptySmtpMetrics30Days,
  diagnoseSmtpConnection,
  fetchSmtpLogs,
  fetchSmtpStatus,
  resetSmtpConfig,
  saveAndVerifySmtpConfig,
  sendEmailViaSmtp,
  SmtpConnectionError,
  type SmtpActivityLogEntry,
  type SmtpDiagnosticReport,
  type SmtpEnvDiagnostics,
  type SmtpMetrics30Days,
} from '../services/smtpApi';
import { SmtpActivityMetrics } from './SmtpActivityMetrics';
import {
  loadMasterSettings,
  resetMasterSettings,
  saveMasterSettings,
} from '../utils/erpSettings';

export interface SettingsFocusTarget {
  tab?: 'config' | 'smtp_logs';
  logId?: string;
  runDiagnostic?: boolean;
  nonce: number;
}

interface SettingsViewProps {
  focusTarget?: SettingsFocusTarget | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ focusTarget }) => {
  const diagnosticCardRef = useRef<HTMLDivElement | null>(null);
  const lastHandledNonceRef = useRef<number | null>(null);
  const lastAutoDiagNonceRef = useRef<number | null>(null);
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

  // SMTP Configuration State
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [smtpSource, setSmtpSource] = useState<'env' | 'runtime'>('env');
  const [smtpEnvDiagnostics, setSmtpEnvDiagnostics] = useState<SmtpEnvDiagnostics | null>(null);
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpHasPass, setSmtpHasPass] = useState(false);
  const [smtpFromName, setSmtpFromName] = useState('Vinshar Facility Management ERP');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpNotice, setSmtpNotice] = useState<string | null>(null);
  const [smtpError, setSmtpError] = useState<string | null>(null);
  const [smtpActionHint, setSmtpActionHint] = useState<string | null>(null);
  const [smtpDebugClues, setSmtpDebugClues] = useState<string[]>([]);
  const [smtpFailedLogId, setSmtpFailedLogId] = useState<string | null>(null);
  const [testRecipient, setTestRecipient] = useState('digicoyotes@gmail.com');
  const [testingSend, setTestingSend] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [diagnosingSmtp, setDiagnosingSmtp] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<SmtpDiagnosticReport | null>(null);
  const [showDiagnosticTrace, setShowDiagnosticTrace] = useState(false);
  const [showFailureGuide, setShowFailureGuide] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'smtp_logs'>('config');
  const [smtpLogs, setSmtpLogs] = useState<SmtpActivityLogEntry[]>([]);
  const [smtpMetrics, setSmtpMetrics] = useState<SmtpMetrics30Days>(() =>
    buildEmptySmtpMetrics30Days()
  );
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | 'Sent' | 'Failed'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{
    id: number;
    type: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const showToast = (type: 'success' | 'error', title: string, message: string) => {
    const id = Date.now();
    setToast({ id, type, title, message });
    setTimeout(() => {
      setToast((curr) => (curr && curr.id === id ? null : curr));
    }, 6500);
  };

  const refreshSmtpLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const data = await fetchSmtpLogs();
      setSmtpLogs(data.logs);
      setSmtpMetrics(data.metrics);
    } catch (err) {
      setLogsError(
        err instanceof Error ? err.message : 'Unable to load SMTP activity logs.'
      );
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const filteredLogs = useMemo(() => {
    const q = logSearchQuery.trim().toLowerCase();
    return smtpLogs.filter((log) => {
      if (logStatusFilter !== 'all' && log.status !== logStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        log.to.toLowerCase().includes(q) ||
        log.subject.toLowerCase().includes(q) ||
        log.from.toLowerCase().includes(q) ||
        (log.smtpHost || '').toLowerCase().includes(q)
      );
    });
  }, [smtpLogs, logStatusFilter, logSearchQuery]);

  useEffect(() => {
    const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
    const viteHost = (viteEnv.VITE_SMTP_HOST || '').trim();
    const vitePort = Number(viteEnv.VITE_SMTP_PORT);
    const viteUser = (viteEnv.VITE_SMTP_USER || '').trim();
    const viteFromName = (viteEnv.VITE_SMTP_FROM_NAME || '').trim();
    const viteFromEmail = (viteEnv.VITE_SMTP_FROM_EMAIL || '').trim();

    fetchSmtpStatus()
      .then((status) => {
        setSmtpConfigured(status.configured);
        setSmtpSource(status.source);
        setSmtpEnvDiagnostics(status.envDiagnostics || null);
        setSmtpHost(status.host || viteHost || 'smtp.gmail.com');
        setSmtpPort(
          status.port || (Number.isInteger(vitePort) && vitePort > 0 && vitePort <= 65535 ? vitePort : 587)
        );
        setSmtpSecure(status.secure);
        setSmtpUser(status.user || viteUser || '');
        setSmtpHasPass(status.hasPassword);
        setSmtpFromName(status.fromName || viteFromName || 'Vinshar Facility Management ERP');
        setSmtpFromEmail(status.fromEmail || status.user || viteFromEmail || viteUser || '');
      })
      .catch(() => {
        if (viteHost) setSmtpHost(viteHost);
        if (Number.isInteger(vitePort) && vitePort > 0 && vitePort <= 65535) setSmtpPort(vitePort);
        if (viteUser) setSmtpUser(viteUser);
        if (viteFromName) setSmtpFromName(viteFromName);
        if (viteFromEmail || viteUser) setSmtpFromEmail(viteFromEmail || viteUser);
      });
    refreshSmtpLogs();
  }, [refreshSmtpLogs]);

  useEffect(() => {
    if (activeTab === 'smtp_logs') {
      refreshSmtpLogs();
    }
  }, [activeTab, refreshSmtpLogs]);

  useEffect(() => {
    if (!focusTarget || lastHandledNonceRef.current === focusTarget.nonce) return;
    lastHandledNonceRef.current = focusTarget.nonce;

    if (focusTarget.tab) {
      setActiveTab(focusTarget.tab);
    }
    if (focusTarget.logId) {
      setLogStatusFilter('Failed');
      setExpandedLogIds((prev) => ({ ...prev, [focusTarget.logId!]: true }));
      void refreshSmtpLogs();
    }
    if (focusTarget.runDiagnostic) {
      setActiveTab('config');
      window.setTimeout(() => {
        diagnosticCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [focusTarget, refreshSmtpLogs]);

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

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmtpError(null);
    setSmtpActionHint(null);
    setSmtpDebugClues([]);
    setSmtpFailedLogId(null);
    setSmtpNotice(null);

    const trimmedUser = smtpUser.trim();
    if (!trimmedUser || /^\d+$/.test(trimmedUser) || !trimmedUser.includes('@')) {
      setSmtpError(
        'Enter your full SMTP email address in "SMTP Username / Email" (e.g. digicoyotes@gmail.com), not a numeric value.'
      );
      setSmtpActionHint(
        'Use your full Gmail / company mailbox address and a 16-character Google App Password.'
      );
      return;
    }

    setSmtpSaving(true);
    try {
      const updated = await saveAndVerifySmtpConfig({
        host: smtpHost.trim(),
        port: Number(smtpPort) || 587,
        secure: smtpSecure,
        user: trimmedUser,
        pass: smtpPass || undefined,
        fromName: smtpFromName.trim() || 'Vinshar Facility Management ERP',
        fromEmail: (smtpFromEmail || trimmedUser).trim(),
        verify: true,
      });
      setSmtpConfigured(updated.configured);
      setSmtpSource(updated.source);
      setSmtpEnvDiagnostics(updated.envDiagnostics || null);
      setSmtpHasPass(updated.hasPassword);
      setSmtpPass('');
      setSmtpNotice(
        `SMTP handshake verified! Outbound ERP emails will send via ${updated.host}:${updated.port} from ${updated.fromEmail}.`
      );
      await refreshSmtpLogs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SMTP verification failed.';
      setSmtpError(msg);
      if (err instanceof SmtpConnectionError) {
        setSmtpActionHint(err.actionHint || null);
        setSmtpDebugClues(err.debuggingClues || []);
        if (err.logEntryId) {
          setSmtpFailedLogId(err.logEntryId);
          setExpandedLogIds((prev) => ({ ...prev, [err.logEntryId!]: true }));
        }
      }
      await refreshSmtpLogs();
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleSendTestSmtp = async () => {
    setSmtpError(null);
    setSmtpActionHint(null);
    setSmtpDebugClues([]);
    setSmtpFailedLogId(null);
    setSmtpNotice(null);
    if (!testRecipient.trim()) {
      setSmtpError('Enter a test recipient email address.');
      return;
    }
    setTestingSend(true);
    try {
      const res = await sendEmailViaSmtp({
        to: testRecipient.trim(),
        subject: 'Vinshar Facility Management ERP — SMTP Test Email',
        body: `Hello,\n\nThis is a live SMTP verification email sent from Vinshar Facility Management ERP.\n\nSMTP Host: ${smtpHost}:${smtpPort}\nTimestamp: ${new Date().toLocaleString('en-IN')}\n\nYour ERP outbound SMTP delivery is working properly.`,
      });
      setSmtpNotice(
        `Test email delivered to ${testRecipient.trim()} via ${res.smtpHost} (Message ID: ${res.messageId}).`
      );
      await refreshSmtpLogs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test SMTP send failed.';
      setSmtpError(msg);
      if (err instanceof SmtpConnectionError) {
        setSmtpActionHint(err.actionHint || null);
        setSmtpDebugClues(err.debuggingClues || []);
        if (err.logEntryId) {
          setSmtpFailedLogId(err.logEntryId);
          setExpandedLogIds((prev) => ({ ...prev, [err.logEntryId!]: true }));
        }
      }
      await refreshSmtpLogs();
    } finally {
      setTestingSend(false);
    }
  };

  const handleResetSmtp = async () => {
    setSmtpError(null);
    setSmtpActionHint(null);
    setSmtpDebugClues([]);
    setSmtpFailedLogId(null);
    setSmtpNotice(null);
    try {
      const status = await resetSmtpConfig();
      setSmtpConfigured(status.configured);
      setSmtpSource(status.source);
      setSmtpEnvDiagnostics(status.envDiagnostics || null);
      setSmtpHost(status.host || 'smtp.gmail.com');
      setSmtpPort(status.port || 587);
      setSmtpSecure(status.secure);
      setSmtpUser(status.user || '');
      setSmtpHasPass(status.hasPassword);
      setSmtpPass('');
      setSmtpFromName(status.fromName || 'Vinshar Facility Management ERP');
      setSmtpFromEmail(status.fromEmail || '');
      setSmtpNotice('SMTP configuration reset to environment defaults.');
    } catch (err) {
      setSmtpError(err instanceof Error ? err.message : 'Failed to reset SMTP settings.');
    }
  };

  const handleSmtpConnectionTest = async () => {
    setSmtpError(null);
    setSmtpActionHint(null);
    setSmtpDebugClues([]);
    setSmtpFailedLogId(null);
    setSmtpNotice(null);
    setTestingConnection(true);
    try {
      const result = await checkSmtpConnection({
        host: smtpHost.trim(),
        port: Number(smtpPort) || 587,
        secure: smtpSecure,
        user: smtpUser.trim(),
        pass: smtpPass || undefined,
      });

      if (result.ok) {
        setSmtpNotice(result.message);
        showToast('success', 'SMTP Connection Test Passed', result.message);
        if (result.logEntryId) {
          setExpandedLogIds((prev) => ({ ...prev, [result.logEntryId!]: true }));
        }
      } else {
        setSmtpError(result.message);
        setSmtpActionHint(result.actionHint || null);
        setSmtpDebugClues(result.debuggingClues || []);
        if (result.logEntryId) {
          setSmtpFailedLogId(result.logEntryId);
          setExpandedLogIds((prev) => ({ ...prev, [result.logEntryId!]: true }));
        }
        showToast(
          'error',
          `SMTP Handshake Failed${result.smtpErrorCode ? ` (${result.smtpErrorCode})` : ''}`,
          result.actionHint ? `${result.message} Tip: ${result.actionHint}` : result.message
        );
      }
      await refreshSmtpLogs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SMTP connection test failed.';
      setSmtpError(msg);
      showToast('error', 'SMTP Connection Test Failed', msg);
      await refreshSmtpLogs();
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRunSmtpDiagnostic = useCallback(async () => {
    setDiagnosingSmtp(true);
    setShowDiagnosticTrace(false);
    try {
      const report = await diagnoseSmtpConnection({
        host: smtpHost.trim(),
        port: Number(smtpPort) || 587,
        secure: smtpSecure,
        user: smtpUser.trim(),
        pass: smtpPass || undefined,
      });
      setDiagnosticReport(report);
      if (report.logEntryId) {
        setExpandedLogIds((prev) => ({ ...prev, [report.logEntryId!]: true }));
      }
      if (report.ok) {
        showToast('success', report.plainEnglishTitle, report.plainEnglishExplanation);
      } else {
        showToast('error', report.plainEnglishTitle, report.plainEnglishExplanation);
      }
      await refreshSmtpLogs();
    } finally {
      setDiagnosingSmtp(false);
    }
  }, [smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, refreshSmtpLogs]);

  useEffect(() => {
    if (focusTarget?.runDiagnostic && focusTarget.nonce !== lastAutoDiagNonceRef.current) {
      lastAutoDiagNonceRef.current = focusTarget.nonce;
      void handleRunSmtpDiagnostic();
    }
  }, [focusTarget, handleRunSmtpDiagnostic]);

  const toggleLogTrace = (id: string) => {
    setExpandedLogIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#14263D]">Master Data, SMTP Email & SMS Gateway Configuration</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Configure costing defaults, outbound SMTP mail relay, approval thresholds, and inspect SMTP delivery logs.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'config'
                ? 'bg-[#14263D] text-white'
                : 'text-slate-600 hover:text-[#14263D]'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            Configuration & Masters
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('smtp_logs')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'smtp_logs'
                ? 'bg-[#2463EB] text-white'
                : 'text-slate-600 hover:text-[#14263D]'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            SMTP Activity Log
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-mono tabular-nums ${
                activeTab === 'smtp_logs'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#F3F6FA] text-[#14263D]'
              }`}
            >
              {smtpLogs.length}
            </span>
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-[#E8F5EE] px-4 py-3 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {activeTab === 'smtp_logs' ? (
        <div className="space-y-5">
          <SmtpActivityMetrics
            metrics={smtpMetrics}
            loading={logsLoading}
            onConfigureSmtp={() => setActiveTab('config')}
          />

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 bg-[#F3F6FA]/70">
              <div className="flex items-center gap-2.5">
                <History className="h-4 w-4 text-[#2463EB]" />
                <div>
                  <h2 className="text-sm font-semibold text-[#14263D]">
                    SMTP Activity Log (Last 20 Dispatches)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Real-time transparency ledger of recent outbound SMTP emails sent from Proposals, Invoices, Projects, and Settings tests.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    placeholder="Filter recipient or subject..."
                    aria-label="Filter SMTP activity logs"
                    className="w-48 sm:w-56 rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-[#14263D] placeholder:text-slate-400 focus:border-[#2463EB] focus:outline-none"
                  />
                </div>

                <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
                  {(['all', 'Sent', 'Failed'] as const).map((statusOption) => (
                    <button
                      key={statusOption}
                      type="button"
                      onClick={() => setLogStatusFilter(statusOption)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                        logStatusFilter === statusOption
                          ? 'bg-[#14263D] text-white'
                          : 'text-slate-600 hover:text-[#14263D]'
                      }`}
                    >
                      {statusOption === 'all' ? 'All' : statusOption}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={logsLoading}
                  onClick={refreshSmtpLogs}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#14263D] hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${logsLoading ? 'animate-spin text-[#2463EB]' : ''}`} />
                  Refresh Log
                </button>
              </div>
            </div>

            {logsError && (
              <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{logsError}</span>
              </div>
            )}

            {logsLoading && smtpLogs.length === 0 ? (
              <div className="divide-y divide-slate-100 p-5 space-y-3">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="flex items-center justify-between gap-4 pt-2 animate-pulse">
                    <div className="h-3.5 w-32 rounded bg-slate-200" />
                    <div className="h-3.5 w-44 rounded bg-slate-200" />
                    <div className="h-3.5 w-52 rounded bg-slate-100" />
                    <div className="h-4 w-16 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : smtpLogs.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Mail className="h-8 w-8 text-slate-300 mx-auto" />
                <div className="text-sm font-semibold text-[#14263D]">
                  No SMTP Emails Logged Yet
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  The last 20 emails sent or attempted through the backend SMTP relay will appear here automatically with recipient, subject, status, and timestamps.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('config')}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Configure & Test SMTP
                </button>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="text-sm font-semibold text-[#14263D]">
                  No Matching Dispatches
                </div>
                <p className="text-xs text-slate-500">
                  No records match the current status or search filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLogStatusFilter('all');
                    setLogSearchQuery('');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#14263D] hover:bg-slate-50"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-[#F3F6FA] text-xs font-semibold text-slate-600">
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">To</th>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">SMTP Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredLogs.map((log) => {
                      const hasTrace =
                        Boolean(log.handshakeTrace && log.handshakeTrace.length > 0) ||
                        Boolean(log.debuggingClues && log.debuggingClues.length > 0) ||
                        Boolean(log.smtpRawResponse);
                      const isExpanded = Boolean(expandedLogIds[log.id]);
                      return (
                        <React.Fragment key={log.id}>
                          <tr className="hover:bg-[#F3F6FA]/60 align-top">
                            <td className="px-4 py-3 font-mono text-[11px] text-slate-600 whitespace-nowrap tabular-nums">
                              <div>{new Date(log.timestamp).toLocaleString('en-IN')}</div>
                              <div className="mt-0.5 font-sans text-[11px] text-slate-400">
                                {log.eventType || 'Send Email'}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-mono font-semibold text-[#14263D]">{log.to}</div>
                              {log.cc && (
                                <div className="font-mono text-[11px] text-slate-500">CC: {log.cc}</div>
                              )}
                              <div className="font-mono text-[11px] text-slate-400">From: {log.from}</div>
                            </td>
                            <td className="px-4 py-3 max-w-xs">
                              <div className="font-medium text-[#14263D] truncate" title={log.subject}>
                                {log.subject}
                              </div>
                              {log.attachmentCount > 0 && (
                                <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500">
                                  <Paperclip className="h-3 w-3 text-[#2463EB]" />
                                  {log.attachmentCount} PDF attachment(s)
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                                  log.status === 'Sent'
                                    ? 'text-[#16A34A]'
                                    : 'text-[#DC2626]'
                                }`}
                              >
                                {log.status === 'Sent' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <AlertCircle className="h-3.5 w-3.5" />
                                )}
                                {log.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[11px] text-slate-600 max-w-sm">
                              {log.status === 'Sent' ? (
                                <div className="space-y-0.5">
                                  {log.smtpHost && (
                                    <div className="font-mono text-[#14263D]">
                                      {log.smtpHost}
                                      {log.smtpPort ? `:${log.smtpPort}` : ''}
                                    </div>
                                  )}
                                  {log.messageId && (
                                    <div className="font-mono text-[11px] text-slate-500 truncate" title={log.messageId}>
                                      ID: {log.messageId}
                                    </div>
                                  )}
                                  {hasTrace && (
                                    <button
                                      type="button"
                                      onClick={() => toggleLogTrace(log.id)}
                                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#2463EB] hover:underline"
                                    >
                                      <Terminal className="h-3 w-3" />
                                      {isExpanded ? 'Hide Handshake Trace' : 'View Handshake Trace'}
                                      {isExpanded ? (
                                        <ChevronUp className="h-3 w-3" />
                                      ) : (
                                        <ChevronDown className="h-3 w-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {(log.smtpCommand || log.smtpErrorCode || log.smtpResponseCode) && (
                                    <div className="font-mono text-[11px] text-slate-600">
                                      {[
                                        log.smtpHost
                                          ? `${log.smtpHost}${log.smtpPort ? `:${log.smtpPort}` : ''}`
                                          : null,
                                        log.smtpCommand ? `Stage: ${log.smtpCommand}` : null,
                                        log.smtpErrorCode ? `Code: ${log.smtpErrorCode}` : null,
                                        log.smtpResponseCode ? `SMTP ${log.smtpResponseCode}` : null,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </div>
                                  )}
                                  <div className="text-[#DC2626] leading-snug">
                                    {log.errorMessage || 'SMTP dispatch failed'}
                                  </div>
                                  {hasTrace && (
                                    <button
                                      type="button"
                                      onClick={() => toggleLogTrace(log.id)}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#14263D] hover:text-[#2463EB]"
                                    >
                                      <Terminal className="h-3 w-3" />
                                      {isExpanded
                                        ? 'Hide Server Handshake Error Details'
                                        : 'Inspect Server Handshake Trace'}
                                      {isExpanded ? (
                                        <ChevronUp className="h-3 w-3" />
                                      ) : (
                                        <ChevronDown className="h-3 w-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                          {isExpanded && hasTrace && (
                            <tr className="bg-[#F3F6FA]/70">
                              <td colSpan={5} className="px-4 py-3">
                                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2.5 text-[11px]">
                                  {log.actionHint && (
                                    <div className="rounded border border-amber-200 bg-amber-50/70 px-3 py-2 text-amber-950">
                                      <span className="font-semibold">Recommended Fix: </span>
                                      {log.actionHint}
                                    </div>
                                  )}
                                  {log.debuggingClues && log.debuggingClues.length > 0 && (
                                    <div>
                                      <div className="font-semibold text-[#14263D]">
                                        Debugging Clues
                                      </div>
                                      <ul className="mt-1 list-disc pl-4 space-y-0.5 text-slate-700">
                                        {log.debuggingClues.map((clue) => (
                                          <li key={clue}>{clue}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {log.smtpRawResponse && (
                                    <div>
                                      <div className="font-semibold text-[#14263D]">
                                        Verbatim SMTP Server Response
                                      </div>
                                      <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-[#DC2626] bg-rose-50/60 border border-rose-100 rounded px-2.5 py-2">
                                        {log.smtpRawResponse}
                                      </pre>
                                    </div>
                                  )}
                                  {log.handshakeTrace && log.handshakeTrace.length > 0 && (
                                    <div>
                                      <div className="font-semibold text-[#14263D]">
                                        SMTP Protocol Exchange (Credentials Redacted)
                                      </div>
                                      <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700 bg-[#F3F6FA] border border-slate-200 rounded px-2.5 py-2 leading-relaxed">
                                        {log.handshakeTrace.join('\n')}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-5">
          <form
            onSubmit={handleSave}
            className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
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

          {/* SMTP Mail Server Configuration */}
          <form
            onSubmit={handleSaveSmtp}
            className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-[#2463EB]" />
                <h2 className="text-sm font-semibold text-[#14263D]">
                  Outbound SMTP Mail Server
                </h2>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                  smtpConfigured
                    ? 'bg-[#E8F5EE] text-emerald-800'
                    : 'bg-[#FFF2E5] text-amber-800'
                }`}
              >
                {smtpConfigured ? 'Verified & Active' : 'Not Configured'}
              </span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-[#F3F6FA] px-3 py-2.5 text-[11px] space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[#14263D]">
                  Active Source:{' '}
                  {smtpSource === 'runtime'
                    ? 'Verified Runtime Settings'
                    : smtpConfigured
                      ? 'Environment Variables (.env / Secrets)'
                      : 'Default Template (Credentials Needed)'}
                </span>
                <span className="font-mono text-slate-500">
                  {smtpEnvDiagnostics?.detectedVars.length
                    ? `Env keys: ${smtpEnvDiagnostics.detectedVars.join(', ')}`
                    : 'No SMTP_* env vars detected'}
                </span>
              </div>
              {smtpEnvDiagnostics && smtpEnvDiagnostics.issues.length > 0 && (
                <div className="pt-1 text-[#DC2626] space-y-0.5">
                  {smtpEnvDiagnostics.issues.map((issue) => (
                    <div key={issue}>• {issue}</div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500">Quick Presets:</span>
              <button
                type="button"
                onClick={() => {
                  setSmtpHost('smtp.gmail.com');
                  setSmtpPort(587);
                  setSmtpSecure(false);
                }}
                className="rounded border border-slate-200 bg-[#F3F6FA] px-2 py-0.5 text-[11px] font-medium text-[#14263D] hover:bg-slate-200"
              >
                Gmail (587)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSmtpHost('smtp.office365.com');
                  setSmtpPort(587);
                  setSmtpSecure(false);
                }}
                className="rounded border border-slate-200 bg-[#F3F6FA] px-2 py-0.5 text-[11px] font-medium text-[#14263D] hover:bg-slate-200"
              >
                Office 365 (587)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSmtpHost('smtp.zoho.in');
                  setSmtpPort(465);
                  setSmtpSecure(true);
                }}
                className="rounded border border-slate-200 bg-[#F3F6FA] px-2 py-0.5 text-[11px] font-medium text-[#14263D] hover:bg-slate-200"
              >
                Zoho (465 SSL)
              </button>
            </div>

            {smtpNotice && (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-[#E8F5EE] px-3 py-2.5 text-xs text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>{smtpNotice}</span>
              </div>
            )}

            {smtpError && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <div className="font-medium">{smtpError}</div>
                  {smtpActionHint && (
                    <div className="text-[11px] text-rose-900">
                      <span className="font-semibold">Actionable Fix: </span>
                      {smtpActionHint}
                    </div>
                  )}
                  {smtpDebugClues.length > 0 && (
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-rose-900/90">
                      {smtpDebugClues.map((clue) => (
                        <li key={clue}>{clue}</li>
                      ))}
                    </ul>
                  )}
                  {smtpFailedLogId && (
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedLogIds((prev) => ({ ...prev, [smtpFailedLogId]: true }));
                        setLogStatusFilter('Failed');
                        setActiveTab('smtp_logs');
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#14263D] underline hover:text-[#2463EB]"
                    >
                      <Terminal className="h-3 w-3" />
                      Inspect Full Handshake Error in Activity Log
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  SMTP Host
                </label>
                <input
                  type="text"
                  required
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 col-span-2 sm:col-span-1">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    required
                    value={smtpPort}
                    onChange={(e) => {
                      const p = Number(e.target.value) || 587;
                      setSmtpPort(p);
                      setSmtpSecure(p === 465);
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Encryption
                  </label>
                  <select
                    value={smtpSecure ? 'ssl' : 'starttls'}
                    onChange={(e) => setSmtpSecure(e.target.value === 'ssl')}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                  >
                    <option value="starttls">STARTTLS</option>
                    <option value="ssl">SSL/TLS</option>
                  </select>
                </div>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  SMTP Username / Email
                </label>
                <input
                  type="email"
                  name="smtp_username_email"
                  autoComplete="off"
                  data-lpignore="true"
                  required
                  value={smtpUser}
                  onChange={(e) => {
                    setSmtpUser(e.target.value);
                    if (!smtpFromEmail || smtpFromEmail === smtpUser) {
                      setSmtpFromEmail(e.target.value);
                    }
                  }}
                  placeholder="digicoyotes@gmail.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
                {/^\d+$/.test(smtpUser.trim()) && (
                  <p className="mt-1 text-[10px] text-rose-600">
                    Replace &quot;{smtpUser.trim()}&quot; with your full email address (e.g. digicoyotes@gmail.com).
                  </p>
                )}
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  SMTP Password / App Password
                </label>
                <div className="relative">
                  <input
                    type={showSmtpPass ? 'text' : 'password'}
                    name="smtp_app_password"
                    autoComplete="new-password"
                    data-lpignore="true"
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder={smtpHasPass ? '•••••••• (stored on server)' : '16-char Google App Password'}
                    className="w-full rounded-lg border border-slate-300 pl-3 pr-9 py-2 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSmtpPass((v) => !v)}
                    title={showSmtpPass ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showSmtpPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  From Name
                </label>
                <input
                  type="text"
                  value={smtpFromName}
                  onChange={(e) => setSmtpFromName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  From Email
                </label>
                <input
                  type="email"
                  value={smtpFromEmail}
                  onChange={(e) => setSmtpFromEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={smtpSaving || testingConnection}
                className="flex-1 min-w-[170px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2463EB] px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {smtpSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Verifying SMTP...
                  </>
                ) : (
                  'Verify & Save SMTP Settings'
                )}
              </button>
              <button
                type="button"
                disabled={testingConnection || smtpSaving}
                onClick={handleSmtpConnectionTest}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-[#F3F6FA] px-3.5 py-2.5 text-xs font-semibold text-[#14263D] hover:bg-slate-200 disabled:opacity-60"
              >
                {testingConnection ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2463EB]" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Activity className="h-3.5 w-3.5 text-[#2463EB]" />
                    SMTP Connection Test
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleResetSmtp}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>

            {smtpConfigured && (
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="text-[11px] font-semibold text-[#14263D]">
                  Send Test Email via SMTP
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    placeholder="digicoyotes@gmail.com"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
                  />
                  <button
                    type="button"
                    disabled={testingSend}
                    onClick={handleSendTestSmtp}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-[#F3F6FA] px-3 py-1.5 text-xs font-semibold text-[#14263D] hover:bg-slate-200 disabled:opacity-60 shrink-0"
                  >
                    {testingSend ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Mail className="h-3.5 w-3.5 text-[#2463EB]" />
                    )}
                    Send Test
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* SMTP Diagnostic Tool */}
          <div
            ref={diagnosticCardRef}
            className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-[#2463EB]" />
                <div>
                  <h2 className="text-sm font-semibold text-[#14263D]">
                    SMTP Diagnostic Tool
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Runs a live DNS, TCP socket, TLS/STARTTLS, and AUTH probe with plain-English diagnosis.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={diagnosingSmtp || smtpSaving || testingConnection}
                onClick={handleRunSmtpDiagnostic}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#14263D] px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
              >
                {diagnosingSmtp ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Probing Socket...
                  </>
                ) : (
                  <>
                    <Wrench className="h-3.5 w-3.5" />
                    Run Socket Diagnostic
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-[#F3F6FA] px-3 py-2 text-[11px] text-slate-600">
              <span>
                Target:{' '}
                <strong className="font-mono text-[#14263D]">
                  {smtpHost.trim() || '(unset)'}:{Number(smtpPort) || 587}
                </strong>
              </span>
              <span className="font-mono text-[#14263D]">
                {smtpSecure ? 'SSL/TLS (Implicit)' : 'STARTTLS (Explicit)'}
              </span>
            </div>

            {diagnosticReport && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {diagnosticReport.stages.map((stage) => (
                    <div
                      key={stage.id}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        stage.status === 'pass'
                          ? 'border-emerald-200 bg-[#E8F5EE]/70'
                          : stage.status === 'fail'
                            ? 'border-rose-200 bg-rose-50'
                            : 'border-slate-200 bg-[#F3F6FA]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#14263D]">{stage.label}</span>
                        <span
                          className={`text-[11px] font-semibold tabular-nums ${
                            stage.status === 'pass'
                              ? 'text-[#16A34A]'
                              : stage.status === 'fail'
                                ? 'text-[#DC2626]'
                                : 'text-slate-500'
                          }`}
                        >
                          {stage.status === 'pass'
                            ? `Pass${typeof stage.latencyMs === 'number' ? ` · ${stage.latencyMs}ms` : ''}`
                            : stage.status === 'fail'
                              ? 'Fail'
                              : 'Skipped'}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-600 break-words">
                        {stage.detail}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className={`rounded-lg border p-3.5 space-y-2 text-xs ${
                    diagnosticReport.ok
                      ? 'border-emerald-200 bg-[#E8F5EE] text-emerald-950'
                      : 'border-rose-200 bg-rose-50 text-rose-950'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {diagnosticReport.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-[#DC2626] shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1 flex-1">
                      <div className="font-bold text-[#14263D]">
                        {diagnosticReport.plainEnglishTitle}
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {diagnosticReport.plainEnglishExplanation}
                      </p>
                      {diagnosticReport.recommendedSteps.length > 0 && (
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                          {diagnosticReport.recommendedSteps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-1.5">
                        {diagnosticReport.suggestedFix && (
                          <button
                            type="button"
                            onClick={() => {
                              setSmtpPort(diagnosticReport.suggestedFix!.port);
                              setSmtpSecure(diagnosticReport.suggestedFix!.secure);
                              showToast(
                                'success',
                                'Recommended Setting Applied',
                                `Updated to Port ${diagnosticReport.suggestedFix!.port} (${diagnosticReport.suggestedFix!.secure ? 'SSL/TLS' : 'STARTTLS'}). Re-run Socket Diagnostic to confirm.`
                              );
                            }}
                            className="rounded-md bg-[#2463EB] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                          >
                            {diagnosticReport.suggestedFix.label}
                          </button>
                        )}
                        {diagnosticReport.trace.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowDiagnosticTrace((v) => !v)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#14263D] hover:bg-slate-50"
                          >
                            <Terminal className="h-3 w-3" />
                            {showDiagnosticTrace ? 'Hide Socket Trace' : 'View Socket Trace'}
                          </button>
                        )}
                        {diagnosticReport.logEntryId && (
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedLogIds((prev) => ({
                                ...prev,
                                [diagnosticReport.logEntryId!]: true,
                              }));
                              setLogStatusFilter(diagnosticReport.ok ? 'all' : 'Failed');
                              setActiveTab('smtp_logs');
                            }}
                            className="text-[11px] font-semibold text-[#14263D] underline hover:text-[#2463EB]"
                          >
                            Open in Activity Log
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {showDiagnosticTrace && diagnosticReport.trace.length > 0 && (
                    <pre className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700 bg-white border border-slate-200 rounded px-2.5 py-2 leading-relaxed">
                      {diagnosticReport.trace.join('\n')}
                    </pre>
                  )}
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 pt-2.5">
              <button
                type="button"
                onClick={() => setShowFailureGuide((v) => !v)}
                className="flex w-full items-center justify-between text-[11px] font-semibold text-[#14263D] hover:text-[#2463EB]"
              >
                <span>Common Handshake Failures — Plain-English Fix Guide</span>
                {showFailureGuide ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {showFailureGuide && (
                <div className="mt-2.5 grid grid-cols-1 gap-2 text-[11px]">
                  <div className="rounded-lg border border-slate-200 bg-[#F3F6FA] px-3 py-2">
                    <div className="font-semibold text-[#14263D]">
                      Wrong Password (EAUTH / SMTP 535)
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      The server rejected your credentials. For Gmail, enable 2-Step Verification and generate a 16-character App Password instead of using your regular Gmail password.
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-[#F3F6FA] px-3 py-2">
                    <div className="font-semibold text-[#14263D]">
                      Port Blocked (ETIMEDOUT / ECONNREFUSED)
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      Firewall or network rules blocked outbound access to that port. Switch from Port 25 to Port 587 (STARTTLS) or Port 465 (SSL/TLS).
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-[#F3F6FA] px-3 py-2">
                    <div className="font-semibold text-[#14263D]">
                      SSL Protocol Mismatch (ESOCKET / Wrong Version Number)
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      Encryption mode does not match the port. Always pair Port 587 with STARTTLS and Port 465 with SSL/TLS.
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-[#F3F6FA] px-3 py-2">
                    <div className="font-semibold text-[#14263D]">
                      Backend Unavailable (HTTP 405 Method Not Allowed)
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      Occurs when viewing a static-only preview/Shared URL without the Node.js server (`server.ts`). Open the Development App URL or run `npm run dev` on port 3000.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden h-fit">
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
      )}

      {/* Floating UI Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 w-full max-w-sm rounded-xl border p-4 shadow-xl transition-all ${
            toast.type === 'success'
              ? 'border-emerald-200 bg-[#E8F5EE] text-emerald-950'
              : 'border-rose-200 bg-rose-50 text-rose-950'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-700 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1 text-xs">
              <div className="font-bold text-[#14263D]">{toast.title}</div>
              <p className="mt-0.5 leading-relaxed">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss notification"
              className="rounded p-0.5 text-slate-500 hover:bg-black/5 hover:text-[#14263D]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
