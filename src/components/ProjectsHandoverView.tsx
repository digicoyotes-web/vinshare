import React, { useEffect, useState } from 'react';
import { Briefcase, CheckCircle2, ClipboardCheck, ShieldCheck } from 'lucide-react';
import type {
  ClientRecord,
  DocumentVersionSnapshot,
  ProjectEmailRecord,
  ProjectRecord,
} from '../types/erp';
import { formatInrCompact, formatInrFull } from '../utils/formatters';
import { downloadDocumentPdf } from '../utils/pdfGenerator';
import { DocumentActionBar } from './DocumentActionBar';
import type { EmailComposeContext } from './EmailComposeModal';
import { EmbeddedProjectEmailPanel } from './ProjectEmailSectionView';
import type { SmsVerifyModalContext } from './SmsVerifyModal';
import { VersionsModal } from './VersionsModal';

interface ProjectsHandoverViewProps {
  clients: ClientRecord[];
  projects: ProjectRecord[];
  initialProjectId?: string;
  projectSnapshots: DocumentVersionSnapshot[];
  emails: ProjectEmailRecord[];
  onToggleChecklist: (projectId: string, itemId: string) => void;
  onSaveProjectSnapshot: (project: ProjectRecord, note?: string) => void;
  onTriggerSmsVerify: (ctx: SmsVerifyModalContext) => void;
  onOpenEmailCompose: (ctx: EmailComposeContext) => void;
  onSimulateInboundReply: (email: ProjectEmailRecord, replyBody: string) => void;
  onOpenFullEmailHub: () => void;
  onGenerateInvoiceForProject: (projectId: string) => void;
}

