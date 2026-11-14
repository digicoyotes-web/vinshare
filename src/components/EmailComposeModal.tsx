import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Loader2,
  Mail,
  Paperclip,
  Search,
  Send,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  buildMailtoFallbackHref,
  fetchSmtpStatus,
  getDevelopmentBackendUrl,
  saveAndVerifySmtpConfig,
  sendEmailViaSmtp,
  SmtpConnectionError,
  type SmtpAttachmentInput,
  type SmtpStatusDto,
} from '../services/smtpApi';
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
  buildAttachmentBlob?: () => Blob;
}

export interface DispatchedEmailPayload extends EmailComposeContext {
  attachPdf: boolean;
  attachmentNames: string[];
  deliveryChannel: 'smtp' | 'erp_log';
  smtpMessageId?: string;
  smtpHost?: string;
  fromEmailUsed?: string;
}

interface EmailComposeModalProps {
  context: EmailComposeContext | null;
  vaultFiles: VirtualDocumentFile[];
  senderEmail: string;
  senderName: string;
  onClose: () => void;
  onDownloadAttachment?: () => void;
  onSend: (payload: DispatchedEmailPayload) => void;
  onOpenProjectEmailSection?: () => void;
}

type FolderFilter = 'ALL' | 'Proposals' | 'Invoices' | 'Project-Reports';

