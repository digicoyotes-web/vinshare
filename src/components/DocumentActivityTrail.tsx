import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Database,
  History,
  Mail,
  Paperclip,
  Send,
} from 'lucide-react';
import { isSupabaseConfigured } from '../services/supabase';
import type { DocumentVersionSnapshot, ProjectEmailRecord } from '../types/erp';

interface DocumentActivityTrailProps {
  entityLabel: string;
  snapshots: DocumentVersionSnapshot[];
  emails?: ProjectEmailRecord[];
  onOpenVersions?: () => void;
  onOpenEmail?: () => void;
  onOpenEmailHub?: () => void;
  showEmailLog?: boolean;
}

export const DocumentActivityTrail: React.FC<DocumentActivityTrailProps> = ({
  entityLabel,
  snapshots,
  emails = [],
  onOpenVersions,
  onOpenEmail,
  onOpenEmailHub,
  showEmailLog = true,
}) => {
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden no-print">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-[#F3F6FA]/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-[#2463EB]" />
          <div>
            <h3 className="text-xs font-bold text-[#14263D]">
              Saved Snapshots & Email Log · {entityLabel}
            </h3>
            <p className="text-[11px] text-slate-500">
              Stored in{' '}
              <span className="font-medium text-slate-700">
                Browser Storage (localStorage)
              </span>
              {isSupabaseConfigured ? (
                <span className="text-emerald-700 font-semibold"> + Supabase Cloud</span>
              ) : (
                <span> (local persistence active)</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="rounded bg-white border border-slate-200 px-2 py-0.5 font-mono font-semibold text-[#14263D] tabular-nums">
            {snapshots.length} Saved
          </span>
          {showEmailLog && (
            <span className="rounded bg-white border border-slate-200 px-2 py-0.5 font-mono font-semibold text-[#2463EB] tabular-nums">
              {emails.length} Emails
            </span>
          )}
        </div>
      </div>

      <div
        className={`grid grid-cols-1 ${
          showEmailLog ? 'lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x' : ''
        } divide-slate-200`}
      >
        {/* Saved Snapshots Panel */}
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#14263D]">
              <History className="h-3.5 w-3.5 text-[#2463EB]" />
              Saved Snapshots ({snapshots.length})
            </div>
            {onOpenVersions && (
              <button
                type="button"
                onClick={onOpenVersions}
                className="text-[11px] font-semibold text-[#2463EB] hover:underline"
              >
                Manage Versions
              </button>
            )}
          </div>

          {snapshots.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-[#F3F6FA]/50 p-3 text-[11px] text-slate-500">
              No saved snapshots recorded yet. Click <strong className="text-[#14263D]">Save</strong> above to store a timestamped snapshot here.
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
              {snapshots.map((snap, idx) => (
                <div
                  key={snap.id}
                  className="rounded-lg border border-slate-200 bg-[#F3F6FA]/40 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-[#14263D]">{snap.version}</span>
                      <span className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                        {snap.statusLabel}
                      </span>
                      {idx === 0 && (
                        <span className="rounded bg-[#E8F5EE] px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                          Latest Save
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-[#14263D] tabular-nums">
                      {snap.summaryValue}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-700">{snap.note}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500 tabular-nums">
                    Saved by {snap.savedBy} · {new Date(snap.savedAt).toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dispatched / Received Email Log Panel */}
        {showEmailLog && (
          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#14263D]">
                <Mail className="h-3.5 w-3.5 text-[#2463EB]" />
                Stored Emails ({emails.length})
              </div>
              <div className="flex items-center gap-2.5">
                {onOpenEmail && (
                  <button
                    type="button"
                    onClick={onOpenEmail}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2463EB] hover:underline"
                  >
                    <Send className="h-3 w-3" />
                    Send Email
                  </button>
                )}
                {onOpenEmailHub && (
                  <button
                    type="button"
                    onClick={onOpenEmailHub}
                    className="text-[11px] font-medium text-slate-600 hover:text-[#14263D] hover:underline"
                  >
                    Open Email Hub
                  </button>
                )}
              </div>
            </div>

            {emails.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-[#F3F6FA]/50 p-3 text-[11px] text-slate-500">
                No emails sent for this record yet. Click <strong className="text-[#14263D]">Email</strong> above to compose and store correspondence here.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                {emails.map((em) => {
                  const expanded = expandedEmailId === em.id;
                  const attachments =
                    em.attachmentNames && em.attachmentNames.length > 0
                      ? em.attachmentNames
                      : em.attachmentName
                      ? [em.attachmentName]
                      : [];
                  return (
                    <div
                      key={em.id}
                      className="rounded-lg border border-slate-200 bg-[#F3F6FA]/40 px-3 py-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedEmailId(expanded ? null : em.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2463EB]">
                            {em.direction === 'outbound' ? (
                              <ArrowUpRight className="h-3 w-3" />
                            ) : (
                              <ArrowDownLeft className="h-3 w-3 text-emerald-600" />
                            )}
                            {em.direction === 'outbound' ? `To: ${em.toEmail}` : `From: ${em.fromEmail}`}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                              em.deliveryChannel === 'smtp'
                                ? 'text-emerald-800 bg-[#E8F5EE]'
                                : 'text-slate-700 bg-slate-100'
                            }`}
                          >
                            {em.deliveryChannel === 'smtp' ? 'Sent via SMTP' : em.status}
                            {expanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </span>
                        </div>
                        <div className="mt-1 font-semibold text-[#14263D] truncate">
                          {em.subject}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500 tabular-nums">
                          {em.sentBy} ({em.fromEmail}) · {new Date(em.sentAt).toLocaleString('en-IN')}
                          {em.smtpMessageId ? ` · SMTP ID: ${em.smtpMessageId}` : ''}
                        </div>
                      </button>

                      {attachments.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {attachments.map((att) => (
                            <span
                              key={att}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#14263D]"
                            >
                              <Paperclip className="h-2.5 w-2.5 text-[#2463EB]" />
                              {att}
                            </span>
                          ))}
                        </div>
                      )}

                      {expanded && (
                        <pre className="mt-2 whitespace-pre-wrap rounded border border-slate-200 bg-white p-2.5 font-sans text-[11px] text-slate-700 leading-relaxed">
                          {em.body}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
