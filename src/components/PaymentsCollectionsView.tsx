import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, ShieldCheck } from 'lucide-react';
import type { ClientRecord, InvoiceRecord, PaymentRecord } from '../types/erp';
import { formatInrCompact, formatInrFull } from '../utils/formatters';
import type { SmsVerifyModalContext } from './SmsVerifyModal';

interface PaymentsCollectionsViewProps {
  clients: ClientRecord[];
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
  onRecordPayment: (payment: PaymentRecord) => void;
  onTriggerSmsVerify: (ctx: SmsVerifyModalContext) => void;
}

export const PaymentsCollectionsView: React.FC<PaymentsCollectionsViewProps> = ({
  clients,
  invoices,
  payments,
  onRecordPayment,
  onTriggerSmsVerify,
}) => {
  const openInvoices = useMemo(
    () =>
      invoices.filter(
        (i) => i.totalAmount - i.paidAmount - i.tdsAmount - i.creditNoteAmount > 0
      ),
    [invoices]
  );

  const [invoiceId, setInvoiceId] = useState(
    openInvoices[0]?.id || invoices[0]?.id || ''
  );
  const [amountReceived, setAmountReceived] = useState(() => {
    const first = openInvoices[0] || invoices[0];
    if (!first) return '0';
    return String(
      Math.max(0, first.totalAmount - first.paidAmount - first.tdsAmount - first.creditNoteAmount)
    );
  });
  const [tdsDeducted, setTdsDeducted] = useState('0');
  const [creditAdjustment, setCreditAdjustment] = useState('0');
  const [paymentMode, setPaymentMode] = useState<PaymentRecord['paymentMode']>('NEFT / RTGS');
  const [utrReference, setUtrReference] = useState('');
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (invoices.length === 0) return;
    const current = invoices.find((i) => i.id === invoiceId);
    const currentBalance = current
      ? current.totalAmount - current.paidAmount - current.tdsAmount - current.creditNoteAmount
      : 0;
    if (!current || (currentBalance <= 0 && openInvoices.length > 0)) {
      const next = openInvoices[0] || invoices[0];
      if (next && next.id !== invoiceId) {
        setInvoiceId(next.id);
        const bal = Math.max(
          0,
          next.totalAmount - next.paidAmount - next.tdsAmount - next.creditNoteAmount
        );
        setAmountReceived(String(bal));
      }
    }
  }, [invoices, openInvoices, invoiceId]);

  const selectedInvoice = useMemo(
    () => invoices.find((i) => i.id === invoiceId) || openInvoices[0] || invoices[0],
    [invoices, openInvoices, invoiceId]
  );

  const selectedOutstanding = selectedInvoice
    ? Math.max(
        0,
        selectedInvoice.totalAmount -
          selectedInvoice.paidAmount -
          selectedInvoice.tdsAmount -
          selectedInvoice.creditNoteAmount
      )
    : 0;

  const handleInvoiceChange = (nextId: string) => {
    setInvoiceId(nextId);
    setFormError(null);
    const nextInv = invoices.find((i) => i.id === nextId);
    if (nextInv) {
      const bal = Math.max(
        0,
        nextInv.totalAmount - nextInv.paidAmount - nextInv.tdsAmount - nextInv.creditNoteAmount
      );
      setAmountReceived(String(bal));
      setTdsDeducted('0');
      setCreditAdjustment('0');
    }
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormNotice(null);
    const inv = selectedInvoice;
    if (!inv) {
      setFormError('Please select a target invoice.');
      return;
    }

    const net = Math.max(0, Number(amountReceived) || 0);
    const tds = Math.max(0, Number(tdsDeducted) || 0);
    const credit = Math.max(0, Number(creditAdjustment) || 0);
    const totalSettled = net + tds + credit;
    if (totalSettled <= 0) {
      setFormError('Enter a payment, TDS, or credit note amount greater than ₹0.');
      return;
    }

    const year = new Date().getFullYear();
    const maxSeq = payments.reduce((max, p) => {
      const m = p.id.match(/(\d+)$/);
      return Math.max(max, m ? Number(m[1]) : 0);
    }, 92);
    const receiptId = `PAY-${year}-${String(maxSeq + 1).padStart(3, '0')}`;

    const payment: PaymentRecord = {
      id: receiptId,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName,
      paymentDate: new Date().toISOString().slice(0, 10),
      amountReceived: net,
      tdsDeducted: tds,
      creditAdjustment: credit,
      paymentMode,
      utrReference: utrReference.trim() || `UTR-${Date.now().toString(36).toUpperCase()}`,
      smsConfirmationSent: false,
      smsConfirmedVerified: false,
    };

    onRecordPayment(payment);
    setUtrReference('');
    setFormNotice(`Receipt ${receiptId} allocated against ${inv.invoiceNumber}.`);
    setTimeout(() => setFormNotice(null), 3500);
  };

  const ageingBuckets = useMemo(() => {
    const now = Date.now();
    const buckets = {
      d0_30: { amount: 0, count: 0 },
      d31_60: { amount: 0, count: 0 },
      d61_90: { amount: 0, count: 0 },
      d90_plus: { amount: 0, count: 0 },
    };

    for (const inv of invoices) {
      const outstanding = Math.max(
        0,
        inv.totalAmount - inv.paidAmount - inv.tdsAmount - inv.creditNoteAmount
      );
      if (outstanding <= 0) continue;

      const parsedDate = new Date(inv.issueDate).getTime();
      const days = Number.isFinite(parsedDate)
        ? Math.max(0, Math.floor((now - parsedDate) / (1000 * 3600 * 24)))
        : 0;

      if (days <= 30) {
        buckets.d0_30.amount += outstanding;
        buckets.d0_30.count += 1;
      } else if (days <= 60) {
        buckets.d31_60.amount += outstanding;
        buckets.d31_60.count += 1;
      } else if (days <= 90) {
        buckets.d61_90.amount += outstanding;
        buckets.d61_90.count += 1;
      } else {
        buckets.d90_plus.amount += outstanding;
        buckets.d90_plus.count += 1;
      }
    }
    return buckets;
  }, [invoices]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[#14263D]">
          Payments, Collections & Receivables Ageing
        </h1>
        <p className="text-xs text-slate-600 mt-0.5">
          Track partial receipts, TDS withholding, credit notes, live ageing buckets, and SMS receipt verification.
        </p>
      </div>

      {/* Live Ageing Buckets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>0–30 Days Ageing</span>
            <span className="font-mono text-[11px]">{ageingBuckets.d0_30.count} inv</span>
          </div>
          <div className="mt-1 text-xl font-bold text-[#14263D] font-mono tabular-nums">
            {formatInrCompact(ageingBuckets.d0_30.amount)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>31–60 Days Ageing</span>
            <span className="font-mono text-[11px]">{ageingBuckets.d31_60.count} inv</span>
          </div>
          <div className="mt-1 text-xl font-bold text-amber-700 font-mono tabular-nums">
            {formatInrCompact(ageingBuckets.d31_60.amount)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>61–90 Days Ageing</span>
            <span className="font-mono text-[11px]">{ageingBuckets.d61_90.count} inv</span>
          </div>
          <div className="mt-1 text-xl font-bold text-rose-700 font-mono tabular-nums">
            {formatInrCompact(ageingBuckets.d61_90.amount)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>90+ Days Overdue</span>
            <span className="font-mono text-[11px]">{ageingBuckets.d90_plus.count} inv</span>
          </div>
          <div className="mt-1 text-xl font-bold text-rose-800 font-mono tabular-nums">
            {formatInrCompact(ageingBuckets.d90_plus.amount)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <form
          onSubmit={handlePaymentSubmit}
          className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[#2463EB]" />
              <h2 className="text-sm font-semibold text-[#14263D]">Record Payment Receipt</h2>
            </div>
            {selectedInvoice && selectedOutstanding > 0 && (
              <button
                type="button"
                onClick={() => {
                  setAmountReceived(String(selectedOutstanding));
                  setTdsDeducted('0');
                  setCreditAdjustment('0');
                }}
                className="text-[11px] font-medium text-[#2463EB] hover:underline"
              >
                Fill Balance
              </button>
            )}
          </div>

          {formNotice && (
            <div className="rounded-lg border border-emerald-200 bg-[#E8F5EE] px-3 py-2 text-[11px] font-medium text-emerald-900">
              {formNotice}
            </div>
          )}
          {formError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-800">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Target Invoice
            </label>
            <select
              value={selectedInvoice?.id || ''}
              onChange={(e) => handleInvoiceChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              {invoices.map((i) => {
                const out = Math.max(
                  0,
                  i.totalAmount - i.paidAmount - i.tdsAmount - i.creditNoteAmount
                );
                return (
                  <option key={i.id} value={i.id}>
                    {i.invoiceNumber} — {i.clientName} (Bal: {formatInrFull(out)})
                  </option>
                );
              })}
            </select>
            {selectedInvoice && (
              <div className="mt-1 flex justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                <span>Issued: {selectedInvoice.issueDate}</span>
                <span>Open Bal: {formatInrFull(selectedOutstanding)}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Net Received (₹)
              </label>
              <input
                type="number"
                min={0}
                required
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                TDS Withholding (₹)
              </label>
              <input
                type="number"
                min={0}
                value={tdsDeducted}
                onChange={(e) => setTdsDeducted(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Credit Note Adj. (₹)
              </label>
              <input
                type="number"
                min={0}
                value={creditAdjustment}
                onChange={(e) => setCreditAdjustment(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Payment Mode
              </label>
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
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              UTR / Transaction Reference
            </label>
            <input
              type="text"
              required
              placeholder="e.g. HDFC261115991042"
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
                {payments.map((p) => {
                  const inv = invoices.find((i) => i.id === p.invoiceId);
                  const client = inv
                    ? clients.find((c) => c.id === inv.clientId)
                    : clients.find((c) => c.companyName === p.clientName);
                  return (
                    <tr key={p.id} className="hover:bg-[#F3F6FA]/50">
                      <td className="px-4 py-3">
                        <div className="font-mono font-semibold text-[#14263D]">
                          {p.id} → {p.invoiceNumber}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {p.clientName} · {p.paymentDate}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-800 font-medium">{p.paymentMode}</div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {p.utrReference}
                        </div>
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
                                phone: client?.mobile || '+919810433219',
                                recipientName: client?.contactPerson
                                  ? `${client.contactPerson} (${p.clientName})`
                                  : p.clientName,
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
