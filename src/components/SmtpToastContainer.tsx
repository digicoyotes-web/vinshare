import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Stethoscope,
  Terminal,
  X,
} from 'lucide-react';
import {
  dismissSmtpToast,
  markSmtpNotificationRead,
  useSmtpNotifications,
  type SmtpFailureNotification,
} from '../services/smtpNotifications';

interface SmtpToastContainerProps {
  onOpenDiagnosticTool: (notification: SmtpFailureNotification) => void;
  onInspectActivityLog: (notification: SmtpFailureNotification) => void;
}

const ToastItem: React.FC<{
  item: SmtpFailureNotification;
  onOpenDiagnosticTool: (item: SmtpFailureNotification) => void;
  onInspectActivityLog: (item: SmtpFailureNotification) => void;
}> = ({ item, onOpenDiagnosticTool, onInspectActivityLog }) => {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => {
      dismissSmtpToast(item.id);
    }, 12000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [item.id, paused]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="w-full max-w-md rounded-xl border border-rose-200 bg-white p-4 shadow-xl ring-1 ring-rose-900/5 transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-[#DC2626] border border-rose-200">
          <AlertCircle className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#DC2626]">
                {item.failureCategory}
                {item.smtpErrorCode ? ` · ${item.smtpErrorCode}` : ''}
              </div>
              <div className="font-bold text-[#14263D] leading-snug">
                {item.plainEnglishTitle}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismissSmtpToast(item.id)}
              aria-label="Dismiss email failure notification"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-[#14263D]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {(item.to || item.subject) && (
            <div className="truncate font-mono text-[11px] text-slate-500">
              {item.to ? `To: ${item.to}` : ''}
              {item.to && item.subject ? ' · ' : ''}
              {item.subject ? item.subject : ''}
            </div>
          )}

          <p className="text-[11px] text-slate-700 leading-relaxed">
            {item.plainEnglishExplanation}
          </p>

          {item.actionHint && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-[11px] text-amber-950">
              <span className="font-semibold">Fix: </span>
              {item.actionHint}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                markSmtpNotificationRead(item.id);
                onOpenDiagnosticTool(item);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-[#14263D] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
            >
              <Stethoscope className="h-3 w-3" />
              Run SMTP Diagnostic
            </button>
            {item.logEntryId && (
              <button
                type="button"
                onClick={() => {
                  markSmtpNotificationRead(item.id);
                  onInspectActivityLog(item);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-[#F3F6FA] px-2.5 py-1 text-[11px] font-semibold text-[#14263D] hover:bg-slate-200"
              >
                <Terminal className="h-3 w-3 text-[#2463EB]" />
                Inspect Trace
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const SmtpToastContainer: React.FC<SmtpToastContainerProps> = ({
  onOpenDiagnosticTool,
  onInspectActivityLog,
}) => {
  const { activeToasts } = useSmtpNotifications();

  if (activeToasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Real-time SMTP dispatch notifications"
      className="fixed bottom-5 right-5 z-[60] flex w-[calc(100vw-2.5rem)] max-w-md flex-col gap-2.5 pointer-events-auto"
    >
      {activeToasts.map((item) => (
        <ToastItem
          key={item.id}
          item={item}
          onOpenDiagnosticTool={onOpenDiagnosticTool}
          onInspectActivityLog={onInspectActivityLog}
        />
      ))}
    </div>
  );
};
