export type NavModuleId =
  | 'dashboard'
  | 'clients'
  | 'proposals'
  | 'attrition'
  | 'loi'
  | 'agreements'
  | 'projects'
  | 'invoicing'
  | 'payments'
  | 'emails'
  | 'sms'
  | 'reports'
  | 'users'
  | 'settings';

export type IndustryCategory =
  | 'Commercial'
  | 'Residential'
  | 'Industrial'
  | 'Government'
  | 'Hospital'
  | 'Resort & Hotels';

export type ErpRole =
  | 'Super Admin'
  | 'Director / Management'
  | 'Sales / Business Development'
  | 'Estimation / Costing'
  | 'HR / Recruitment'
  | 'Operations'
  | 'Legal'
  | 'Finance / Accounts'
  | 'Department Manager';

export interface ClientRecord {
  id: string;
  companyName: string;
  industry: IndustryCategory;
  contactPerson: string;
  designation: string;
  email: string;
  mobile: string;
  mobileVerified: boolean;
  mobileVerifiedAt?: string;
  billingAddress: string;
  siteAddress: string;
  gstin: string;
  pan: string;
  status: 'Active' | 'Prospect' | 'Inactive';
  createdAt: string;
}

export interface OpportunityRecord {
  id: string;
  clientId: string;
  title: string;
  siteName: string;
  builtUpAreaSqFt: number;
  floors: number;
  stage: 'Proposal' | 'LOI' | 'Agreement' | 'Handover' | 'Operations' | 'Closed Lost';
  estimatedAnnualValue: number;
  owner: string;
  enquiryRef: string;
  expectedStartDate: string;
}

export type ServiceName =
  | 'Housekeeping'
  | 'Security'
  | 'Technical Maintenance'
  | 'Landscaping'
  | 'Pest Control'
  | 'Front Office / Helpdesk'
  | 'Pantry Services'
  | 'Waste Management'
  | 'STP / WTP / HVAC';

export interface CostSheetLineItem {
  id: string;
  category: 'Manpower' | 'Materials & Consumables' | 'Equipment' | 'Overheads';
  service: string;
  designationOrItem: string;
  shiftOrUnit: string;
  quantity: number;
  unitRate: number;
  statutoryPct: number;
}

