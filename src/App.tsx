import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CreditCard,
  FileCheck2,
  FileSignature,
  FileText,
  Home,
  Mail,
  Menu,
  MessageSquareText,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  Smartphone,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import avatarImg from './assets/images/avatar_executive_admin_1794575582431.jpg';
import { AgreementsView } from './components/AgreementsView';
import { AttritionRevisionsView } from './components/AttritionRevisionsView';
import { ClientsLeadsView } from './components/ClientsLeadsView';
import { DashboardView } from './components/DashboardView';
import { EmailComposeModal, type EmailComposeContext } from './components/EmailComposeModal';
import { InvoicingBillingView } from './components/InvoicingBillingView';
import { LoiView } from './components/LoiView';
import { PaymentsCollectionsView } from './components/PaymentsCollectionsView';
import { ProjectEmailSectionView } from './components/ProjectEmailSectionView';
import { ProjectsHandoverView } from './components/ProjectsHandoverView';
import { ProposalsCostSheetView } from './components/ProposalsCostSheetView';
import { ReportsAnalyticsView } from './components/ReportsAnalyticsView';
import { SettingsView } from './components/SettingsView';
import { SmsGatewayDrawer } from './components/SmsGatewayDrawer';
import { SmsVerificationCenterView } from './components/SmsVerificationCenterView';
import { SmsVerifyModal, type SmsVerifyModalContext } from './components/SmsVerifyModal';
import { UserManagementView } from './components/UserManagementView';
import {
  INITIAL_AGREEMENTS,
  INITIAL_ATTRITION,
  INITIAL_CLIENTS,
  INITIAL_INVOICES,
  INITIAL_LOIS,
  INITIAL_OPPORTUNITIES,
  INITIAL_PAYMENTS,
  INITIAL_PROJECTS,
  INITIAL_PROPOSALS,
  INITIAL_USERS,
} from './data/seedData';
import { fetchSmsVerifications } from './services/smsApi';
import type {
  AgreementRecord,
  AttritionRecord,
  ClientRecord,
  DocumentVersionSnapshot,
  InvoiceRecord,
  LoiRecord,
  LoiStatus,
  NavModuleId,
  OpportunityRecord,
  PaymentRecord,
  ProjectEmailRecord,
  ProjectRecord,
  ProposalRecord,
  ProposalVersion,
  SmsVerificationStats,
  UserAccount,
} from './types/erp';
import { calculateCostSheetFinancials, formatInrFull } from './utils/formatters';
import { buildVirtualDocumentVault } from './utils/virtualFileSystem';

const EMAILS_STORAGE_KEY = 'fm_erp_project_emails_v1';
const SNAPSHOTS_STORAGE_KEY = 'fm_erp_doc_snapshots_v1';

const INITIAL_PROJECT_EMAILS: ProjectEmailRecord[] = [
  {
    id: 'EM-2025-001',
    projectId: INITIAL_PROJECTS[0]?.id || 'PRJ-001',
    projectCode: INITIAL_PROJECTS[0]?.code || 'PRJ-2025-01',
    entityType: 'project',
    entityId: INITIAL_PROJECTS[0]?.id || 'PRJ-001',
    entityReference: INITIAL_PROJECTS[0]?.code || 'PRJ-2025-01',
    clientId: INITIAL_PROJECTS[0]?.clientId || 'CLI-001',
    clientName: INITIAL_PROJECTS[0]?.clientName || 'Urban Square Facilities Pvt Ltd',
    direction: 'outbound',
    fromEmail: 'operations@fmerp.in',
    toEmail: 'v.mehta@urbansquare.in',
    ccEmails: 'rohit.sharma@fmerp.in',
    subject: `Mobilization & Handover Checklist Sign-Off · ${INITIAL_PROJECTS[0]?.code || 'PRJ-2025-01'}`,
    body: 'Dear Vikram Mehta,\n\nAll 9 operational mobilization checkpoints for Urban Square IT Park Phase II are complete and verified. Please find the handover dossier attached.\n\nRegards,\nFacility Management Operations',
    attachmentName: `${INITIAL_PROJECTS[0]?.code || 'PRJ-2025-01'}-Handover-Dossier.pdf`,
    status: 'Delivered',
    sentAt: '2025-01-20T09:30:00.000Z',
    sentBy: 'Rohit Sharma',
  },
  {
    id: 'EM-2025-002',
    projectId: INITIAL_INVOICES[0]?.projectId || 'PRJ-001',
    projectCode: INITIAL_PROJECTS[0]?.code || 'PRJ-2025-01',
    entityType: 'invoice',
    entityId: INITIAL_INVOICES[0]?.id || 'INV-01458',
    entityReference: INITIAL_INVOICES[0]?.invoiceNumber || 'INV-01458',
    clientId: INITIAL_INVOICES[0]?.clientId || 'CLI-001',
    clientName: INITIAL_INVOICES[0]?.clientName || 'Urban Square Facilities Pvt Ltd',
    direction: 'outbound',
    fromEmail: 'finance@fmerp.in',
    toEmail: 'v.mehta@urbansquare.in',
    ccEmails: 'accounts@urbansquare.in',
    subject: `Tax Invoice ${INITIAL_INVOICES[0]?.invoiceNumber || 'INV-01458'} — Urban Square Facilities Pvt Ltd`,
    body: 'Dear Accounts Payable Team,\n\nPlease find attached the GST Tax Invoice for your monthly facility management services.\n\nRegards,\nFinance & Billing Desk',
    attachmentName: `${INITIAL_INVOICES[0]?.invoiceNumber || 'INV-01458'}.pdf`,
    status: 'Opened',
    sentAt: '2025-01-24T11:15:00.000Z',
    sentBy: 'Suresh Iyer',
  },
];

