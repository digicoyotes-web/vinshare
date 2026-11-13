import React, { useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, ShieldCheck } from 'lucide-react';
import type { InvoiceRecord, PaymentRecord } from '../types/erp';
import { formatInrCompact, formatInrFull } from '../utils/formatters';
import type { SmsVerifyModalContext } from './SmsVerifyModal';

interface PaymentsCollectionsViewProps {
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
  onRecordPayment: (payment: PaymentRecord) => void;
  onTriggerSmsVerify: (ctx: SmsVerifyModalContext) => void;
}

export const PaymentsCollectionsView: React.FC<PaymentsCollectionsViewProps> = ({
  invoices,
  payments,
  onRecordPayment,
  onTriggerSmsVerify,
}) => {
  const openInvoices = invoices.filter((i) => i.totalAmount - i.paidAmount - i.tdsAmount - i.creditNoteAmount > 0);
  const [invoiceId, setInvoiceId] = useState(openInvoices[0]?.id || invoices[0]?.id || '');
  const [amountReceived, setAmountReceived] = useState('500000');
  const [tdsDeducted, setTdsDeducted] = useState('10000');
  const [creditAdjustment, setCreditAdjustment] = useState('0');
  const [paymentMode, setPaymentMode] = useState<PaymentRecord['paymentMode']>('NEFT / RTGS');
  const [utrReference, setUtrReference] = useState('HDFC250115991042');

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    const payment: PaymentRecord = {
      id: `PAY-2025-${String(payments.length + 93)}`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName,
      paymentDate: new Date().toISOString().slice(0, 10),
      amountReceived: Number(amountReceived) || 0,
      tdsDeducted: Number(tdsDeducted) || 0,
      creditAdjustment: Number(creditAdjustment) || 0,
      paymentMode,
      utrReference: utrReference.trim() || `UTR-${Date.now()}`,
      smsConfirmationSent: false,
      smsConfirmedVerified: false,
    };
    onRecordPayment(payment);
  };

  const ageingBuckets = useMemo(() => {
    const now = new Date('2025-01-31').getTime();
    const buckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    for (const inv of invoices) {
      const outstanding = Math.max(0, inv.totalAmount - inv.paidAmount - inv.tdsAmount - inv.creditNoteAmount);
      if (outstanding <= 0) continue;
      const days = Math.max(0, Math.floor((now - new Date(inv.issueDate).getTime()) / (1000 * 3600 * 24)));
      if (days <= 30) buckets.d0_30 += outstanding;
      else if (days <= 60) buckets.d31_60 += outstanding;
      else if (days <= 90) buckets.d61_90 += outstanding;
      else buckets.d90_plus += outstanding;
    }
    return buckets;
  }, [invoices]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[#14263D]">Payments, Collections & Receivables Ageing</h1>
        <p className="text-xs text-slate-600 mt-0.5">
          Track partial receipts, TDS withholding, credit notes, UTR references, and SMS receipt verification.
        </p>
      </div>

      {/* Ageing Buckets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">0–30 Days Ageing</div>
          <div className="mt-1 text-xl font-bold text-[#14263D] font-mono tabular-nums">
            {formatInrCompact(ageingBuckets.d0_30)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">31–60 Days Ageing</div>
          <div className="mt-1 text-xl font-bold text-amber-700 font-mono tabular-nums">
            {formatInrCompact(ageingBuckets.d31_60)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">61–90 Days Ageing</div>
          <div className="mt-1 text-xl font-bold text-rose-700 font-mono tabular-nums">
            {formatInrCompact(ageingBuckets.d61_90)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">90+ Days Overdue</div>
          <div className="mt-1 text-xl font-bold text-rose-800 font-mono tabular-nums">
            {formatInrCompact(ageingBuckets.d90_plus)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <form
          onSubmit={handlePaymentSubmit}
          className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 space-y-3"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <CreditCard className="h-4 w-4 text-[#2463EB]" />
            <h2 className="text-sm font-semibold text-[#14263D]">Record Payment Receipt</h2>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Target Invoice</label>
            <select
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              {invoices.map((i) => {
                const out = Math.max(0, i.totalAmount - i.paidAmount - i.tdsAmount - i.creditNoteAmount);
                return (
                  <option key={i.id} value={i.id}>
                    {i.invoiceNumber} — {i.clientName} (Bal: {formatInrFull(out)})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Net Received (₹)</label>
              <input
                type="number"
                required
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">TDS Withholding (₹)</label>
              <input
                type="number"
                value={tdsDeducted}
                onChange={(e) => setTdsDeducted(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Credit Note Adj. (₹)</label>
              <input
                type="number"
                value={creditAdjustment}
                onChange={(e) => setCreditAdjustment(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentRecord['paymentMode'])}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
              >
                <option value="NEFT / RTGS">NEFT / RTGS</option>
                <option value="UPI">UPI</option>
                <option value="Cheque">Cheque</option>
                <option value="Gateway">Gateway</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">UTR / Transaction Reference</label>
            <input
              type="text"
              required
              value={utrReference}
              onChange={(e) => setUtrReference(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-[#2463EB] px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Allocate Receipt & Update Balance
          </button>
        </form>

        <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[#14263D]">Receipts & Settlement Ledger</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F3F6FA] text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Receipt & Invoice</th>
                  <th className="px-4 py-2.5 font-semibold">Mode / UTR</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Received</th>
                  <th className="px-4 py-2.5 font-semibold text-right">TDS / Adj</th>
                  <th className="px-4 py-2.5 font-semibold text-right">SMS Confirmation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F3F6FA]/50">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-[#14263D]">{p.id} → {p.invoiceNumber}</div>
                      <div className="text-[11px] text-slate-500">{p.clientName} · {p.paymentDate}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-800 font-medium">{p.paymentMode}</div>
                      <div className="font-mono text-[11px] text-slate-500">{p.utrReference}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                      {formatInrFull(p.amountReceived)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">
                      {formatInrFull(p.tdsDeducted + p.creditAdjustment)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.smsConfirmedVerified ? (
                        <span className="inline-flex items-center gap-1 rounded bg-[#E8F5EE] px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          SMS Verified
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onTriggerSmsVerify({
                              title: 'Send & Verify Payment Receipt SMS',
                              subtitle: `Confirm receipt ${p.id} (${formatInrFull(p.amountReceived)}) via SMS`,
                              phone: '+919810433219',
                              recipientName: p.clientName,
                              purpose: 'payment_confirmation',
                              entityType: 'payment',
                              entityId: p.id,
                              entityLabel: `${p.id} · ${p.invoiceNumber}`,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded bg-[#FFF2E5] px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          Send & Verify SMS
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
