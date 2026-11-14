import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Mail,
  Paperclip,
  Plus,
  Reply,
  Search,
  Send,
} from 'lucide-react';
import type {
  ClientRecord,
  EmailEntityType,
  ProjectEmailRecord,
  ProjectRecord,
} from '../types/erp';
import type { EmailComposeContext } from './EmailComposeModal';

interface EmbeddedProjectEmailPanelProps {
  project: ProjectRecord;
  client?: ClientRecord;
  emails: ProjectEmailRecord[];
  onOpenCompose: (ctx: EmailComposeContext) => void;
  onSimulateInboundReply: (email: ProjectEmailRecord, replyBody: string) => void;
  onOpenFullEmailHub: () => void;
}

export const EmbeddedProjectEmailPanel: React.FC<EmbeddedProjectEmailPanelProps> = ({
  project,
  client,
  emails,
  onOpenCompose,
  onSimulateInboundReply,
  onOpenFullEmailHub,
}) => {
  const [selectedEmailId, setSelectedEmailId] = useState<string>(emails[0]?.id || '');
  const [replyText, setReplyText] = useState('');

  const projectEmails = useMemo(
    () =>
      emails.filter(
        (e) =>
          e.projectId === project.id ||
          e.clientId === project.clientId
      ),
    [emails, project.id, project.clientId]
  );

  const activeEmail =
    projectEmails.find((e) => e.id === selectedEmailId) || projectEmails[0] || null;

  const openTemplateEmail = (templateType: 'kickoff' | 'checklist' | 'billing') => {
    const recipient = client?.email || 'operations@client.com';
    const subjectMap = {
      kickoff: `Project Mobilization & Kickoff Schedule · ${project.code} (${project.siteName})`,
      checklist: `Handover & 9-Point Readiness Update · ${project.code}`,
      billing: `Monthly SLA & Billing Readiness Notice · ${project.code}`,
    };
    const bodyMap = {
      kickoff: `Dear ${client?.contactPerson || 'Team'},\n\nWe are pleased to share the mobilization and operational kickoff schedule for ${project.siteName} (${project.code}).\n\nApproved Manpower: ${project.approvedManpower} personnel\nOperations Manager: ${project.opsManager}\nMobilization Date: ${project.mobilizationDate}\n\nPlease confirm site gate-pass access for our onboarding supervisor.\n\nRegards,\nFacility Management Operations`,
      checklist: `Dear ${client?.contactPerson || 'Team'},\n\nCurrent closing and handover readiness for ${project.code} stands at ${project.checklist.filter((c) => c.completed).length} of ${project.checklist.length} verified checkpoints.\n\nHR Coordinator: ${project.hrCoordinator}\nFinance Coordinator: ${project.financeCoordinator}\n\nKindly share any pending site compliance sign-offs.\n\nRegards,\nProject Delivery Office`,
      billing: `Dear ${client?.contactPerson || 'Finance & Admin Team'},\n\nThis is a project billing alignment update for ${project.code} (${project.siteName}). Monthly contract billing of INR ${project.monthlyBilling.toLocaleString('en-IN')} will be raised against executed agreement ${project.agreementId}.\n\nPlease confirm PO validity for the upcoming billing cycle.\n\nRegards,\nCommercial & Billing Desk`,
    };

    onOpenCompose({
      projectId: project.id,
      projectCode: project.code,
      entityType: 'project',
      entityId: project.id,
      entityReference: project.code,
      clientId: project.clientId,
      clientName: project.clientName,
      toEmail: recipient,
      subject: subjectMap[templateType],
      body: bodyMap[templateType],
      attachmentName: `${project.code}-Handover-Dossier.pdf`,
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 bg-[#F3F6FA]/60">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#2463EB]" />
          <div>
            <h3 className="text-sm font-semibold text-[#14263D]">
              Project Email Section · {project.code}
            </h3>
            <p className="text-[11px] text-slate-500">
              All proposal, handover, and billing email threads for {project.clientName}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openTemplateEmail('kickoff')}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#14263D] hover:bg-slate-50"
          >
            + Kickoff Email
          </button>
          <button
            type="button"
            onClick={() => openTemplateEmail('checklist')}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#14263D] hover:bg-slate-50"
          >
            + Checklist Update
          </button>
          <button
            type="button"
            onClick={() => openTemplateEmail('billing')}
            className="rounded-lg bg-[#2463EB] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 inline-flex items-center gap-1"
          >
            <Send className="h-3 w-3" />
            Compose Project Email
          </button>
          <button
            type="button"
            onClick={onOpenFullEmailHub}
            className="text-[11px] font-semibold text-[#2463EB] hover:underline px-1"
          >
            Open Full Email Hub
          </button>
        </div>
      </div>

      {projectEmails.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500">
          No emails dispatched for {project.code} yet. Click <span className="font-semibold text-[#14263D]">Compose Project Email</span> or use a template above to send the first communication.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          <div className="md:col-span-5 divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {projectEmails.map((em) => (
              <button
                key={em.id}
                type="button"
                onClick={() => setSelectedEmailId(em.id)}
                className={`w-full text-left px-4 py-3 hover:bg-[#F3F6FA]/70 transition-colors ${
                  activeEmail?.id === em.id ? 'bg-blue-50/50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2463EB]">
                    {em.direction === 'outbound' ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownLeft className="h-3 w-3 text-emerald-600" />
                    )}
                    {em.entityType.toUpperCase()} · {em.entityReference}
                  </span>
                  <span className="text-[10px] font-medium text-slate-500 tabular-nums">
                    {new Date(em.sentAt).toLocaleDateString('en-IN')}
                  </span>
                </div>
                <div className="mt-1 text-xs font-semibold text-[#14263D] truncate">{em.subject}</div>
                <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="truncate">{em.direction === 'outbound' ? `To: ${em.toEmail}` : `From: ${em.fromEmail}`}</span>
                  <span className="font-medium text-emerald-700 shrink-0 ml-2">{em.status}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="md:col-span-7 p-4 space-y-3 bg-white">
            {activeEmail && (
              <>
                <div className="border-b border-slate-100 pb-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-bold text-[#14263D]">{activeEmail.subject}</h4>
                    <span className="rounded bg-[#E8F5EE] px-2 py-0.5 text-[10px] font-semibold text-emerald-800 shrink-0">
                      {activeEmail.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 space-y-0.5">
                    <div>
                      <span className="font-medium text-slate-700">From:</span> {activeEmail.fromEmail}{' '}
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="font-medium text-slate-700">To:</span> {activeEmail.toEmail}
                    </div>
                    {activeEmail.ccEmails && (
                      <div>
                        <span className="font-medium text-slate-700">CC:</span> {activeEmail.ccEmails}
                      </div>
                    )}
                  </div>
                </div>

                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 leading-relaxed max-h-36 overflow-y-auto">
                  {activeEmail.body}
                </pre>

                {((activeEmail.attachmentNames && activeEmail.attachmentNames.length > 0) ||
                  activeEmail.attachmentName) && (
                  <div className="flex flex-wrap gap-1.5">
                    {(activeEmail.attachmentNames && activeEmail.attachmentNames.length > 0
                      ? activeEmail.attachmentNames
                      : activeEmail.attachmentName
                      ? [activeEmail.attachmentName]
                      : []
                    ).map((att) => (
                      <div
                        key={att}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-[#F3F6FA] px-2.5 py-1 text-[11px] font-mono text-[#14263D]"
                      >
                        <Paperclip className="h-3 w-3 text-[#2463EB]" />
                        {att}
                      </div>
                    ))}
                  </div>
                )}

                {activeEmail.direction === 'outbound' && (
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Simulate client email reply (e.g. Approved, please proceed with mobilization)..."
                      className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-[#2463EB] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const msg =
                          replyText.trim() ||
                          `Acknowledged ${activeEmail.entityReference}. Team is aligned to proceed.`;
                        onSimulateInboundReply(activeEmail, msg);
                        setReplyText('');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-[#F3F6FA] px-3 py-1.5 text-xs font-semibold text-[#14263D] hover:bg-slate-200"
                    >
                      <Reply className="h-3.5 w-3.5" />
                      Receive Client Reply
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface ProjectEmailSectionViewProps {
  projects: ProjectRecord[];
  clients: ClientRecord[];
  emails: ProjectEmailRecord[];
  onOpenCompose: (ctx: EmailComposeContext) => void;
  onSimulateInboundReply: (email: ProjectEmailRecord, replyBody: string) => void;
}

export const ProjectEmailSectionView: React.FC<ProjectEmailSectionViewProps> = ({
  projects,
  clients,
  emails,
  onOpenCompose,
  onSimulateInboundReply,
}) => {
  const [projectFilter, setProjectFilter] = useState<string>('ALL');
  const [entityFilter, setEntityFilter] = useState<'ALL' | EmailEntityType>('ALL');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(emails[0]?.id || '');
  const [replyDraft, setReplyDraft] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return emails.filter((em) => {
      if (projectFilter !== 'ALL' && em.projectId !== projectFilter) return false;
      if (entityFilter !== 'ALL' && em.entityType !== entityFilter) return false;
      if (
        q &&
        !em.subject.toLowerCase().includes(q) &&
        !em.clientName.toLowerCase().includes(q) &&
        !em.toEmail.toLowerCase().includes(q) &&
        !em.entityReference.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [emails, projectFilter, entityFilter, query]);

  const activeEmail = filtered.find((e) => e.id === selectedId) || filtered[0] || null;

  const handleComposeNew = () => {
    const targetProject =
      projects.find((p) => p.id === projectFilter) || projects[0];
    const client = clients.find((c) => c.id === targetProject?.clientId);
    onOpenCompose({
      projectId: targetProject?.id || 'PRJ-GENERAL',
      projectCode: targetProject?.code || 'GENERAL',
      entityType: 'project',
      entityId: targetProject?.id || 'PRJ-GENERAL',
      entityReference: targetProject?.code || 'Project Desk',
      clientId: targetProject?.clientId || client?.id || '',
      clientName: targetProject?.clientName || client?.companyName || 'Client',
      toEmail: client?.email || '',
      subject: targetProject
        ? `Project Update · ${targetProject.code} (${targetProject.siteName})`
        : 'Facility Management Operations Update',
      body: targetProject
        ? `Dear ${client?.contactPerson || 'Team'},\n\nPlease find the latest operational & commercial update for ${targetProject.siteName} (${targetProject.code}).\n\nRegards,\nFacility Management Operations`
        : '',
      attachmentName: targetProject ? `${targetProject.code}-Handover-Dossier.pdf` : undefined,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#14263D]">Project Email Section & Client Correspondence</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Centralized outbound & inbound email threads linked across Proposals, Tax Invoices, and Active Projects.
          </p>
        </div>
        <button
          type="button"
          onClick={handleComposeNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Compose Project Email
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-[#14263D] focus:border-[#2463EB] focus:outline-none"
          >
            <option value="ALL">All Projects ({emails.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.clientName}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 rounded-lg bg-[#F3F6FA] p-1 border border-slate-200">
            {(['ALL', 'project', 'proposal', 'invoice'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setEntityFilter(tab)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                  entityFilter === tab
                    ? 'bg-white text-[#14263D] shadow-xs'
                    : 'text-slate-600 hover:text-[#14263D]'
                }`}
              >
                {tab === 'ALL' ? 'All Types' : `${tab}s`}
              </button>
            ))}
          </div>
        </div>

        <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subject, email, client, ref..."
            className="w-full rounded-lg border border-slate-200 bg-[#F3F6FA] pl-8 pr-3 py-2 text-xs focus:border-[#2463EB] focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Master-Detail Email Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#14263D]">Email Threads ({filtered.length})</h2>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {filtered.filter((e) => e.direction === 'inbound').length} replies
            </span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No emails match the current project or type filter.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
              {filtered.map((em) => (
                <button
                  key={em.id}
                  type="button"
                  onClick={() => setSelectedId(em.id)}
                  className={`w-full text-left p-4 hover:bg-[#F3F6FA]/70 transition-colors ${
                    activeEmail?.id === em.id ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[#2463EB]">
                      {em.direction === 'outbound' ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                      )}
                      {em.projectCode} · {em.entityType.toUpperCase()}
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {new Date(em.sentAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-[#14263D] truncate">{em.subject}</div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="truncate">{em.clientName} ({em.toEmail})</span>
                    <span className="font-semibold text-emerald-700 shrink-0 ml-2">{em.status}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
          {activeEmail ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <div className="text-[11px] font-mono font-semibold text-[#2463EB]">
                    {activeEmail.projectCode} · {activeEmail.entityReference}
                  </div>
                  <h2 className="text-base font-bold text-[#14263D] mt-1">{activeEmail.subject}</h2>
                  <div className="mt-1.5 text-xs text-slate-600 space-y-0.5">
                    <div>
                      <span className="font-medium text-slate-800">From:</span> {activeEmail.sentBy} &lt;{activeEmail.fromEmail}&gt;
                    </div>
                    <div>
                      <span className="font-medium text-slate-800">To:</span> {activeEmail.toEmail}
                      {activeEmail.ccEmails ? ` · CC: ${activeEmail.ccEmails}` : ''}
                    </div>
                  </div>
                </div>
                <span className="rounded bg-[#E8F5EE] px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  {activeEmail.status}
                </span>
              </div>

              <div className="rounded-lg border border-slate-200 bg-[#F3F6FA]/50 p-4">
                <pre className="whitespace-pre-wrap font-sans text-xs text-[#14263D] leading-relaxed">
                  {activeEmail.body}
                </pre>
              </div>

              {((activeEmail.attachmentNames && activeEmail.attachmentNames.length > 0) ||
                activeEmail.attachmentName) && (
                <div className="flex flex-wrap gap-2">
                  {(activeEmail.attachmentNames && activeEmail.attachmentNames.length > 0
                    ? activeEmail.attachmentNames
                    : activeEmail.attachmentName
                    ? [activeEmail.attachmentName]
                    : []
                  ).map((att) => (
                    <div
                      key={att}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-[#F3F6FA] px-3.5 py-2 text-xs"
                    >
                      <Paperclip className="h-3.5 w-3.5 text-[#2463EB]" />
                      <span className="font-mono font-semibold text-[#14263D]">{att}</span>
                      <span className="text-slate-500">· Attached PDF</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="text-xs font-semibold text-[#14263D]">
                  Follow-up / Two-Way Reply Simulation
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder="Enter simulated client reply or follow-up confirmation..."
                    className="flex-1 min-w-[240px] rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#2463EB] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const msg =
                        replyDraft.trim() ||
                        `Confirmed receipt of ${activeEmail.entityReference}. Please proceed with next steps.`;
                      onSimulateInboundReply(activeEmail, msg);
                      setReplyDraft('');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#14263D] hover:bg-slate-50"
                  >
                    <Reply className="h-3.5 w-3.5" />
                    Log Client Reply
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenCompose({
                        projectId: activeEmail.projectId,
                        projectCode: activeEmail.projectCode,
                        entityType: activeEmail.entityType,
                        entityId: activeEmail.entityId,
                        entityReference: activeEmail.entityReference,
                        clientId: activeEmail.clientId,
                        clientName: activeEmail.clientName,
                        toEmail: activeEmail.direction === 'outbound' ? activeEmail.toEmail : activeEmail.fromEmail,
                        subject: activeEmail.subject.startsWith('Re:')
                          ? activeEmail.subject
                          : `Re: ${activeEmail.subject}`,
                        body: `\n\n--- On ${new Date(activeEmail.sentAt).toLocaleString('en-IN')}, ${activeEmail.fromEmail} wrote: ---\n${activeEmail.body}`,
                        attachmentName: activeEmail.attachmentName,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Reply via Email
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-10 text-center text-xs text-slate-500">
              Select an email thread on the left or compose a new Project Email.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