const NAV_ITEMS: Array<{ id: NavModuleId; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'clients', label: 'Clients & Leads', icon: Users },
  { id: 'proposals', label: 'Proposals & Cost Sheets', icon: FileText },
  { id: 'attrition', label: 'Attrition & Revisions', icon: RefreshCw },
  { id: 'loi', label: 'Letters of Intent (LOI)', icon: FileCheck2 },
  { id: 'agreements', label: 'Agreements / Contracts', icon: FileSignature },
  { id: 'projects', label: 'Projects & Handover', icon: Briefcase },
  { id: 'invoicing', label: 'Invoicing & Billing', icon: Receipt },
  { id: 'payments', label: 'Payments & Collections', icon: CreditCard },
  { id: 'emails', label: 'Project Emails', icon: Mail },
  { id: 'sms', label: 'SMS Verification', icon: MessageSquareText },
  { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
  { id: 'users', label: 'User Management', icon: UserCog },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [activeNav, setActiveNav] = useState<NavModuleId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Core ERP State
  const [clients, setClients] = useState<ClientRecord[]>(INITIAL_CLIENTS);
  const [opportunities, setOpportunities] = useState<OpportunityRecord[]>(INITIAL_OPPORTUNITIES);
  const [proposals, setProposals] = useState<ProposalRecord[]>(INITIAL_PROPOSALS);
  const [attritionRecords, setAttritionRecords] = useState<AttritionRecord[]>(INITIAL_ATTRITION);
  const [lois, setLois] = useState<LoiRecord[]>(INITIAL_LOIS);
  const [agreements, setAgreements] = useState<AgreementRecord[]>(INITIAL_AGREEMENTS);
  const [projects, setProjects] = useState<ProjectRecord[]>(INITIAL_PROJECTS);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(INITIAL_INVOICES);
  const [payments, setPayments] = useState<PaymentRecord[]>(INITIAL_PAYMENTS);
  const [users, setUsers] = useState<UserAccount[]>(INITIAL_USERS);
  const [activeUserId, setActiveUserId] = useState<string>(INITIAL_USERS[0].id);

  // SMS System State
  const [smsStats, setSmsStats] = useState<SmsVerificationStats>({
    totalDispatched: 3,
    totalReceived: 3,
    inboundReplies: 0,
    totalVerified: 2,
    pendingVerification: 1,
    failedOrExpired: 0,
  });
  const [smsVerifyContext, setSmsVerifyContext] = useState<SmsVerifyModalContext | null>(null);
  const [smsDrawerOpen, setSmsDrawerOpen] = useState(false);
  const [smsDrawerPhoneFilter, setSmsDrawerPhoneFilter] = useState<string>('');

  // Project Email & Document Version Snapshot State (persisted for Vercel + AI Studio)
  const [projectEmails, setProjectEmails] = useState<ProjectEmailRecord[]>(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(EMAILS_STORAGE_KEY) : null;
      if (saved) return JSON.parse(saved) as ProjectEmailRecord[];
    } catch {
      // Ignore storage parse error
    }
    return INITIAL_PROJECT_EMAILS;
  });
  const [docSnapshots, setDocSnapshots] = useState<DocumentVersionSnapshot[]>(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(SNAPSHOTS_STORAGE_KEY) : null;
      if (saved) return JSON.parse(saved) as DocumentVersionSnapshot[];
    } catch {
      // Ignore storage parse error
    }
    return [];
  });
  const [emailComposeContext, setEmailComposeContext] = useState<EmailComposeContext | null>(null);

  // Topbar search & notifications
  const [globalQuery, setGlobalQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(EMAILS_STORAGE_KEY, JSON.stringify(projectEmails));
    } catch {
      // Ignore quota errors
    }
  }, [projectEmails]);

  useEffect(() => {
    try {
      localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(docSnapshots));
    } catch {
      // Ignore quota errors
    }
  }, [docSnapshots]);

  const activeUser = useMemo(
    () => users.find((u) => u.id === activeUserId) || users[0],
    [users, activeUserId]
  );

  const vaultFiles = useMemo(
    () =>
      buildVirtualDocumentVault({
        clients,
        proposals,
        invoices,
        projects,
        docSnapshots,
      }),
    [clients, proposals, invoices, projects, docSnapshots]
  );

  const refreshSmsLedger = useCallback(async () => {
    try {
      const ledger = await fetchSmsVerifications();
      setSmsStats(ledger.stats);
      // Sync verified entities on initial load or refresh
      for (const entry of ledger.verifiedEntities) {
        if (entry.entityId.startsWith('CLI-')) {
          setClients((prev) =>
            prev.map((c) =>
              c.id === entry.entityId ? { ...c, mobileVerified: true, mobileVerifiedAt: entry.verifiedAt } : c
            )
          );
        }
      }
    } catch {
      // Ignore transient network failures during boot
    }
  }, []);

  useEffect(() => {
    refreshSmsLedger();
  }, [refreshSmsLedger]);

  // Propagate SMS verification success to the corresponding ERP entity
  const handleEntityVerified = useCallback((entityId: string, _phone: string) => {
    const nowIso = new Date().toISOString();

    if (entityId.startsWith('CLI-')) {
      setClients((prev) =>
        prev.map((c) =>
          c.id === entityId ? { ...c, mobileVerified: true, mobileVerifiedAt: nowIso } : c
        )
      );
    } else if (entityId.startsWith('PROP-')) {
      const [propId, version] = entityId.split(':');
      setProposals((prev) =>
        prev.map((p) => {
          if (p.id !== propId) return p;
          return {
            ...p,
            versions: p.versions.map((v) =>
              v.version === (version || p.currentVersion)
                ? {
                    ...v,
                    status: 'Approved',
                    smsVerifiedApproval: true,
                    approvedBy: activeUser.name,
                    approvedAt: nowIso,
                  }
                : v
            ),
          };
        })
      );
    } else if (entityId.startsWith('LOI-')) {
      setLois((prev) =>
        prev.map((l) =>
          l.id === entityId
            ? { ...l, status: 'Accepted', clientSmsAccepted: true, clientSmsAcceptedAt: nowIso }
            : l
        )
      );
    } else if (entityId.startsWith('AGR-')) {
      setAgreements((prev) =>
        prev.map((a) =>
          a.id === entityId
            ? {
                ...a,
                status: 'Executed',
                companySigned: true,
                clientSigned: true,
                smsExecutionVerified: true,
                smsExecutionVerifiedAt: nowIso,
              }
            : a
        )
      );
    } else if (entityId.startsWith('PRJ-')) {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === entityId
            ? { ...p, closingStatus: 'Project Activated', activationSmsSent: true }
            : p
        )
      );
    } else if (entityId.startsWith('INV-')) {
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === entityId
            ? {
                ...inv,
                status: inv.paidAmount >= inv.totalAmount ? 'Paid' : 'Issued',
                financeSmsVerified: true,
              }
            : inv
        )
      );
    } else if (entityId.startsWith('PAY-')) {
      setPayments((prev) =>
        prev.map((pay) =>
          pay.id === entityId
            ? { ...pay, smsConfirmationSent: true, smsConfirmedVerified: true }
            : pay
        )
      );
    } else if (entityId.startsWith('USR-')) {
      setUsers((prev) =>
        prev.map((u) => (u.id === entityId ? { ...u, mfaSmsVerified: true } : u))
      );
    }

    refreshSmsLedger();
  }, [activeUser.name, refreshSmsLedger]);

  // Global search matches
  const searchResults = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) return [];
    const results: Array<{ label: string; meta: string; nav: NavModuleId }> = [];
    clients.forEach((c) => {
      if (c.companyName.toLowerCase().includes(q) || c.mobile.includes(q)) {
        results.push({ label: c.companyName, meta: `Client · ${c.industry}`, nav: 'clients' });
      }
    });
    proposals.forEach((p) => {
      if (p.reference.toLowerCase().includes(q) || p.siteName.toLowerCase().includes(q)) {
        results.push({ label: p.reference, meta: `Proposal · ${p.siteName}`, nav: 'proposals' });
      }
    });
    invoices.forEach((i) => {
      if (i.invoiceNumber.toLowerCase().includes(q) || i.clientName.toLowerCase().includes(q)) {
        results.push({ label: i.invoiceNumber, meta: `Invoice · ${i.clientName}`, nav: 'invoicing' });
      }
    });
    return results.slice(0, 6);
  }, [globalQuery, clients, proposals, invoices]);

  // ERP workflow handlers
  const handleAddClient = (client: ClientRecord, opportunity?: OpportunityRecord) => {
    setClients((prev) => [client, ...prev]);
    if (opportunity) {
      setOpportunities((prev) => [opportunity, ...prev]);
    }
  };

  const handleSaveProposalVersion = (proposalId: string, updated: ProposalVersion) => {
    setProposals((prev) =>
      prev.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              versions: p.versions.map((v) => (v.version === updated.version ? updated : v)),
            }
          : p
      )
    );
  };

  const handleSelectProposalVersion = (proposalId: string, version: string) => {
    setProposals((prev) =>
      prev.map((p) => (p.id === proposalId ? { ...p, currentVersion: version } : p))
    );
  };

  const handleCreateProposalSnapshot = (proposalId: string, note: string) => {
    setProposals((prev) =>
      prev.map((p) => {
        if (p.id !== proposalId) return p;
        const current =
          p.versions.find((v) => v.version === p.currentVersion) ||
          p.versions[p.versions.length - 1];
        const nextVersionLabel = `V${p.versions.length + 1}`;
        const cloned: ProposalVersion = {
          ...current,
          version: nextVersionLabel,
          createdAt: new Date().toISOString(),
          createdBy: activeUser.name,
          reason: note,
          status: 'Draft',
          smsVerifiedApproval: false,
        };
        return {
          ...p,
          currentVersion: nextVersionLabel,
          versions: [...p.versions, cloned],
        };
      })
    );
  };

  const handleCreateProposal = (proposal: ProposalRecord) => {
    setProposals((prev) => [proposal, ...prev]);
  };

  const handleUpdateInvoice = (updatedInvoice: InvoiceRecord) => {
    setInvoices((prev) => prev.map((inv) => (inv.id === updatedInvoice.id ? updatedInvoice : inv)));
  };

  const handleSaveInvoiceSnapshot = (invoice: InvoiceRecord, note?: string) => {
    const existingCount = docSnapshots.filter(
      (s) => s.entityType === 'invoice' && s.entityId === invoice.id
    ).length;
    const snap: DocumentVersionSnapshot = {
      id: `SNAP-INV-${Date.now().toString(36).toUpperCase()}`,
      entityType: 'invoice',
      entityId: invoice.id,
      version: `Rev ${existingCount + 1}.0`,
      savedAt: new Date().toISOString(),
      savedBy: activeUser.name,
      note: note || `PO ${invoice.poNumber} · Due ${invoice.dueDate}`,
      summaryValue: formatInrFull(invoice.totalAmount),
      statusLabel: invoice.status,
    };
    setDocSnapshots((prev) => [snap, ...prev]);
  };

  const handleSaveProjectSnapshot = (project: ProjectRecord, note?: string) => {
    const existingCount = docSnapshots.filter(
      (s) => s.entityType === 'project' && s.entityId === project.id
    ).length;
    const done = project.checklist.filter((c) => c.completed).length;
    const snap: DocumentVersionSnapshot = {
      id: `SNAP-PRJ-${Date.now().toString(36).toUpperCase()}`,
      entityType: 'project',
      entityId: project.id,
      version: `Checkpoint v${existingCount + 1}.0`,
      savedAt: new Date().toISOString(),
      savedBy: activeUser.name,
      note: note || `${done}/${project.checklist.length} handover checks completed`,
      summaryValue: formatInrFull(project.annualValue),
      statusLabel: project.closingStatus,
    };
    setDocSnapshots((prev) => [snap, ...prev]);
  };

  const handleSendProjectEmail = (
    ctx: EmailComposeContext & { attachPdf: boolean; attachmentNames: string[] }
  ) => {
    const newRecord: ProjectEmailRecord = {
      id: `EM-${Date.now().toString(36).toUpperCase()}`,
      projectId: ctx.projectId,
      projectCode: ctx.projectCode,
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      entityReference: ctx.entityReference,
      clientId: ctx.clientId,
      clientName: ctx.clientName,
      direction: 'outbound',
      fromEmail: activeUser.email,
      toEmail: ctx.toEmail,
      ccEmails: ctx.ccEmails || '',
      subject: ctx.subject,
      body: ctx.body,
      attachmentName: ctx.attachPdf ? ctx.attachmentNames[0] || ctx.attachmentName : undefined,
      attachmentNames: ctx.attachPdf ? ctx.attachmentNames : [],
      status: 'Delivered',
      sentAt: new Date().toISOString(),
      sentBy: activeUser.name,
    };
    setProjectEmails((prev) => [newRecord, ...prev]);

    if (ctx.entityType === 'proposal') {
      setProposals((prev) =>
        prev.map((p) =>
          p.id === ctx.entityId
            ? {
                ...p,
                versions: p.versions.map((v) =>
                  v.version === p.currentVersion && v.status === 'Draft'
                    ? { ...v, status: 'Shared with Client' }
                    : v
                ),
              }
            : p
        )
      );
    }
  };

  const handleSimulateInboundEmail = (email: ProjectEmailRecord, replyBody: string) => {
    const replyRecord: ProjectEmailRecord = {
      id: `EM-IN-${Date.now().toString(36).toUpperCase()}`,
      projectId: email.projectId,
      projectCode: email.projectCode,
      entityType: email.entityType,
      entityId: email.entityId,
      entityReference: email.entityReference,
      clientId: email.clientId,
      clientName: email.clientName,
      direction: 'inbound',
      fromEmail: email.direction === 'outbound' ? email.toEmail : email.fromEmail,
      toEmail: activeUser.email,
      ccEmails: '',
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: replyBody,
      status: 'Replied',
      sentAt: new Date().toISOString(),
      sentBy: email.clientName,
    };
    setProjectEmails((prev) => [
      replyRecord,
      ...prev.map((item) => (item.id === email.id ? { ...item, status: 'Replied' as const } : item)),
    ]);
  };

  const handleCreateRevision = (
    proposalId: string,
    reason: string,
    feedback: string,
    serviceChargePct: number
  ) => {
    setProposals((prev) =>
      prev.map((p) => {
        if (p.id !== proposalId) return p;
        const latest = p.versions[p.versions.length - 1];
        const nextVersionLabel = `V${p.versions.length + 1}`;
        const fin = calculateCostSheetFinancials(
          latest.lineItems,
          latest.pricingMode,
          serviceChargePct,
          latest.discountPct,
          p.contractDurationMonths
        );
        const nextVersion: ProposalVersion = {
          ...latest,
          version: nextVersionLabel,
          createdAt: new Date().toISOString(),
          createdBy: activeUser.name,
          reason,
          clientFeedback: feedback,
          serviceChargePct,
          ...fin,
          status: 'Pending Approval',
          smsVerifiedApproval: false,
        };
        const updatedVersions = p.versions.map((v) =>
          v.version === p.currentVersion && v.status !== 'Approved'
            ? { ...v, status: 'Superseded' as const }
            : v
        );
        return {
          ...p,
          currentVersion: nextVersionLabel,
          versions: [...updatedVersions, nextVersion],
        };
      })
    );
  };

  const handleGenerateLoiFromProposal = (proposalId: string) => {
    const proposal = proposals.find((p) => p.id === proposalId);
    if (!proposal) return;
    const existing = lois.find((l) => l.proposalId === proposalId);
    if (existing) {
      setActiveNav('loi');
      return;
    }
    const client = clients.find((c) => c.id === proposal.clientId);
    const ver =
      proposal.versions.find((v) => v.version === proposal.currentVersion) ||
      proposal.versions[proposal.versions.length - 1];
    const nextLoi: LoiRecord = {
      id: `LOI-2025-${String(lois.length + 5).padStart(3, '0')}`,
      reference: `FM/LOI/2025/${String(lois.length + 5).padStart(3, '0')}`,
      proposalId: proposal.id,
      approvedProposalVersion: ver.version,
      clientId: proposal.clientId,
      clientName: client?.companyName || 'Client',
      siteName: proposal.siteName,
      issueDate: new Date().toISOString().slice(0, 10),
      loiValueAnnual: ver.annualContractValue,
      durationMonths: proposal.contractDurationMonths,
      startDate: '2025-02-15',
      paymentTerms: '30 Days Net',
      securityDeposit: Math.round(ver.monthlySellingPrice),
      mobilizationDays: 14,
      authorizedSignatory: activeUser.name,
      status: 'Awaiting Client Acceptance',
      clientContactMobile: client?.mobile || '+919845077120',
      clientSmsAccepted: false,
    };
    setLois((prev) => [nextLoi, ...prev]);
    setActiveNav('loi');
  };

  const handleDraftAgreementFromLoi = (loiId: string) => {
    const loi = lois.find((l) => l.id === loiId);
    if (!loi) return;
    const existing = agreements.find((a) => a.loiId === loiId);
    if (existing) {
      setActiveNav('agreements');
      return;
    }
    const newAgr: AgreementRecord = {
      id: `AGR-2025-${String(agreements.length + 3).padStart(3, '0')}`,
      reference: `FM/AGR/2025/${String(agreements.length + 3).padStart(3, '0')}`,
      loiId: loi.id,
      clientId: loi.clientId,
      clientName: loi.clientName,
      templateName: 'Commercial Facility Management Agreement',
      version: 'V1.0 (Draft)',
      annualValue: loi.loiValueAnnual,
      startDate: loi.startDate,
      endDate: '2026-02-14',
      status: 'Sent for Signature',
      companySigned: true,
      clientSigned: false,
      smsExecutionVerified: false,
      clauses: [
        { id: 'C1', section: 'Parties / Definitions', content: `Master Facility Management Agreement with ${loi.clientName} for ${loi.siteName}.` },
        { id: 'C2', section: 'Commercials & Payment Terms', content: `Annual Value ₹ ${loi.loiValueAnnual.toLocaleString('en-IN')}; ${loi.paymentTerms}.` },
        { id: 'C3', section: 'Compliance & SLA', content: 'Minimum wages, EPF, ESIC, and 98.5% shift uptime SLA enforced.' },
      ],
    };
    setAgreements((prev) => [newAgr, ...prev]);
    setActiveNav('agreements');
  };

  const handleToggleChecklist = (projectId: string, itemId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              checklist: p.checklist.map((item) =>
                item.id === itemId
                  ? { ...item, completed: !item.completed, verifiedBy: activeUser.name }
                  : item
              ),
            }
          : p
      )
    );
  };

  const handleRecordPayment = (payment: PaymentRecord) => {
    setPayments((prev) => [payment, ...prev]);
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== payment.invoiceId) return inv;
        const paid = inv.paidAmount + payment.amountReceived;
        const tds = inv.tdsAmount + payment.tdsDeducted;
        const cred = inv.creditNoteAmount + payment.creditAdjustment;
        const settled = paid + tds + cred;
        return {
          ...inv,
          paidAmount: paid,
          tdsAmount: tds,
          creditNoteAmount: cred,
          status: settled >= inv.totalAmount ? 'Paid' : 'Partially Paid',
        };
      })
    );
  };

  const openSmsInbox = (phone?: string) => {
    setSmsDrawerPhoneFilter(phone || '');
    setSmsDrawerOpen(true);
  };

  return (
    <div className="min-h-screen flex bg-[#F3F6FA] text-[#14263D]">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Primary Navy Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-[#14263D] text-white transition-all duration-200 lg:static ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${sidebarOpen ? 'w-64' : 'w-[72px]'}`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between gap-2.5 px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2463EB] text-white shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <div className="text-sm font-bold leading-tight truncate">Facility Management ERP</div>
                <div className="text-[11px] text-slate-300 truncate">Operations • Commercial • Finance</div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden text-slate-300 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveNav(item.id);
                  setMobileMenuOpen(false);
                }}
                title={item.label}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#2463EB] text-white'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="h-4 w-4 shrink-0" />
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                </span>
                {sidebarOpen && item.id === 'sms' && smsStats.pendingVerification > 0 && (
                  <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 tabular-nums">
                    {smsStats.pendingVerification}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Architectural Skyline Footer Accent */}
        {sidebarOpen && (
          <div className="pointer-events-none px-3 pt-2 opacity-20">
            <svg viewBox="0 0 240 52" className="w-full h-12 fill-sky-300">
              <rect x="8" y="24" width="16" height="28" />
              <rect x="28" y="12" width="22" height="40" />
              <rect x="54" y="20" width="14" height="32" />
              <rect x="74" y="6" width="24" height="46" />
              <rect x="104" y="18" width="18" height="34" />
              <rect x="128" y="10" width="26" height="42" />
              <rect x="160" y="22" width="16" height="30" />
              <rect x="182" y="14" width="22" height="38" />
              <rect x="210" y="26" width="20" height="26" />
            </svg>
          </div>
        )}
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 py-3 no-print">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setMobileMenuOpen(!mobileMenuOpen);
                } else {
                  setSidebarOpen(!sidebarOpen);
                }
              }}
              aria-label="Toggle navigation"
              className="rounded-lg p-2 text-slate-600 hover:bg-[#F3F6FA]"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="relative flex-1">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder="Search clients, proposals, projects, invoices..."
                className="w-full rounded-lg border border-slate-200 bg-[#F3F6FA] pl-9 pr-3 py-2 text-xs text-[#14263D] placeholder:text-slate-400 focus:border-[#2463EB] focus:bg-white focus:outline-none"
              />
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 rounded-lg border border-slate-200 bg-white shadow-lg z-40 divide-y divide-slate-100">
                  {searchResults.map((res, idx) => (
                    <button
                      key={`${res.label}-${idx}`}
                      type="button"
                      onClick={() => {
                        setActiveNav(res.nav);
                        setGlobalQuery('');
                      }}
                      className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-[#F3F6FA] flex items-center justify-between"
                    >
                      <span className="font-semibold text-[#14263D]">{res.label}</span>
                      <span className="text-[11px] text-slate-500">{res.meta}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => openSmsInbox()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-[#F3F6FA] px-3 py-1.5 text-xs font-medium text-[#14263D] hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Smartphone className="h-4 w-4 text-[#2463EB]" />
              <span className="hidden sm:inline">SMS Inbox</span>
              {smsStats.pendingVerification > 0 && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 tabular-nums">
                  {smsStats.pendingVerification}
                </span>
              )}
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                aria-label="Notifications"
                className="relative rounded-lg p-2 text-slate-600 hover:bg-[#F3F6FA]"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-600" />
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl z-40 overflow-hidden">
                  <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold text-[#14263D]">
                    ERP & SMS Alerts
                  </div>
                  <div className="divide-y divide-slate-100 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationsOpen(false);
                        setActiveNav('sms');
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-[#F3F6FA]"
                    >
                      <div className="font-semibold text-[#14263D]">LOI-2025-004 SMS Pending Verification</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Apex Business Park received acceptance code via SMS.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNotificationsOpen(false);
                        setActiveNav('invoicing');
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-[#F3F6FA]"
                    >
                      <div className="font-semibold text-[#14263D]">Invoice INV-01460 Awaiting Finance OTP</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Sunrise Hospitals Group · ₹ 13.75 L pending issue.
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Active User Profile */}
            <button
              type="button"
              onClick={() => setActiveNav('users')}
              className="flex items-center gap-2.5 rounded-lg pl-2 pr-1 py-1 hover:bg-[#F3F6FA] transition-colors text-left"
            >
              {!avatarFailed ? (
                <img
                  src={avatarImg}
                  alt={activeUser.name}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="h-8 w-8 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#14263D] text-xs font-bold text-white shrink-0">
                  {activeUser.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
              )}
              <div className="hidden md:block leading-tight">
                <div className="text-xs font-semibold text-[#14263D] whitespace-nowrap">{activeUser.name}</div>
                <div className="text-[11px] text-slate-500 whitespace-nowrap">{activeUser.role}</div>
              </div>
            </button>
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeNav === 'dashboard' && (
            <DashboardView
              userName={activeUser.name}
              clients={clients}
              proposals={proposals}
              lois={lois}
              agreements={agreements}
              projects={projects}
              invoices={invoices}
              smsStats={smsStats}
              onNavigate={setActiveNav}
              onOpenSmsInbox={() => openSmsInbox()}
            />
          )}

          {activeNav === 'clients' && (
            <ClientsLeadsView
              clients={clients}
              opportunities={opportunities}
              onAddClient={handleAddClient}
              onTriggerSmsVerify={setSmsVerifyContext}
              onCreateProposalForClient={() => setActiveNav('proposals')}
            />
          )}

          {activeNav === 'proposals' && (
            <ProposalsCostSheetView
              clients={clients}
              proposals={proposals}
              onSaveProposalVersion={handleSaveProposalVersion}
              onSelectProposalVersion={handleSelectProposalVersion}
              onCreateProposalSnapshot={handleCreateProposalSnapshot}
              onCreateProposal={handleCreateProposal}
              onTriggerSmsVerify={setSmsVerifyContext}
              onOpenEmailCompose={setEmailComposeContext}
              onGenerateLoiFromProposal={handleGenerateLoiFromProposal}
            />
          )}

          {activeNav === 'attrition' && (
            <AttritionRevisionsView
              clients={clients}
              proposals={proposals}
              attritionRecords={attritionRecords}
              onAddAttrition={(r) => setAttritionRecords((prev) => [r, ...prev])}
              onCreateRevision={handleCreateRevision}
            />
          )}

          {activeNav === 'loi' && (
            <LoiView
              lois={lois}
              onUpdateLoiStatus={(id, status: LoiStatus) =>
                setLois((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)))
              }
              onTriggerSmsVerify={setSmsVerifyContext}
              onDraftAgreementFromLoi={handleDraftAgreementFromLoi}
            />
          )}

          {activeNav === 'agreements' && (
            <AgreementsView
              agreements={agreements}
              onUpdateClause={(agrId, clauseId, content) =>
                setAgreements((prev) =>
                  prev.map((a) =>
                    a.id === agrId
                      ? {
                          ...a,
                          clauses: a.clauses.map((c) => (c.id === clauseId ? { ...c, content } : c)),
                        }
                      : a
                  )
                )
              }
              onTriggerSmsVerify={setSmsVerifyContext}
              onProceedToClosing={() => setActiveNav('projects')}
            />
          )}

          {activeNav === 'projects' && (
            <ProjectsHandoverView
              clients={clients}
              projects={projects}
              projectSnapshots={docSnapshots.filter((s) => s.entityType === 'project')}
              emails={projectEmails}
              onToggleChecklist={handleToggleChecklist}
              onSaveProjectSnapshot={handleSaveProjectSnapshot}
              onTriggerSmsVerify={setSmsVerifyContext}
              onOpenEmailCompose={setEmailComposeContext}
              onSimulateInboundReply={handleSimulateInboundEmail}
              onOpenFullEmailHub={() => setActiveNav('emails')}
              onGenerateInvoiceForProject={() => setActiveNav('invoicing')}
            />
          )}

          {activeNav === 'invoicing' && (
            <InvoicingBillingView
              clients={clients}
              projects={projects}
              invoices={invoices}
              invoiceSnapshots={docSnapshots.filter((s) => s.entityType === 'invoice')}
              onCreateInvoice={(inv) => setInvoices((prev) => [inv, ...prev])}
              onUpdateInvoice={handleUpdateInvoice}
              onSaveInvoiceSnapshot={handleSaveInvoiceSnapshot}
              onTriggerSmsVerify={setSmsVerifyContext}
              onOpenEmailCompose={setEmailComposeContext}
            />
          )}

          {activeNav === 'payments' && (
            <PaymentsCollectionsView
              invoices={invoices}
              payments={payments}
              onRecordPayment={handleRecordPayment}
              onTriggerSmsVerify={setSmsVerifyContext}
            />
          )}

          {activeNav === 'emails' && (
            <ProjectEmailSectionView
              projects={projects}
              clients={clients}
              emails={projectEmails}
              onOpenCompose={setEmailComposeContext}
              onSimulateInboundReply={handleSimulateInboundEmail}
            />
          )}

          {activeNav === 'sms' && (
            <SmsVerificationCenterView
              clients={clients}
              lois={lois}
              stats={smsStats}
              onRefreshLedger={refreshSmsLedger}
              onEntityVerified={handleEntityVerified}
              onOpenDrawer={(phone) => openSmsInbox(phone)}
            />
          )}

          {activeNav === 'reports' && (
            <ReportsAnalyticsView
              clients={clients}
              proposals={proposals}
              lois={lois}
              agreements={agreements}
              projects={projects}
              invoices={invoices}
            />
          )}

          {activeNav === 'users' && (
            <UserManagementView
              users={users}
              activeUser={activeUser}
              onSwitchActiveUser={setActiveUserId}
              onTriggerSmsVerify={setSmsVerifyContext}
            />
          )}

          {activeNav === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Reusable SMS Verification Modal */}
      <SmsVerifyModal
        context={smsVerifyContext}
        onClose={() => setSmsVerifyContext(null)}
        onOpenInbox={(phone) => openSmsInbox(phone)}
        onVerified={(res) => {
          handleEntityVerified(res.entityId, res.phone);
        }}
      />

      {/* Global Live SMS Handset & Receiver Drawer */}
      <SmsGatewayDrawer
        isOpen={smsDrawerOpen}
        onClose={() => setSmsDrawerOpen(false)}
        filterPhone={smsDrawerPhoneFilter}
        onVerificationComplete={({ entityId, phone }) => {
          if (entityId) {
            handleEntityVerified(entityId, phone);
          } else {
            refreshSmsLedger();
          }
        }}
      />

      {/* Unified Email Composer Modal (Proposal, Invoice & Project + ERP File System) */}
      <EmailComposeModal
        context={emailComposeContext}
        vaultFiles={vaultFiles}
        senderEmail={activeUser.email}
        senderName={activeUser.name}
        onClose={() => setEmailComposeContext(null)}
        onSend={handleSendProjectEmail}
        onOpenProjectEmailSection={() => setActiveNav('emails')}
      />
    </div>
  );
}