export const ProjectsHandoverView: React.FC<ProjectsHandoverViewProps> = ({
  clients,
  projects,
  initialProjectId,
  projectSnapshots,
  emails,
  onToggleChecklist,
  onSaveProjectSnapshot,
  onTriggerSmsVerify,
  onOpenEmailCompose,
  onSimulateInboundReply,
  onOpenFullEmailHub,
  onGenerateInvoiceForProject,
}) => {
  const [selectedId, setSelectedId] = useState(initialProjectId || projects[0]?.id || '');
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (initialProjectId && projects.some((p) => p.id === initialProjectId)) {
      setSelectedId(initialProjectId);
    }
  }, [initialProjectId, projects]);

  const active = projects.find((p) => p.id === selectedId) || projects[0];

  if (!active) return null;

  const activeClient = clients.find((c) => c.id === active.clientId);
  const activeSnapshots = projectSnapshots.filter((s) => s.entityId === active.id);
  const completedCount = active.checklist.filter((c) => c.completed).length;
  const allCompleted = completedCount === active.checklist.length;
  const isActivated = active.closingStatus === 'Project Activated';
  const projectPdfName = `${active.code}-Handover-Dossier.pdf`;

  const handleSaveProject = () => {
    onSaveProjectSnapshot(
      active,
      `Saved handover state (${completedCount}/${active.checklist.length} checks · ${active.closingStatus})`
    );
    setLastSavedAt(new Date().toISOString());
  };

  const handleDownloadProjectPdf = () => {
    downloadDocumentPdf({
      filename: projectPdfName,
      headerBanner: 'FACILITY MANAGEMENT ERP · PROJECT HANDOVER DOSSIER',
      title: `${active.code} · ${active.clientName}`,
      subtitle: `${active.siteName} · ${active.industry}`,
      metaPairs: [
        ['Project Code', active.code],
        ['Closing Status', active.closingStatus],
        ['Agreement Ref', active.agreementId],
        ['Approved Manpower', `${active.approvedManpower} Personnel`],
        ['Ops Manager', active.opsManager],
        ['Mobilization Date', active.mobilizationDate],
      ],
      tableTitle: 'Mandatory 9-Point Closing & Handover Checklist',
      tableHeaders: ['Checkpoint', 'Owner Dept', 'Verified By', 'Status'],
      tableRows: active.checklist.map((item) => [
        item.label,
        item.ownerDept,
        item.verifiedBy || '-',
        item.completed ? 'Verified' : 'Pending',
      ]),
      summaryRows: [
        ['Checklist Progress', `${completedCount} / ${active.checklist.length} Completed`],
        ['Monthly Billing', formatInrFull(active.monthlyBilling)],
        ['Annual Contract Value', formatInrFull(active.annualValue)],
      ],
      footerNote: `HR: ${active.hrCoordinator} · Finance: ${active.financeCoordinator}`,
    });
  };

  const handleOpenProjectEmail = () => {
    onOpenEmailCompose({
      projectId: active.id,
      projectCode: active.code,
      entityType: 'project',
      entityId: active.id,
      entityReference: active.code,
      clientId: active.clientId,
      clientName: active.clientName,
      toEmail: activeClient?.email || '',
      subject: `Project Handover & Operations Status · ${active.code} (${active.siteName})`,
      body: `Dear ${activeClient?.contactPerson || 'Team'},\n\nPlease find the latest handover & mobilization dossier for ${active.code} (${active.siteName}).\n\nProject Summary:\n- Current Status: ${active.closingStatus}\n- Handover Checks Completed: ${completedCount} / ${active.checklist.length}\n- Approved Manpower: ${active.approvedManpower} staff\n- Operations Lead: ${active.opsManager}\n- Monthly Billing Base: ${formatInrFull(active.monthlyBilling)}\n\nPlease reply to this thread for any site onboarding or compliance coordination.\n\nRegards,\nProject Delivery & Operations\nFacility Management ERP`,
      attachmentName: projectPdfName,
      onDownloadPdf: handleDownloadProjectPdf,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[#14263D]">Stage 05 · Projects, Closing & Operational Handover</h1>
        <p className="text-xs text-slate-600 mt-0.5">
          All 9 mandatory closing checks, coordinator assignments, and client email correspondence before activating billing.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[#14263D]">Projects Portfolio ({projects.length})</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {projects.map((p) => {
              const done = p.checklist.filter((c) => c.completed).length;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left p-4 hover:bg-[#F3F6FA]/70 transition-colors ${
                    active.id === p.id ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-[#2463EB]">{p.code}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        p.closingStatus === 'Project Activated'
                          ? 'bg-[#E8F5EE] text-emerald-800'
                          : 'bg-[#FFF2E5] text-amber-800'
                      }`}
                    >
                      {p.closingStatus}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[#14263D]">{p.clientName}</div>
                  <div className="mt-1 flex justify-between text-xs text-slate-500 tabular-nums">
                    <span>{p.siteName}</span>
                    <span>{done}/{p.checklist.length} checks</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-8 space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-[#2463EB]" />
                  <span className="font-mono text-xs font-semibold text-[#2463EB]">{active.code}</span>
                </div>
                <h2 className="text-lg font-bold text-[#14263D] mt-1">{active.clientName}</h2>
                <p className="text-xs text-slate-600">{active.siteName} · {active.industry} · {active.approvedManpower} Approved Manpower</p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <DocumentActionBar
                  onSave={handleSaveProject}
                  onOpenVersions={() => setShowVersionsModal(true)}
                  onOpenEmail={handleOpenProjectEmail}
                  onDownloadPdf={handleDownloadProjectPdf}
                  versionCount={activeSnapshots.length || 1}
                  lastSavedAt={lastSavedAt}
                />
                {!isActivated ? (
                  <button
                    type="button"
                    disabled={!allCompleted}
                    onClick={() =>
                      onTriggerSmsVerify({
                        title: 'Activate Project & Dispatch Mobilization SMS',
                        subtitle: `Confirm handover for ${active.code} and notify Operations (${active.opsManager})`,
                        phone: '+919810899100',
                        recipientName: `${active.opsManager} (Operations Manager)`,
                        purpose: 'project_activation',
                        entityType: 'project',
                        entityId: active.id,
                        entityLabel: `${active.code} · ${active.clientName}`,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-45"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {allCompleted ? 'Activate Project (SMS Confirm)' : `Complete ${active.checklist.length - completedCount} More Checks`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onGenerateInvoiceForProject(active.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#14263D] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Generate Contract Invoice (Stage 06)
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-slate-200 bg-[#F3F6FA] p-3.5 text-xs">
              <div>
                <div className="text-slate-500">Annual Contract</div>
                <div className="font-mono font-bold text-[#14263D] tabular-nums">{formatInrCompact(active.annualValue)}</div>
              </div>
              <div>
                <div className="text-slate-500">Ops Manager</div>
                <div className="font-semibold text-[#14263D]">{active.opsManager}</div>
              </div>
              <div>
                <div className="text-slate-500">HR Coordinator</div>
                <div className="font-semibold text-[#14263D]">{active.hrCoordinator}</div>
              </div>
              <div>
                <div className="text-slate-500">Finance Coordinator</div>
                <div className="font-semibold text-[#14263D]">{active.financeCoordinator}</div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#14263D]">
                  <ClipboardCheck className="h-4 w-4 text-[#2463EB]" />
                  Mandatory 9-Point Closing & Handover Checklist
                </div>
                <span className="text-xs font-semibold text-[#2463EB] tabular-nums">
                  {completedCount} / {active.checklist.length} Verified
                </span>
              </div>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {active.checklist.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs cursor-pointer hover:bg-[#F3F6FA]/60"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.completed}
                        disabled={isActivated}
                        onChange={() => onToggleChecklist(active.id, item.id)}
                      />
                      <span className={item.completed ? 'text-[#14263D] font-medium' : 'text-slate-600'}>
                        {item.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 shrink-0">
                      <span>{item.ownerDept}</span>
                      {item.completed && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <EmbeddedProjectEmailPanel
            project={active}
            client={activeClient}
            emails={emails}
            onOpenCompose={onOpenEmailCompose}
            onSimulateInboundReply={onSimulateInboundReply}
            onOpenFullEmailHub={onOpenFullEmailHub}
          />
        </div>
      </div>

      <VersionsModal
        isOpen={showVersionsModal}
        onClose={() => setShowVersionsModal(false)}
        title={`Project Handover Checkpoints · ${active.code}`}
        subtitle={`${active.clientName} · ${active.siteName}`}
        mode="snapshot"
        snapshots={activeSnapshots}
        onCreateSnapshot={(note) => {
          onSaveProjectSnapshot(active, note);
          setLastSavedAt(new Date().toISOString());
        }}
      />
    </div>
  );
};
