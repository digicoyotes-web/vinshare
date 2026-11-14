import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, Mail, Paperclip, Send, X } from 'lucide-react';
import type { EmailEntityType } from '../types/erp';

export interface EmailComposeContext {
  projectId: string;
  projectCode: string;
  entityType: EmailEntityType;
  entityId: string;
  entityReference: string;
  clientId: string;
  clientName: string;
  toEmail: string;
  ccEmails?: string;
  subject: string;
  body: string;
  attachmentName?: string;
  onDownloadPdf?: () => void;
}

interface EmailComposeModalProps {
  context: EmailComposeContext | null;
  senderEmail: string;
  senderName: string;
  onClose: () => void;
  onDownloadAttachment?: () => void;
  onSend: (payload: EmailComposeContext & { attachPdf: boolean }) => void;
  onOpenProjectEmailSection?: () => void;
}

export const EmailComposeModal: React.FC<EmailComposeModalProps> = ({
  context,
  senderEmail,
  senderName,
  onClose,
  onDownloadAttachment,
  onSend,
  onOpenProjectEmailSection,
}) => {
  const [toEmail, setToEmail] = useState('');
  const [ccEmails, setCcEmails] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [sentDone, setSentDone] = useState(false);

  useEffect(() => {
    if (context) {
      setToEmail(context.toEmail);
      setCcEmails(context.ccEmails || '');
      setSubject(context.subject);
      setBody(context.body);
      setAttachPdf(Boolean(context.attachmentName));
      setSentDone(false);
    }
  }, [context]);

  if (!context) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toEmail.trim() || !subject.trim() || !body.trim()) return;
    onSend({
      ...context,
      toEmail: toEmail.trim(),
      ccEmails: ccEmails.trim(),
      subject: subject.trim(),
      body: body.trim(),
      attachmentName: attachPdf ? context.attachmentName : undefined,
      attachPdf,
    });
    setSentDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="bg-[#14263D] px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Mail className="h-4 w-4 text-sky-300" />
            <div>
              <h2 className="text-sm font-semibold">
                Email {context.entityType === 'proposal' ? 'Proposal' : context.entityType === 'invoice' ? 'Tax Invoice' : 'Project Communication'}
              </h2>
              <p className="text-[11px] text-slate-300">
                {context.entityReference} · {context.clientName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-300 hover:bg-white/10 hover:text-white"
            aria-label="Close email modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {sentDone ? (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-[#E8F5EE] p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-900">
                <div className="font-semibold text-sm">Email Dispatched & Logged to Project Email Section</div>
                <p className="mt-1">
                  Sent to <span className="font-mono font-semibold">{toEmail}</span> from{' '}
                  <span className="font-mono">{senderName} &lt;{senderEmail}&gt;</span>
                  {attachPdf && context.attachmentName ? ` with ${context.attachmentName}` : ''}.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {onOpenProjectEmailSection && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenProjectEmailSection();
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#14263D] hover:bg-slate-50"
                >
                  View in Project Email Section
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-[#2463EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">To (Recipient Email)</label>
                <input
                  type="email"
                  required
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-[#14263D] focus:border-[#2463EB] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">CC (Optional)</label>
                <input
                  type="text"
                  value={ccEmails}
                  onChange={(e) => setCcEmails(e.target.value)}
                  placeholder="accounts@client.com, ops@fm-erp.in"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-[#14263D] focus:border-[#2463EB] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Subject</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-[#14263D] focus:border-[#2463EB] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Message Body</label>
              <textarea
                rows={7}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-[#14263D] leading-relaxed focus:border-[#2463EB] focus:outline-none"
              />
            </div>

            {context.attachmentName && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-[#F3F6FA] px-3.5 py-2.5 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attachPdf}
                    onChange={(e) => setAttachPdf(e.target.checked)}
                  />
                  <Paperclip className="h-3.5 w-3.5 text-[#2463EB]" />
                  <span className="font-mono font-medium text-[#14263D]">{context.attachmentName}</span>
                </label>
                {(onDownloadAttachment || context.onDownloadPdf) && (
                  <button
                    type="button"
                    onClick={() => (context.onDownloadPdf || onDownloadAttachment)?.()}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2463EB] hover:underline"
                  >
                    <Download className="h-3 w-3" />
                    Preview / Download PDF
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="text-[11px] text-slate-500">
                From: <span className="font-medium text-slate-700">{senderName}</span> ({senderEmail})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send Email
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