export interface ProposalVersion {
  version: string;
  createdAt: string;
  createdBy: string;
  reason: string;
  clientFeedback: string;
  pricingMode: 'margin' | 'markup';
  serviceChargePct: number;
  discountPct: number;
  gstPct: number;
  lineItems: CostSheetLineItem[];
  directCost: number;
  overheadCost: number;
  totalOperatingCost: number;
  monthlySellingPrice: number;
  annualContractValue: number;
  grossProfit: number;
  grossMarginPct: number;
  status: 'Draft' | 'Pending Approval' | 'Approved' | 'Shared with Client' | 'Superseded' | 'Rejected';
  smsVerifiedApproval?: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

export interface ProposalRecord {
  id: string;
  reference: string;
  opportunityId: string;
  clientId: string;
  industry: IndustryCategory;
  siteName: string;
  selectedServices: string[];
  contractDurationMonths: number;
  validityDate: string;
  currentVersion: string;
  versions: ProposalVersion[];
}

export interface AttritionRecord {
  id: string;
  proposalId: string;
  clientName: string;
  designation: string;
  approvedHeadcount: number;
  currentHeadcount: number;
  separationsInPeriod: number;
  openingHeadcount: number;
  vacancyDurationDays: number;
  replacementCostPerHire: number;
  trainingCost: number;
  overtimeCoverCost: number;
  chargeableToClient: boolean;
  recordedAt: string;
}

export type LoiStatus =
  | 'Draft'
  | 'Internal Review'
  | 'Management Approval'
  | 'Approved'
  | 'Shared with Client'
  | 'Awaiting Client Acceptance'
  | 'Accepted'
  | 'Rejected';

export interface LoiRecord {
  id: string;
  reference: string;
  proposalId: string;
  approvedProposalVersion: string;
  clientId: string;
  clientName: string;
  siteName: string;
  issueDate: string;
  loiValueAnnual: number;
  durationMonths: number;
  startDate: string;
  paymentTerms: string;
  securityDeposit: number;
  mobilizationDays: number;
  authorizedSignatory: string;
  status: LoiStatus;
  clientContactMobile: string;
  clientSmsAccepted: boolean;
  clientSmsAcceptedAt?: string;
}

export type AgreementStatus =
  | 'Draft'
  | 'Internal Legal Review'
  | 'Management Approval'
  | 'Shared with Client'
  | 'Client Review'
  | 'Revision Requested'
  | 'Final Approval'
  | 'Sent for Signature'
  | 'Partially Signed'
  | 'Executed';

export interface AgreementClause {
  id: string;
  section: string;
  content: string;
  clientModifiedNote?: string;
}

export interface AgreementRecord {
  id: string;
  reference: string;
  loiId: string;
  clientId: string;
  clientName: string;
  templateName: string;
  version: string;
  annualValue: number;
  startDate: string;
  endDate: string;
  status: AgreementStatus;
  companySigned: boolean;
  clientSigned: boolean;
  smsExecutionVerified: boolean;
  smsExecutionVerifiedAt?: string;
  clauses: AgreementClause[];
}

export interface ClosingChecklistItem {
  id: string;
  label: string;
  ownerDept: string;
  completed: boolean;
  verifiedBy?: string;
}

export interface ProjectRecord {
  id: string;
  code: string;
  clientId: string;
  clientName: string;
  siteName: string;
  industry: IndustryCategory;
  agreementId: string;
  monthlyBilling: number;
  annualValue: number;
  approvedManpower: number;
  startDate: string;
  mobilizationDate: string;
  opsManager: string;
  hrCoordinator: string;
  financeCoordinator: string;
  closingStatus:
    | 'Pending Closing'
    | 'Ready for Mobilization'
    | 'Project Activated'
    | 'On Hold';
  activationSmsSent: boolean;
  checklist: ClosingChecklistItem[];
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  sourceRef: string;
  amount: number;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  projectId: string;
  clientId: string;
  clientName: string;
  gstin: string;
  placeOfSupply: 'Intra-State' | 'Inter-State';
  billingPeriod: string;
  poNumber: string;
  issueDate: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  deductions: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
  paidAmount: number;
  tdsAmount: number;
  creditNoteAmount: number;
  status:
    | 'Draft'
    | 'Pending Approval'
    | 'Approved'
    | 'Issued'
    | 'Partially Paid'
    | 'Paid'
    | 'Overdue';
  financeSmsVerified: boolean;
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  paymentDate: string;
  amountReceived: number;
  tdsDeducted: number;
  creditAdjustment: number;
  paymentMode: 'NEFT / RTGS' | 'UPI' | 'Cheque' | 'Gateway';
  utrReference: string;
  smsConfirmationSent: boolean;
  smsConfirmedVerified: boolean;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: ErpRole;
  department: string;
  mfaEnabled: boolean;
  mfaSmsVerified: boolean;
  status: 'Active' | 'Suspended';
}

export interface SmsMessageDto {
  id: string;
  direction: 'outbound' | 'inbound';
  from: string;
  to: string;
  recipientName: string;
  purpose: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  body: string;
  deliveryStatus: 'queued' | 'sent' | 'delivered' | 'received';
  verificationStatus: 'pending' | 'verified' | 'expired' | 'failed' | 'not_required';
  requiresVerification: boolean;
  attempts: number;
  maxAttempts: number;
  expiresAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
  receivedAt: string | null;
  verifiedAt: string | null;
  verifiedMethod: 'otp_entry' | 'inbound_sms_reply' | 'webhook' | null;
  carrierRef: string;
  carrierMode: 'sandbox-carrier' | 'twilio-rest';
}

export interface SmsVerificationStats {
  totalDispatched: number;
  totalReceived: number;
  inboundReplies: number;
  totalVerified: number;
  pendingVerification: number;
  failedOrExpired: number;
}

export interface SmsAuditEventDto {
  id: string;
  timestamp: string;
  messageId: string;
  phone: string;
  event: string;
  detail: string;
  status: 'info' | 'success' | 'warning' | 'error';
}

export type EmailEntityType = 'proposal' | 'invoice' | 'project';

export interface ProjectEmailRecord {
  id: string;
  projectId: string;
  projectCode: string;
  entityType: EmailEntityType;
  entityId: string;
  entityReference: string;
  clientId: string;
  clientName: string;
  direction: 'outbound' | 'inbound';
  fromEmail: string;
  toEmail: string;
  ccEmails: string;
  subject: string;
  body: string;
  attachmentName?: string;
  status: 'Sent' | 'Delivered' | 'Opened' | 'Replied';
  sentAt: string;
  sentBy: string;
}

export interface DocumentVersionSnapshot {
  id: string;
  entityType: 'invoice' | 'project';
  entityId: string;
  version: string;
  savedAt: string;
  savedBy: string;
  note: string;
  summaryValue: string;
  statusLabel: string;
}

