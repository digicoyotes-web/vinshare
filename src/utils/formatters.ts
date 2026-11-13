import type { CostSheetLineItem } from '../types/erp';

export function formatInrCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1e7) {
    return `${sign}₹ ${(abs / 1e7).toFixed(2)} Cr`;
  }
  if (abs >= 1e5) {
    return `${sign}₹ ${(abs / 1e5).toFixed(2)} L`;
  }
  return `${sign}₹ ${Math.round(abs).toLocaleString('en-IN')}`;
}

export function formatInrFull(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}₹ ${Math.round(Math.abs(amount)).toLocaleString('en-IN')}`;
}

export function formatDateShort(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function calculateCostSheetFinancials(
  lineItems: CostSheetLineItem[],
  pricingMode: 'margin' | 'markup',
  serviceChargePct: number,
  discountPct: number,
  contractMonths: number = 12
) {
  let directCost = 0;
  let overheadCost = 0;

  for (const item of lineItems) {
    const base = item.quantity * item.unitRate;
    const statutory = base * ((item.statutoryPct || 0) / 100);
    const lineTotal = base + statutory;
    if (item.category === 'Overheads') {
      overheadCost += lineTotal;
    } else {
      directCost += lineTotal;
    }
  }

  const totalOperatingCost = directCost + overheadCost;
  const clampedRate = Math.min(Math.max(serviceChargePct, 0), 85);

  let grossSellingPrice = 0;
  if (pricingMode === 'markup') {
    grossSellingPrice = totalOperatingCost * (1 + clampedRate / 100);
  } else {
    // Target Margin % = (Price - Cost) / Price => Price = Cost / (1 - Margin%)
    const denom = Math.max(0.05, 1 - clampedRate / 100);
    grossSellingPrice = totalOperatingCost / denom;
  }

  const monthlySellingPrice = grossSellingPrice * (1 - Math.max(0, discountPct) / 100);
  const grossProfit = monthlySellingPrice - totalOperatingCost;
  const grossMarginPct = monthlySellingPrice > 0 ? (grossProfit / monthlySellingPrice) * 100 : 0;
  const annualContractValue = monthlySellingPrice * contractMonths;

  return {
    directCost: Math.round(directCost),
    overheadCost: Math.round(overheadCost),
    totalOperatingCost: Math.round(totalOperatingCost),
    monthlySellingPrice: Math.round(monthlySellingPrice),
    annualContractValue: Math.round(annualContractValue),
    grossProfit: Math.round(grossProfit),
    grossMarginPct: Number(grossMarginPct.toFixed(2)),
  };
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
