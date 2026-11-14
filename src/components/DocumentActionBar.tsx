import React from 'react';
import { Check, Download, History, Mail, Save } from 'lucide-react';

interface DocumentActionBarProps {
  onSave: () => void;
  onOpenVersions: () => void;
  onOpenEmail: () => void;
  onDownloadPdf: () => void;
  versionCount?: number;
  lastSavedAt?: string | null;
  saveDisabled?: boolean;
}

export const DocumentActionBar: React.FC<DocumentActionBarProps> = ({
  onSave,
  onOpenVersions,
  onOpenEmail,
  onDownloadPdf,
  versionCount,
  lastSavedAt,
  saveDisabled = false,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2 no-print">
      <button
        type="button"
        onClick={onSave}
        disabled={saveDisabled}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#14263D] shadow-xs transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2463EB] disabled:opacity-50 whitespace-nowrap shrink-0"
      >
        {lastSavedAt ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Save className="h-3.5 w-3.5 text-[#14263D]" />
        )}
        <span>{lastSavedAt ? 'Saved' : 'Save'}</span>
      </button>

      <button
        type="button"
        onClick={onOpenVersions}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#14263D] shadow-xs transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2463EB] whitespace-nowrap shrink-0"
      >
        <History className="h-3.5 w-3.5 text-[#14263D]" />
        <span>Versions{typeof versionCount === 'number' ? ` (${versionCount})` : ''}</span>
      </button>

      <button
        type="button"
        onClick={onOpenEmail}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#14263D] shadow-xs transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2463EB] whitespace-nowrap shrink-0"
      >
        <Mail className="h-3.5 w-3.5 text-[#14263D]" />
        <span>Email</span>
      </button>

      <button
        type="button"
        onClick={onDownloadPdf}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5265F5] via-[#3A90D6] to-[#12C498] px-4.5 py-2 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2463EB] whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" />
        <span>Download PDF</span>
      </button>
    </div>
  );
};