const EMAIL_ADDR_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmailList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

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

  // SMTP Status & Quick Configuration state
  const [smtpStatus, setSmtpStatus] = useState<SmtpStatusDto | null>(null);
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpConfigOpen, setSmtpConfigOpen] = useState(false);
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('Vinshar Facility Management ERP');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpSaveNotice, setSmtpSaveNotice] = useState<string | null>(null);

  const [confirmStep, setConfirmStep] = useState(false);
  const [verifyingBeforeReview, setVerifyingBeforeReview] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [errorClues, setErrorClues] = useState<string[]>([]);
  const [isStaticPreviewError, setIsStaticPreviewError] = useState(false);
  const [sentResult, setSentResult] = useState<{
    channel: 'smtp' | 'erp_log';
    messageId?: string;
    smtpHost?: string;
    fromEmail: string;
    toEmail: string;
  } | null>(null);

  useEffect(() => {
    if (!context) return;
    setToEmail(context.toEmail);
    setCcEmails(context.ccEmails || '');
    setSubject(context.subject);
    setBody(context.body);
    setSentResult(null);
    setConfirmStep(false);
    setIsSending(false);
    setErrorMsg(null);
    setErrorHint(null);
    setErrorClues([]);
    setIsStaticPreviewError(false);
    setSmtpSaveNotice(null);
    setFsOpen(false);
    setFsQuery('');
    setActiveFolder('ALL');
    setClientOnlyFilter(false);

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

    let cancelled = false;
    setSmtpLoading(true);
    fetchSmtpStatus()
      .then((status) => {
        if (cancelled) return;
        setSmtpStatus(status);
        setSmtpHost(status.host || 'smtp.gmail.com');
        setSmtpPort(status.port || 587);
        setSmtpSecure(status.secure);
        setSmtpUser(status.user || '');
        setSmtpFromName(status.fromName || 'Vinshar Facility Management ERP');
        setSmtpFromEmail(status.fromEmail || status.user || '');
        setSmtpConfigOpen(!status.configured);
      })
      .catch((err) => {
        if (!cancelled) {
          setSmtpConfigOpen(true);
          if (err instanceof SmtpConnectionError) {
            setErrorMsg(err.message);
            setErrorHint(err.actionHint || null);
            setErrorClues(err.debuggingClues || []);
            setIsStaticPreviewError(err.status === 405 || err.smtpErrorCode === 'HTTP_405');
          }
        }
      })
      .finally(() => {
        if (!cancelled) setSmtpLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [context, vaultFiles]);

  const resolvedSelectedFiles = useMemo(() => {
    if (!context) return [];
    const list: Array<{
      id: string;
      filename: string;
      virtualPath: string;
      sizeLabel: string;
      onDownload?: () => void;
      buildBlob?: () => Blob;
    }> = [];

    for (const id of selectedFileIds) {
      if (id === '__CONTEXT_PRIMARY__' && context.attachmentName) {
        list.push({
          id,
          filename: context.attachmentName,
          virtualPath: `/ERP-Vault/Active/${context.attachmentName}`,
          sizeLabel: 'PDF',
          onDownload: context.onDownloadPdf || onDownloadAttachment,
          buildBlob: context.buildAttachmentBlob,
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
            buildBlob: vf.buildPdfBlob,
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

  const applySmtpPreset = (preset: 'gmail' | 'office365' | 'zoho') => {
    if (preset === 'gmail') {
      setSmtpHost('smtp.gmail.com');
      setSmtpPort(587);
      setSmtpSecure(false);
    } else if (preset === 'office365') {
      setSmtpHost('smtp.office365.com');
      setSmtpPort(587);
      setSmtpSecure(false);
    } else if (preset === 'zoho') {
      setSmtpHost('smtp.zoho.in');
      setSmtpPort(465);
      setSmtpSecure(true);
    }
  };

  const handleSaveVerifySmtp = async () => {
    setErrorMsg(null);
    setErrorHint(null);
    setErrorClues([]);
    setIsStaticPreviewError(false);
    setSmtpSaveNotice(null);

    const trimmedUser = smtpUser.trim();
    if (!trimmedUser || /^\d+$/.test(trimmedUser) || !trimmedUser.includes('@')) {
      setErrorMsg(
        'Enter your full SMTP email address in "SMTP Username / Email" (e.g. digicoyotes@gmail.com), not a numeric value like 1234567890.'
      );
      setErrorHint(
        'Use your full Gmail address (e.g. digicoyotes@gmail.com) and a 16-character Google App Password.'
      );
      return;
    }
    if (!smtpPass.trim() && !smtpStatus?.hasPassword) {
      setErrorMsg('Enter your 16-character SMTP Password / Google App Password.');
      setErrorHint(
        'For Gmail, turn on 2-Step Verification and generate an App Password at myaccount.google.com/apppasswords.'
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
      setSmtpStatus(updated);
      setSmtpPass('');
      setSmtpConfigOpen(false);
      setSmtpSaveNotice(
        `SMTP verified & connected (${updated.host}:${updated.port} as ${updated.fromEmail}).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'SMTP verification failed.');
      if (err instanceof SmtpConnectionError) {
        setErrorHint(err.actionHint || null);
        setErrorClues(err.debuggingClues || []);
        setIsStaticPreviewError(err.status === 405 || err.smtpErrorCode === 'HTTP_405');
      }
    } finally {
      setSmtpSaving(false);
    }
  };

  const validateFields = (): boolean => {
    const toList = parseEmailList(toEmail);
    if (toList.length === 0 || toList.some((addr) => !EMAIL_ADDR_RE.test(addr))) {
      setErrorMsg('Please enter a valid recipient email address (e.g. digicoyotes@gmail.com).');
      return false;
    }
    const ccList = parseEmailList(ccEmails);
    if (ccList.some((addr) => !EMAIL_ADDR_RE.test(addr))) {
      setErrorMsg('One or more CC email addresses look invalid.');
      return false;
    }
    if (!subject.trim()) {
      setErrorMsg('Please enter an email subject.');
      return false;
    }
    if (!body.trim()) {
      setErrorMsg('Please enter the message body.');
      return false;
    }
    return true;
  };

  const handleReviewBeforeSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!validateFields()) return;

    const hasInlineCredentials = Boolean(
      smtpHost.trim() &&
        smtpUser.trim() &&
        (smtpPass.trim() || smtpStatus?.hasPassword)
    );

    if (!smtpStatus?.configured || (smtpConfigOpen && smtpPass.trim())) {
      if (!hasInlineCredentials) {
        setSmtpConfigOpen(true);
        setErrorMsg(
          'Enter your SMTP Username / Email and Password / App Password in the SMTP Server Settings section above before sending.'
        );
        return;
      }

      setVerifyingBeforeReview(true);
      setErrorHint(null);
      setErrorClues([]);
      setIsStaticPreviewError(false);
      try {
        const updated = await saveAndVerifySmtpConfig({
          host: smtpHost.trim(),
          port: Number(smtpPort) || 587,
          secure: smtpSecure,
          user: smtpUser.trim(),
          pass: smtpPass || undefined,
          fromName: smtpFromName.trim() || 'Vinshar Facility Management ERP',
          fromEmail: (smtpFromEmail || smtpUser).trim(),
          verify: true,
        });
        setSmtpStatus(updated);
        setSmtpPass('');
        setSmtpConfigOpen(false);
        setSmtpSaveNotice(
          `SMTP verified & connected (${updated.host}:${updated.port} as ${updated.fromEmail}).`
        );
        setConfirmStep(true);
      } catch (err) {
        setSmtpConfigOpen(true);
        setErrorMsg(
          err instanceof Error ? err.message : 'SMTP verification failed.'
        );
        if (err instanceof SmtpConnectionError) {
          setErrorHint(err.actionHint || null);
          setErrorClues(err.debuggingClues || []);
          setIsStaticPreviewError(err.status === 405 || err.smtpErrorCode === 'HTTP_405');
        }
      } finally {
        setVerifyingBeforeReview(false);
      }
      return;
    }

    setConfirmStep(true);
  };

  const handleConfirmSendSmtp = async () => {
    setErrorMsg(null);
    setIsSending(true);
    try {
      const attachments: SmtpAttachmentInput[] = [];
      for (const file of resolvedSelectedFiles) {
        if (file.buildBlob) {
          attachments.push({
            filename: file.filename,
            blob: file.buildBlob(),
            contentType: 'application/pdf',
          });
        }
      }

      const result = await sendEmailViaSmtp({
        to: toEmail.trim(),
        cc: ccEmails.trim() || undefined,
        subject: subject.trim(),
        body: body.trim(),
        replyTo: senderEmail,
        attachments,
      });

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
        deliveryChannel: 'smtp',
        smtpMessageId: result.messageId,
        smtpHost: result.smtpHost,
        fromEmailUsed: result.fromEmail,
      });

      setSentResult({
        channel: 'smtp',
        messageId: result.messageId,
        smtpHost: result.smtpHost,
        fromEmail: result.fromEmail,
        toEmail: toEmail.trim(),
      });
      setConfirmStep(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'SMTP delivery failed. Check your SMTP configuration.'
      );
      if (err instanceof SmtpConnectionError) {
        setErrorHint(err.actionHint || null);
        setErrorClues(err.debuggingClues || []);
        setIsStaticPreviewError(err.status === 405 || err.smtpErrorCode === 'HTTP_405');
      } else {
        setErrorHint(null);
        setErrorClues([]);
        setIsStaticPreviewError(false);
      }
      setConfirmStep(false);
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveErpLogOnly = () => {
    setErrorMsg(null);
    if (!validateFields()) return;
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
      deliveryChannel: 'erp_log',
      fromEmailUsed: senderEmail,
    });
    setSentResult({
      channel: 'erp_log',
      fromEmail: senderEmail,
      toEmail: toEmail.trim(),
    });
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
                  : 'Project Communication'}{' '}
                via SMTP
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

        {sentResult ? (
          <div className="p-6 space-y-4">
            <div
              className={`flex items-start gap-3 rounded-lg border p-4 ${
                sentResult.channel === 'smtp'
                  ? 'border-emerald-200 bg-[#E8F5EE]'
                  : 'border-amber-200 bg-amber-50'
              }`}
            >
              <CheckCircle2
                className={`h-5 w-5 shrink-0 mt-0.5 ${
                  sentResult.channel === 'smtp' ? 'text-emerald-700' : 'text-amber-700'
                }`}
              />
              <div
                className={`text-xs ${
                  sentResult.channel === 'smtp' ? 'text-emerald-900' : 'text-amber-900'
                }`}
              >
                <div className="font-semibold text-sm">
                  {sentResult.channel === 'smtp'
                    ? 'Email Sent via SMTP & Saved to ERP Log'
                    : 'Saved to Internal ERP Log Only (Not Sent via SMTP)'}
                </div>
                <p className="mt-1">
                  {sentResult.channel === 'smtp' ? 'Delivered via SMTP to ' : 'Logged for '}
                  <span className="font-mono font-semibold">{sentResult.toEmail}</span> from{' '}
                  <span className="font-mono">{sentResult.fromEmail}</span>
                  {resolvedSelectedFiles.length > 0
                    ? ` with ${resolvedSelectedFiles.length} PDF attachment(s): ${resolvedSelectedFiles
                        .map((f) => f.filename)
                        .join(', ')}`
                    : ''}
                  .
                </p>
                {sentResult.messageId && (
                  <p className="mt-1 font-mono text-[11px] text-emerald-800">
                    SMTP Server: {sentResult.smtpHost} · Message ID: {sentResult.messageId}
                  </p>
                )}
                <p className="mt-1 text-[11px] opacity-90">
                  Stored permanently in this record&apos;s Saved Snapshots & Email Log and in the Project Emails hub.
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
        ) : confirmStep ? (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-4">
              <ShieldCheck className="h-5 w-5 text-[#2463EB] shrink-0 mt-0.5" />
              <div className="text-xs text-[#14263D]">
                <div className="font-bold text-sm">Confirm Live SMTP Email Dispatch</div>
                <p className="mt-0.5 text-slate-600">
                  This message will be transmitted over SMTP through{' '}
                  <span className="font-mono font-semibold text-[#14263D]">
                    {smtpStatus?.host}:{smtpStatus?.port}
                  </span>{' '}
                  to the recipient&apos;s mail server.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-[#F3F6FA]/60 p-4 space-y-2 text-xs">
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="font-semibold text-slate-500">SMTP Host</span>
                <span className="font-mono text-[#14263D]">
                  {smtpStatus?.host}:{smtpStatus?.port} ({smtpStatus?.secure ? 'SSL/TLS' : 'STARTTLS'})
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="font-semibold text-slate-500">From</span>
                <span className="font-mono text-[#14263D]">
                  {smtpStatus?.fromName} &lt;{smtpStatus?.fromEmail}&gt;
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="font-semibold text-slate-500">To</span>
                <span className="font-mono font-semibold text-[#2463EB]">{toEmail.trim()}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="font-semibold text-slate-500">CC</span>
                <span className="font-mono text-slate-700">{ccEmails.trim() || 'None'}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="font-semibold text-slate-500">Subject</span>
                <span className="font-semibold text-[#14263D]">{subject.trim()}</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className="font-semibold text-slate-500">Attachments</span>
                <div className="flex flex-wrap gap-1.5">
                  {resolvedSelectedFiles.length === 0 ? (
                    <span className="text-slate-500">No attachments</span>
                  ) : (
                    resolvedSelectedFiles.map((file) => (
                      <span
                        key={file.id}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-[#14263D]"
                      >
                        <Paperclip className="h-3 w-3 text-[#2463EB]" />
                        {file.filename} ({file.sizeLabel})
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-medium">{errorMsg}</div>
                  {errorHint && (
                    <div className="text-[11px] text-rose-900">
                      <span className="font-semibold">Fix: </span>
                      {errorHint}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isSending}
                onClick={() => setConfirmStep(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Edit
              </button>
              <button
                type="button"
                disabled={isSending}
                onClick={handleConfirmSendSmtp}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sending via SMTP...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Confirm & Send via SMTP
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleReviewBeforeSend} className="p-5 space-y-3.5 overflow-y-auto">
            {/* Live SMTP Server Connection Status + Inline Setup */}
            <div
              className={`rounded-lg border px-3.5 py-2.5 space-y-2.5 ${
                smtpStatus?.configured
                  ? 'border-emerald-200 bg-[#E8F5EE]/70'
                  : 'border-amber-200 bg-amber-50/70'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#14263D]">
                    <Server
                      className={`h-3.5 w-3.5 ${
                        smtpStatus?.configured ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    />
                    {smtpLoading
                      ? 'Checking SMTP server configuration...'
                      : smtpStatus?.configured
                      ? `SMTP Ready · ${smtpStatus.host}:${smtpStatus.port} (${smtpStatus.fromEmail})`
                      : 'SMTP Server Not Configured'}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {smtpStatus?.configured
                      ? 'Emails and attached PDFs will be delivered via your configured SMTP relay.'
                      : 'Configure your SMTP host, port, username, and password/app password to send real emails.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSmtpConfigOpen(!smtpConfigOpen)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#14263D] hover:bg-slate-50 shrink-0"
                >
                  {smtpConfigOpen ? (
                    <>
                      Hide SMTP Setup
                      <ChevronUp className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      {smtpStatus?.configured ? 'Edit SMTP' : 'Configure SMTP'}
                      <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </button>
              </div>

              {smtpSaveNotice && (
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{smtpSaveNotice}</span>
                </div>
              )}

              {smtpConfigOpen && (
                <div className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[#14263D]">
                      SMTP Server Settings
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-slate-500">Presets:</span>
                      <button
                        type="button"
                        onClick={() => applySmtpPreset('gmail')}
                        className="rounded border border-slate-200 bg-[#F3F6FA] px-2 py-0.5 text-[10px] font-semibold text-[#14263D] hover:bg-slate-200"
                      >
                        Gmail (587)
                      </button>
                      <button
                        type="button"
                        onClick={() => applySmtpPreset('office365')}
                        className="rounded border border-slate-200 bg-[#F3F6FA] px-2 py-0.5 text-[10px] font-semibold text-[#14263D] hover:bg-slate-200"
                      >
                        Outlook / 365 (587)
                      </button>
                      <button
                        type="button"
                        onClick={() => applySmtpPreset('zoho')}
                        className="rounded border border-slate-200 bg-[#F3F6FA] px-2 py-0.5 text-[10px] font-semibold text-[#14263D] hover:bg-slate-200"
                      >
                        Zoho (465 SSL)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-5">
                      <label className="block text-[10px] font-medium text-slate-600 mb-1">
                        SMTP Host
                      </label>
                      <input
                        type="text"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        placeholder="smtp.gmail.com"
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-medium text-slate-600 mb-1">
                        Port
                      </label>
                      <input
                        type="number"
                        value={smtpPort}
                        onChange={(e) => {
                          const p = Number(e.target.value) || 587;
                          setSmtpPort(p);
                          setSmtpSecure(p === 465);
                        }}
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] font-medium text-slate-600 mb-1">
                        Security
                      </label>
                      <select
                        value={smtpSecure ? 'ssl' : 'starttls'}
                        onChange={(e) => setSmtpSecure(e.target.value === 'ssl')}
                        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      >
                        <option value="starttls">STARTTLS (Port 587)</option>
                        <option value="ssl">SSL / TLS (Port 465)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-6">
                      <label className="block text-[10px] font-medium text-slate-600 mb-1">
                        SMTP Username / Email
                      </label>
                      <input
                        type="email"
                        name="smtp_username_email"
                        autoComplete="off"
                        data-lpignore="true"
                        value={smtpUser}
                        onChange={(e) => {
                          setSmtpUser(e.target.value);
                          if (!smtpFromEmail || smtpFromEmail === smtpUser) {
                            setSmtpFromEmail(e.target.value);
                          }
                        }}
                        placeholder="digicoyotes@gmail.com"
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                      />
                      {/^\d+$/.test(smtpUser.trim()) && (
                        <p className="mt-1 text-[10px] text-rose-600">
                          Replace &quot;{smtpUser.trim()}&quot; with your full email address (e.g. digicoyotes@gmail.com).
                        </p>
                      )}
                    </div>
                    <div className="sm:col-span-6">
                      <label className="block text-[10px] font-medium text-slate-600 mb-1">
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
                          placeholder={
                            smtpStatus?.hasPassword ? '•••••••• (saved on server)' : '16-char Google App Password'
                          }
                          className="w-full rounded-md border border-slate-300 pl-2.5 pr-8 py-1.5 text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSmtpPass((v) => !v)}
                          title={showSmtpPass ? 'Hide password' : 'Show password'}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                        >
                          {showSmtpPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="sm:col-span-6">
                      <label className="block text-[10px] font-medium text-slate-600 mb-1">
                        Sender Name
                      </label>
                      <input
                        type="text"
                        value={smtpFromName}
                        onChange={(e) => setSmtpFromName(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-6">
                      <label className="block text-[10px] font-medium text-slate-600 mb-1">
                        From Email Address
                      </label>
                      <input
                        type="email"
                        value={smtpFromEmail}
                        onChange={(e) => setSmtpFromEmail(e.target.value)}
                        placeholder="your-email@gmail.com"
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] text-slate-500">
                      For Gmail SMTP, enable 2FA and use a 16-character Google App Password.
                    </span>
                    <button
                      type="button"
                      disabled={smtpSaving}
                      onClick={handleSaveVerifySmtp}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#14263D] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {smtpSaving ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Verifying SMTP...
                        </>
                      ) : (
                        <>
                          <Check className="h-3 w-3" />
                          Verify & Save SMTP
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <div className="font-medium">{errorMsg}</div>
                  {errorHint && (
                    <div className="text-[11px] text-rose-900">
                      <span className="font-semibold">Actionable Fix: </span>
                      {errorHint}
                    </div>
                  )}
                  {errorClues.length > 0 && (
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-rose-900/90">
                      {errorClues.map((clue) => (
                        <li key={clue}>{clue}</li>
                      ))}
                    </ul>
                  )}
                  {isStaticPreviewError && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {getDevelopmentBackendUrl() && (
                        <a
                          href={getDevelopmentBackendUrl()!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#14263D] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open Live Backend URL (SMTP Enabled)
                        </a>
                      )}
                      {toEmail.trim() && (
                        <a
                          href={buildMailtoFallbackHref({
                            to: toEmail,
                            cc: ccEmails,
                            subject,
                            body,
                          })}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#14263D] hover:bg-slate-50"
                        >
                          <Mail className="h-3 w-3 text-[#2463EB]" />
                          Send via Mail App (mailto:)
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  To (Recipient Email)
                </label>
                <input
                  type="text"
                  required
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  placeholder="client@company.com"
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

              {/* Virtual File-System Explorer */}
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

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="text-[11px] text-slate-500">
                From:{' '}
                <span className="font-medium text-slate-700">
                  {smtpStatus?.configured
                    ? `${smtpStatus.fromName} <${smtpStatus.fromEmail}>`
                    : `${senderName} (${senderEmail})`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                {!smtpStatus?.configured && (
                  <button
                    type="button"
                    onClick={handleSaveErpLogOnly}
                    className="rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Log in ERP Only
                  </button>
                )}
                <button
                  type="submit"
                  disabled={verifyingBeforeReview || smtpSaving || smtpLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {verifyingBeforeReview ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Verifying SMTP...
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Review & Send via SMTP
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
