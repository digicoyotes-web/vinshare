import type {
  ClientRecord,
  DocumentVersionSnapshot,
  InvoiceRecord,
  ProjectRecord,
  ProposalRecord,
  VirtualDocumentFile,
} from '../types/erp';
import { formatInrFull } from './formatters';
import { buildPdfBlob, downloadDocumentPdf, type PdfDocumentSpec } from './pdfGenerator';

export function buildVirtualDocumentVault(params: {
  clients: ClientRecord[];
  proposals: ProposalRecord[];
  invoices: InvoiceRecord[];
  projects: ProjectRecord[];
  docSnapshots: DocumentVersionSnapshot[];
}): VirtualDocumentFile[] {
  const { clients, proposals, invoices, projects, docSnapshots } = params;
  const files: VirtualDocumentFile[] = [];

  // 1. Proposals Directory (/ERP-Vault/Proposals)
  for (const prop of proposals) {
    const client = clients.find((c) => c.id === prop.clientId);
    for (const ver of prop.versions.slice().reverse()) {
      const filename = `${prop.reference.replace(/\//g, '-')}-${ver.version}.pdf`;
      const spec: PdfDocumentSpec = {
        filename,
        headerBanner: 'FACILITY MANAGEMENT ERP · COMMERCIAL PROPOSAL',
        title: client?.companyName || prop.clientId,
        subtitle: `${prop.reference} (${ver.version}) · ${prop.siteName}`,
        metaPairs: [
          ['Proposal Ref', prop.reference],
          ['Version / Status', `${ver.version} (${ver.status})`],
          ['Client Contact', client?.contactPerson || 'Authorized Signatory'],
          ['Industry Sector', prop.industry],
          ['Contract Term', `${prop.contractDurationMonths} Months`],
          ['Valid Until', prop.validityDate],
        ],
        tableTitle: 'Commercial Cost Breakdown (Monthly)',
        tableHeaders: ['Category', 'Particulars', 'Qty', 'Monthly Total'],
        tableRows: ver.lineItems.map((item) => [
          item.category,
          item.designationOrItem,
          String(item.quantity),
          formatInrFull(Math.round(item.quantity * item.unitRate * (1 + item.statutoryPct / 100))),
        ]),
        summaryRows: [
          ['Direct Operating Cost / Mo', formatInrFull(ver.directCost)],
          ['Site Overheads / Mo', formatInrFull(ver.overheadCost)],
          ['Total Cost / Mo', formatInrFull(ver.totalOperatingCost)],
          ['Monthly Selling Price', formatInrFull(ver.monthlySellingPrice)],
          ['Annual Contract Value', formatInrFull(ver.annualContractValue)],
        ],
        footerNote: `Prepared by ${ver.createdBy} · Services: ${prop.selectedServices.join(', ')}`,
      };
      files.push({
        id: `VFS-PROP-${prop.id}-${ver.version}`,
        folder: 'Proposals',
        virtualPath: `/ERP-Vault/Proposals/${filename}`,
        filename,
        entityType: 'proposal',
        entityId: prop.id,
        entityReference: `${prop.reference} (${ver.version})`,
        clientId: prop.clientId,
        clientName: client?.companyName || prop.clientId,
        versionLabel: `${ver.version} · ${ver.status}`,
        note: ver.reason || `Commercial Proposal Snapshot (${formatInrFull(ver.annualContractValue)}/yr)`,
        savedAt: ver.createdAt,
        savedBy: ver.createdBy,
        sizeBytes: buildPdfBlob(spec).size,
        buildPdf: () => downloadDocumentPdf(spec),
      });
    }
  }

  // 2. Invoices Directory (/ERP-Vault/Invoices)
  for (const inv of invoices) {
    const project = projects.find((p) => p.id === inv.projectId);
    const invSnapshots = docSnapshots.filter(
      (s) => s.entityType === 'invoice' && s.entityId === inv.id
    );

    const buildInvSpec = (filename: string, revLabel: string): PdfDocumentSpec => ({
      filename,
      headerBanner: 'FACILITY MANAGEMENT ERP · TAX INVOICE',
      title: inv.clientName,
      subtitle: `Invoice ${inv.invoiceNumber} (${revLabel}) · Billing Period ${inv.billingPeriod}`,
      metaPairs: [
        ['Invoice No', inv.invoiceNumber],
        ['Issue Date', inv.issueDate],
        ['Due Date', inv.dueDate],
        ['Client GSTIN', inv.gstin],
        ['PO Number', inv.poNumber],
        ['Place of Supply', inv.placeOfSupply],
      ],
      tableTitle: 'Contract-Linked Billing Particulars',
      tableHeaders: ['Description', 'Contract Traceability', 'Amount'],
      tableRows: [
        ...inv.lineItems.map((li) => [li.description, li.sourceRef, formatInrFull(li.amount)]),
        ...(inv.deductions > 0
          ? [['Applicable Deductions / SLA Credit', 'Contract SLA', `-${formatInrFull(inv.deductions)}`]]
          : []),
      ],
      summaryRows: [
        ['Taxable Value', formatInrFull(inv.taxableValue)],
        ...(inv.placeOfSupply === 'Intra-State'
          ? [
              ['CGST (9%)', formatInrFull(inv.cgst)] as [string, string],
              ['SGST (9%)', formatInrFull(inv.sgst)] as [string, string],
            ]
          : [['IGST (18%)', formatInrFull(inv.igst)] as [string, string]]),
        ['Invoice Total', formatInrFull(inv.totalAmount)],
      ],
      footerNote: `Project: ${project?.code || inv.projectId} · Status: ${inv.status}`,
    });

    const liveFilename = `${inv.invoiceNumber}.pdf`;
    const liveSpec = buildInvSpec(liveFilename, inv.status);
    files.push({
      id: `VFS-INV-${inv.id}-LIVE`,
      folder: 'Invoices',
      virtualPath: `/ERP-Vault/Invoices/${liveFilename}`,
      filename: liveFilename,
      entityType: 'invoice',
      entityId: inv.id,
      entityReference: inv.invoiceNumber,
      clientId: inv.clientId,
      clientName: inv.clientName,
      versionLabel: `Current · ${inv.status}`,
      note: `${inv.billingPeriod} Tax Invoice · PO ${inv.poNumber} · ${formatInrFull(inv.totalAmount)}`,
      savedAt: `${inv.issueDate}T10:00:00.000Z`,
      savedBy: 'Finance Desk',
      sizeBytes: buildPdfBlob(liveSpec).size,
      buildPdf: () => downloadDocumentPdf(liveSpec),
    });

    for (const snap of invSnapshots) {
      const snapFilename = `${inv.invoiceNumber}-${snap.version.replace(/\s+/g, '')}.pdf`;
      const snapSpec = buildInvSpec(snapFilename, snap.version);
      files.push({
        id: `VFS-INV-SNAP-${snap.id}`,
        folder: 'Invoices',
        virtualPath: `/ERP-Vault/Invoices/${snapFilename}`,
        filename: snapFilename,
        entityType: 'invoice',
        entityId: inv.id,
        entityReference: `${inv.invoiceNumber} (${snap.version})`,
        clientId: inv.clientId,
        clientName: inv.clientName,
        versionLabel: `${snap.version} · ${snap.statusLabel}`,
        note: snap.note,
        savedAt: snap.savedAt,
        savedBy: snap.savedBy,
        sizeBytes: buildPdfBlob(snapSpec).size,
        buildPdf: () => downloadDocumentPdf(snapSpec),
      });
    }
  }

  // 3. Project Reports Directory (/ERP-Vault/Project-Reports)
  for (const prj of projects) {
    const completedCount = prj.checklist.filter((c) => c.completed).length;
    const prjSnapshots = docSnapshots.filter(
      (s) => s.entityType === 'project' && s.entityId === prj.id
    );

    const buildPrjSpec = (filename: string, label: string): PdfDocumentSpec => ({
      filename,
      headerBanner: 'FACILITY MANAGEMENT ERP · PROJECT HANDOVER DOSSIER',
      title: `${prj.code} · ${prj.clientName}`,
      subtitle: `${prj.siteName} · ${label}`,
      metaPairs: [
        ['Project Code', prj.code],
        ['Closing Status', prj.closingStatus],
        ['Agreement Ref', prj.agreementId],
        ['Approved Manpower', `${prj.approvedManpower} Personnel`],
        ['Ops Manager', prj.opsManager],
        ['Mobilization Date', prj.mobilizationDate],
      ],
      tableTitle: 'Mandatory 9-Point Closing & Handover Checklist',
      tableHeaders: ['Checkpoint', 'Owner Dept', 'Verified By', 'Status'],
      tableRows: prj.checklist.map((item) => [
        item.label,
        item.ownerDept,
        item.verifiedBy || '-',
        item.completed ? 'Verified' : 'Pending',
      ]),
      summaryRows: [
        ['Checklist Progress', `${completedCount} / ${prj.checklist.length} Completed`],
        ['Monthly Billing', formatInrFull(prj.monthlyBilling)],
        ['Annual Contract Value', formatInrFull(prj.annualValue)],
      ],
      footerNote: `HR: ${prj.hrCoordinator} · Finance: ${prj.financeCoordinator}`,
    });

    const livePrjFile = `${prj.code}-Handover-Dossier.pdf`;
    const livePrjSpec = buildPrjSpec(livePrjFile, prj.closingStatus);
    files.push({
      id: `VFS-PRJ-${prj.id}-LIVE`,
      folder: 'Project-Reports',
      virtualPath: `/ERP-Vault/Project-Reports/${livePrjFile}`,
      filename: livePrjFile,
      entityType: 'project',
      entityId: prj.id,
      entityReference: prj.code,
      clientId: prj.clientId,
      clientName: prj.clientName,
      versionLabel: `Current · ${completedCount}/${prj.checklist.length} Checks`,
      note: `${prj.siteName} · ${prj.closingStatus}`,
      savedAt: `${prj.mobilizationDate}T09:00:00.000Z`,
      savedBy: prj.opsManager,
      sizeBytes: buildPdfBlob(livePrjSpec).size,
      buildPdf: () => downloadDocumentPdf(livePrjSpec),
    });

    for (const snap of prjSnapshots) {
      const snapPrjFile = `${prj.code}-${snap.version.replace(/\s+/g, '-')}.pdf`;
      const snapPrjSpec = buildPrjSpec(snapPrjFile, snap.version);
      files.push({
        id: `VFS-PRJ-SNAP-${snap.id}`,
        folder: 'Project-Reports',
        virtualPath: `/ERP-Vault/Project-Reports/${snapPrjFile}`,
        filename: snapPrjFile,
        entityType: 'project',
        entityId: prj.id,
        entityReference: `${prj.code} (${snap.version})`,
        clientId: prj.clientId,
        clientName: prj.clientName,
        versionLabel: `${snap.version} · ${snap.statusLabel}`,
        note: snap.note,
        savedAt: snap.savedAt,
        savedBy: snap.savedBy,
        sizeBytes: buildPdfBlob(snapPrjSpec).size,
        buildPdf: () => downloadDocumentPdf(snapPrjSpec),
      });
    }
  }

  return files;
}

export function formatFileBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
