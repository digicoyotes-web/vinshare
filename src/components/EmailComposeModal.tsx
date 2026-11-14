import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Mail,
  Paperclip,
  Search,
  Send,
  X,
} from 'lucide-react';
import type { EmailEntityType, VirtualDocumentFile } from '../types/erp';
import { formatFileBytes } from '../utils/virtualFileSystem';

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
  vaultFiles: VirtualDocumentFile[];
  senderEmail: string;
  senderName: string;
  onClose: () => void;
  onDownloadAttachment?: () => void;
  onSend: (
    payload: EmailComposeContext & { attachPdf: boolean; attachmentNames: string[] }
  ) => void;
  onOpenProjectEmailSection?: () => void;
}

type FolderFilter = 'ALL' | 'Proposals' | 'Invoices' | 'Project-Reports';

export const EmailComposeModal: React.FC<EmailComposeModalProps> = ({
  context,
  vaultFiles,
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
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [fsOpen, setFsOpen] = useState(false);
  const [activeFolder, setActiveFolder] = useState<FolderFilter>('ALL');
  const [clientOnlyFilter, setClientOnlyFilter] = useState(false);
  const [fsQuery, setFsQuery] = useState('');
  const [sentDone, setSentDone] = useState(false);

  useEffect(() => {
    if (context) {
      setToEmail(context.toEmail);
      setCcEmails(context.ccEmails || '');
      setSubject(context.subject);
      setBody(context.body);
      setSentDone(false);
      setFsOpen(false);
      setFsQuery('');
      setActiveFolder('ALL');
      setClientOnlyFilter(false);

      // Auto-select matching file from virtual file system if present
      if (context.attachmentName) {
        const matched = vaultFiles.find((f) => f.filename === context.attachmentName);
        if (matched) {
          setSelectedFileIds([matched.id]);
        } else {
          setSelectedFileIds(['__CONTEXT_PRIMARY__']);
        }
      } else {
        setSelectedFileIds([]);
      }
    }
  }, [context, vaultFiles]);

  const resolvedSelectedFiles = useMemo(() => {
    if (!context) return [];
    const list: Array<{
      id: string;
      filename: string;
      virtualPath: string;
      sizeLabel: string;
      onDownload?: () => void;
    }> = [];

    for (const id of selectedFileIds) {
      if (id === '__CONTEXT_PRIMARY__' && context.attachmentName) {
        list.push({
          id,
          filename: context.attachmentName,
          virtualPath: `/ERP-Vault/Active/${context.attachmentName}`,
          sizeLabel: 'PDF',
          onDownload: context.onDownloadPdf || onDownloadAttachment,
        });
      } else {
        const vf = vaultFiles.find((f) => f.id === id);
        if (vf) {
          list.push({
            id: vf.id,
            filename: vf.filename,
            virtualPath: vf.virtualPath,
            sizeLabel: formatFileBytes(vf.sizeBytes),
            onDownload: vf.buildPdf,
          });
        }
      }
    }
    return list;
  }, [context, selectedFileIds, vaultFiles, onDownloadAttachment]);

  const folderCounts = useMemo(
    () => ({
      ALL: vaultFiles.length,
      Proposals: vaultFiles.filter((f) => f.folder === 'Proposals').length,
      Invoices: vaultFiles.filter((f) => f.folder === 'Invoices').length,
      'Project-Reports': vaultFiles.filter((f) => f.folder === 'Project-Reports').length,
    }),
    [vaultFiles]
  );

  const visibleVaultFiles = useMemo(() => {
    const q = fsQuery.trim().toLowerCase();
    return vaultFiles.filter((f) => {
      if (activeFolder !== 'ALL' && f.folder !== activeFolder) return false;
      if (clientOnlyFilter && context?.clientId && f.clientId !== context.clientId) return false;
      if (
        q &&
        !f.filename.toLowerCase().includes(q) &&
        !f.clientName.toLowerCase().includes(q) &&
        !f.entityReference.toLowerCase().includes(q) &&
        !f.note.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [vaultFiles, activeFolder, clientOnlyFilter, context?.clientId, fsQuery]);

  if (!context) return null;

  const toggleFileAttachment = (fileId: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toEmail.trim() || !subject.trim() || !body.trim()) return;
    const names = resolvedSelectedFiles.map((f) => f.filename);
    onSend({
      ...context,
      toEmail: toEmail.trim(),
      ccEmails: ccEmails.trim(),
      subject: subject.trim(),
      body: body.trim(),
      attachmentName: names[0],
      attachmentNames: names,
      attachPdf: names.length > 0,
    });
    setSentDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="bg-[#14263D] px-5 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Mail className="h-4 w-4 text-sky-300" />
            <div>
              <h2 className="text-sm font-semibold">
                Email{' '}
                {context.entityType === 'proposal'
                  ? 'Proposal'
                  : context.entityType === 'invoice'
                  ? 'Tax Invoice'
                  : 'Project Communication'}
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
                  <span className="font-mono">
                    {senderName} &lt;{senderEmail}&gt;
                  </span>
                  {resolvedSelectedFiles.length > 0
                    ? ` with ${resolvedSelectedFiles.length} attachment(s): ${resolvedSelectedFiles
                        .map((f) => f.filename)
                        .join(', ')}`
                    : ''}
                  .
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
          <form onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  To (Recipient Email)
                </label>
                <input
                  type="email"
                  required
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-[#14263D] focus:border-[#2463EB] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  CC (Optional)
                </label>
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
                rows={5}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-[#14263D] leading-relaxed focus:border-[#2463EB] focus:outline-none"
              />
            </div>

            {/* Attached Files Strip + ERP Virtual File System Trigger */}
            <div className="rounded-lg border border-slate-200 bg-[#F3F6FA] p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#14263D]">
                  <Paperclip className="h-3.5 w-3.5 text-[#2463EB]" />
                  <span>Attached Snapshots ({resolvedSelectedFiles.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFsOpen(!fsOpen)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#14263D] hover:bg-slate-50"
                >
                  <HardDrive className="h-3.5 w-3.5 text-[#2463EB]" />
                  {fsOpen ? 'Hide ERP File System' : 'Attach from ERP File System'}
                </button>
              </div>

              {resolvedSelectedFiles.length === 0 ? (
                <div className="text-[11px] text-slate-500">
                  No documents attached. Click <span className="font-semibold text-[#14263D]">Attach from ERP File System</span> to pick Proposal, Invoice, or Project Report PDFs.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {resolvedSelectedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]"
                    >
                      <FileText className="h-3.5 w-3.5 text-[#2463EB] shrink-0" />
                      <span className="font-mono font-medium text-[#14263D]">{file.filename}</span>
                      <span className="text-slate-400 tabular-nums">({file.sizeLabel})</span>
                      {file.onDownload && (
                        <button
                          type="button"
                          onClick={file.onDownload}
                          title="Preview / Download PDF"
                          className="text-[#2463EB] hover:text-blue-800 p-0.5"
                        >
                          <Download className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleFileAttachment(file.id)}
                        title="Remove attachment"
                        className="text-slate-400 hover:text-rose-600 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Simulated Virtual File-System Explorer */}
              {fsOpen && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-[#14263D]">
                      <FolderOpen className="h-3.5 w-3.5 text-[#2463EB]" />
                      <span>/ERP-Vault/{activeFolder === 'ALL' ? '' : activeFolder}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {context.clientId && (
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={clientOnlyFilter}
                            onChange={(e) => setClientOnlyFilter(e.target.checked)}
                          />
                          <span>{context.clientName} only</span>
                        </label>
                      )}
                      <div className="relative">
                        <Search className="h-3 w-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={fsQuery}
                          onChange={(e) => setFsQuery(e.target.value)}
                          placeholder="Search snapshots..."
                          className="w-44 rounded-md border border-slate-300 bg-white pl-7 pr-2 py-1 text-[11px] focus:border-[#2463EB] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12">
                    {/* Directory Tree */}
                    <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-slate-200 bg-[#F3F6FA]/50 p-2 space-y-1">
                      {(
                        [
                          { id: 'ALL', label: 'All Snapshots' },
                          { id: 'Proposals', label: '/Proposals' },
                          { id: 'Invoices', label: '/Invoices' },
                          { id: 'Project-Reports', label: '/Project-Reports' },
                        ] as const
                      ).map((dir) => {
                        const active = activeFolder === dir.id;
                        return (
                          <button
                            key={dir.id}
                            type="button"
                            onClick={() => setActiveFolder(dir.id)}
                            className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                              active
                                ? 'bg-[#2463EB] text-white'
                                : 'text-[#14263D] hover:bg-slate-200/60'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              {active ? (
                                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <Folder className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                              )}
                              <span className="truncate">{dir.label}</span>
                            </span>
                            <span
                              className={`text-[10px] tabular-nums ${
                                active ? 'text-blue-100' : 'text-slate-500'
                              }`}
                            >
                              {folderCounts[dir.id]}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* File List */}
                    <div className="md:col-span-8 max-h-56 overflow-y-auto divide-y divide-slate-100">
                      {visibleVaultFiles.length === 0 ? (
                        <div className="p-5 text-center text-xs text-slate-500">
                          No snapshot files match this folder or filter.
                        </div>
                      ) : (
                        visibleVaultFiles.map((vf) => {
                          const isAttached = selectedFileIds.includes(vf.id);
                          return (
                            <div
                              key={vf.id}
                              className={`flex items-center justify-between gap-2 px-3 py-2 text-[11px] hover:bg-[#F3F6FA]/70 ${
                                isAttached ? 'bg-blue-50/40' : ''
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <FileText className="h-3.5 w-3.5 text-[#2463EB] shrink-0" />
                                  <span className="font-mono font-semibold text-[#14263D] truncate">
                                    {vf.filename}
                                  </span>
                                  <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                                    {formatFileBytes(vf.sizeBytes)}
                                  </span>
                                </div>
                                <div className="mt-0.5 text-[10px] text-slate-500 truncate">
                                  {vf.clientName} · {vf.versionLabel} · {vf.note}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={vf.buildPdf}
                                  title="Download PDF copy"
                                  className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:text-[#2463EB]"
                                >
                                  <Download className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleFileAttachment(vf.id)}
                                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
                                    isAttached
                                      ? 'bg-[#E8F5EE] text-emerald-800 border border-emerald-200'
                                      : 'bg-[#14263D] text-white hover:bg-slate-800'
                                  }`}
                                >
                                  {isAttached ? (
                                    <>
                                      <Check className="h-3 w-3" />
                                      Attached
                                    </>
                                  ) : (
                                    'Attach'
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

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
