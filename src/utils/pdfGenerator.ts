export interface PdfDocumentSpec {
  filename: string;
  headerBanner: string;
  title: string;
  subtitle: string;
  metaPairs: Array<[string, string]>;
  tableTitle: string;
  tableHeaders: string[];
  tableRows: string[][];
  summaryRows: Array<[string, string]>;
  footerNote: string;
}

function sanitizePdfAscii(raw: string): string {
  return String(raw || '')
    .replace(/₹/g, 'Rs.')
    .replace(/[•·]/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function escapePdfString(raw: string): string {
  return sanitizePdfAscii(raw)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function truncateCell(text: string, maxLen: number): string {
  const clean = sanitizePdfAscii(text).trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(0, maxLen - 3))}...`;
}

function padRight(text: string, width: number): string {
  const s = truncateCell(text, width);
  return s + ' '.repeat(Math.max(0, width - s.length));
}

function padLeft(text: string, width: number): string {
  const s = truncateCell(text, width);
  return ' '.repeat(Math.max(0, width - s.length)) + s;
}

export function buildPdfBlob(spec: PdfDocumentSpec): Blob {
  // Build clean multi-page PDF 1.4 using Helvetica + Courier for crisp aligned tables
  const pageHeight = 842; // A4 portrait
  const pageWidth = 595;
  const marginX = 42;
  const linesPerPage: string[][] = [];
  let ops: string[] = [];

  const drawPageChrome = (pageNum: number) => {
    const chrome: string[] = [];
    // Navy header bar
    chrome.push('0.078 0.149 0.239 rg');
    chrome.push(`0 ${pageHeight - 74} ${pageWidth} 74 re f`);
    // Banner label
    chrome.push('1 1 1 rg');
    chrome.push('BT /F2 9 Tf');
    chrome.push(`${marginX} ${pageHeight - 26} Td (${escapePdfString(spec.headerBanner)}) Tj ET`);
    // Document title
    chrome.push('BT /F2 16 Tf');
    chrome.push(`${marginX} ${pageHeight - 48} Td (${escapePdfString(truncateCell(spec.title, 62))}) Tj ET`);
    // Subtitle
    chrome.push('0.78 0.85 0.94 rg');
    chrome.push('BT /F1 9 Tf');
    chrome.push(`${marginX} ${pageHeight - 63} Td (${escapePdfString(truncateCell(spec.subtitle, 85))}) Tj ET`);
    // Page footer
    chrome.push('0.45 0.50 0.58 rg');
    chrome.push('BT /F1 8 Tf');
    chrome.push(
      `${marginX} 26 Td (${escapePdfString(truncateCell(spec.footerNote, 82))}   |   Page ${pageNum}) Tj ET`
    );
    return chrome;
  };

  let cursorY = pageHeight - 100;
  let pageCount = 1;
  ops.push(...drawPageChrome(pageCount));

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < 56) {
      linesPerPage.push(ops);
      pageCount += 1;
      ops = [...drawPageChrome(pageCount)];
      cursorY = pageHeight - 98;
    }
  };

  // Metadata pairs grid
  ops.push('0.95 0.965 0.985 rg');
  const metaRowsCount = Math.ceil(spec.metaPairs.length / 2);
  const metaBoxHeight = metaRowsCount * 16 + 16;
  ops.push(`${marginX} ${cursorY - metaBoxHeight + 10} ${pageWidth - marginX * 2} ${metaBoxHeight} re f`);
  ops.push('0.85 0.88 0.92 RG 0.7 w');
  ops.push(`${marginX} ${cursorY - metaBoxHeight + 10} ${pageWidth - marginX * 2} ${metaBoxHeight} re S`);

  let metaY = cursorY - 8;
  for (let i = 0; i < spec.metaPairs.length; i += 2) {
    const left = spec.metaPairs[i];
    const right = spec.metaPairs[i + 1];
    if (left) {
      ops.push('0.35 0.42 0.50 rg BT /F1 8.5 Tf');
      ops.push(`${marginX + 12} ${metaY} Td (${escapePdfString(left[0])}:) Tj ET`);
      ops.push('0.078 0.149 0.239 rg BT /F2 8.5 Tf');
      ops.push(`${marginX + 96} ${metaY} Td (${escapePdfString(truncateCell(left[1], 28))}) Tj ET`);
    }
    if (right) {
      ops.push('0.35 0.42 0.50 rg BT /F1 8.5 Tf');
      ops.push(`${marginX + 270} ${metaY} Td (${escapePdfString(right[0])}:) Tj ET`);
      ops.push('0.078 0.149 0.239 rg BT /F2 8.5 Tf');
      ops.push(`${marginX + 356} ${metaY} Td (${escapePdfString(truncateCell(right[1], 28))}) Tj ET`);
    }
    metaY -= 16;
  }

  cursorY -= metaBoxHeight + 18;

  // Table Title
  ensureSpace(44);
  ops.push('0.078 0.149 0.239 rg BT /F2 11 Tf');
  ops.push(`${marginX} ${cursorY} Td (${escapePdfString(spec.tableTitle)}) Tj ET`);
  cursorY -= 18;

  // Fixed-width Courier table formatting for rock-solid column alignment
  const colWidths =
    spec.tableHeaders.length === 4
      ? [16, 36, 12, 16]
      : spec.tableHeaders.length === 3
      ? [38, 24, 18]
      : spec.tableHeaders.map(() => Math.floor(78 / Math.max(1, spec.tableHeaders.length)));

  const formatRowLine = (cells: string[]) =>
    cells
      .map((cell, idx) => {
        const w = colWidths[idx] || 18;
        const isLast = idx === cells.length - 1;
        const isNumeric = /^[\dRs.,\-+% ]+$/.test(sanitizePdfAscii(cell).trim());
        return isLast || isNumeric ? padLeft(cell, w) : padRight(cell, w);
      })
      .join('  ');

  // Table Header row background
  ops.push('0.92 0.945 0.98 rg');
  ops.push(`${marginX} ${cursorY - 5} ${pageWidth - marginX * 2} 17 re f`);
  ops.push('0.078 0.149 0.239 rg BT /F3 8.2 Tf');
  ops.push(`${marginX + 8} ${cursorY} Td (${escapePdfString(formatRowLine(spec.tableHeaders))}) Tj ET`);
  cursorY -= 19;

  for (const row of spec.tableRows) {
    ensureSpace(20);
    ops.push('0.88 0.90 0.94 RG 0.4 w');
    ops.push(`${marginX} ${cursorY - 4} m ${pageWidth - marginX} ${cursorY - 4} l S`);
    ops.push('0.14 0.20 0.28 rg BT /F3 8.2 Tf');
    ops.push(`${marginX + 8} ${cursorY} Td (${escapePdfString(formatRowLine(row))}) Tj ET`);
    cursorY -= 16;
  }

  cursorY -= 12;

  // Summary totals block
  if (spec.summaryRows.length > 0) {
    const sumHeight = spec.summaryRows.length * 17 + 16;
    ensureSpace(sumHeight + 20);
    const boxW = 270;
    const boxX = pageWidth - marginX - boxW;
    ops.push('0.95 0.97 1.0 rg');
    ops.push(`${boxX} ${cursorY - sumHeight + 10} ${boxW} ${sumHeight} re f`);
    ops.push('0.80 0.85 0.92 RG 0.7 w');
    ops.push(`${boxX} ${cursorY - sumHeight + 10} ${boxW} ${sumHeight} re S`);

    let sy = cursorY - 8;
    spec.summaryRows.forEach(([label, val], idx) => {
      const isLast = idx === spec.summaryRows.length - 1;
      ops.push(isLast ? '0.141 0.388 0.922 rg BT /F2 9.5 Tf' : '0.20 0.26 0.34 rg BT /F1 8.5 Tf');
      ops.push(`${boxX + 12} ${sy} Td (${escapePdfString(truncateCell(label, 28))}) Tj ET`);
      ops.push(isLast ? '0.078 0.149 0.239 rg BT /F2 9.5 Tf' : '0.078 0.149 0.239 rg BT /F3 8.5 Tf');
      ops.push(`${boxX + 150} ${sy} Td (${escapePdfString(padLeft(val, 18))}) Tj ET`);
      sy -= 17;
    });
  }

  linesPerPage.push(ops);

  // Assemble PDF objects
  const objects: string[] = [];
  const addObj = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = addObj(''); // 1
  const pagesId = addObj(''); // 2
  const fontHelveticaId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontHelveticaBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const fontCourierId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');

  const pageIds: number[] = [];
  for (const pageOps of linesPerPage) {
    const stream = pageOps.join('\n');
    const contentId = addObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObj(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontHelveticaId} 0 R /F2 ${fontHelveticaBoldId} 0 R /F3 ${fontCourierId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((body, idx) => {
    offsets.push(pdf.length);
    pdf += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export function downloadDocumentPdf(spec: PdfDocumentSpec): void {
  const blob = buildPdfBlob(spec);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = spec.filename.endsWith('.pdf') ? spec.filename : `${spec.filename}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
