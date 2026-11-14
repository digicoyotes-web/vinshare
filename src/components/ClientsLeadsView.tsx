import React, { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { INDUSTRY_TEMPLATES } from '../data/seedData';
import type { ClientRecord, IndustryCategory, OpportunityRecord } from '../types/erp';
import type { SmsVerifyModalContext } from './SmsVerifyModal';
import { formatInrCompact } from '../utils/formatters';

interface ClientsLeadsViewProps {
  clients: ClientRecord[];
  opportunities: OpportunityRecord[];
  onAddClient: (client: ClientRecord, opportunity?: OpportunityRecord) => void;
  onTriggerSmsVerify: (ctx: SmsVerifyModalContext) => void;
  onCreateProposalForClient: (clientId: string) => void;
}

export const ClientsLeadsView: React.FC<ClientsLeadsViewProps> = ({
  clients,
  opportunities,
  onAddClient,
  onTriggerSmsVerify,
  onCreateProposalForClient,
}) => {
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<'All' | IndustryCategory>('All');
  const [tab, setTab] = useState<'clients' | 'opportunities'>('clients');
  const [showNewModal, setShowNewModal] = useState(false);

  // New Client form state
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState<IndustryCategory>('Commercial');
  const [contactPerson, setContactPerson] = useState('');
  const [designation, setDesignation] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [oppTitle, setOppTitle] = useState('');
  const [oppValue, setOppValue] = useState('6500000');
  const [formError, setFormError] = useState<string | null>(null);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      const matchesSector = sectorFilter === 'All' || c.industry === sectorFilter;
      const matchesQuery =
        !q ||
        c.companyName.toLowerCase().includes(q) ||
        c.contactPerson.toLowerCase().includes(q) ||
        c.mobile.toLowerCase().includes(q) ||
        c.gstin.toLowerCase().includes(q);
      return matchesSector && matchesQuery;
    });
  }, [clients, search, sectorFilter]);

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const duplicate = clients.find(
      (c) =>
        c.companyName.toLowerCase() === companyName.trim().toLowerCase() ||
        (gstin.trim() && c.gstin.toUpperCase() === gstin.trim().toUpperCase())
    );
    if (duplicate) {
      setFormError(`Duplicate check blocked: Client "${duplicate.companyName}" already exists in Client Master.`);
      return;
    }

    const id = `CLI-${String(clients.length + 1).padStart(3, '0')}`;
    const newClient: ClientRecord = {
      id,
      companyName: companyName.trim(),
      industry,
      contactPerson: contactPerson.trim(),
      designation: designation.trim() || 'Procurement Head',
      email: email.trim(),
      mobile: mobile.trim().startsWith('+') ? mobile.trim() : `+91${mobile.trim().replace(/\D/g, '')}`,
      mobileVerified: false,
      billingAddress: billingAddress.trim(),
      siteAddress: siteAddress.trim() || billingAddress.trim(),
      gstin: gstin.trim().toUpperCase(),
      pan: pan.trim().toUpperCase(),
      status: 'Prospect',
      createdAt: new Date().toISOString().slice(0, 10),
    };

    const year = new Date().getFullYear();
    const maxOppSeq = opportunities.reduce((max, o) => {
      const m = o.id.match(/(\d+)$/);
      return Math.max(max, m ? Number(m[1]) : 0);
    }, 10);
    const newOpp: OpportunityRecord | undefined = oppTitle.trim()
      ? {
          id: `OPP-${year}-${String(maxOppSeq + 1).padStart(2, '0')}`,
          clientId: id,
          title: oppTitle.trim(),
          siteName: siteAddress.trim() || `${companyName.trim()} Site`,
          builtUpAreaSqFt: 150000,
          floors: 6,
          stage: 'Proposal',
          estimatedAnnualValue: Number(oppValue) || 6500000,
          owner: 'Neha Verma',
          enquiryRef: `RFP/${id}/${year}`,
          expectedStartDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        }
      : undefined;

    onAddClient(newClient, newOpp);
    setShowNewModal(false);
    setCompanyName('');
    setContactPerson('');
    setDesignation('');
    setEmail('');
    setMobile('');
    setGstin('');
    setPan('');
    setBillingAddress('');
    setSiteAddress('');
    setOppTitle('');

    // Immediately offer SMS verification for newly created client mobile
    onTriggerSmsVerify({
      title: 'Verify New Client Contact Mobile via SMS',
      subtitle: 'Stage 01 Prerequisite · Validated contact information',
      phone: newClient.mobile,
      recipientName: `${newClient.contactPerson} (${newClient.companyName})`,
      purpose: 'client_mobile_verification',
      entityType: 'client',
      entityId: newClient.id,
      entityLabel: newClient.companyName,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#14263D]">Clients, Leads & Opportunities</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            One client, one connected lifecycle. Verify primary procurement mobile numbers via SMS before proposal issuance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          New Client & Opportunity
        </button>
      </div>

      {/* Filter & Tabs */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="flex items-center gap-1 rounded-lg bg-[#F3F6FA] p-1 border border-slate-200 w-fit">
          <button
            type="button"
            onClick={() => setTab('clients')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'clients' ? 'bg-white text-[#14263D] shadow-xs' : 'text-slate-600 hover:text-[#14263D]'
            }`}
          >
            Client Master ({clients.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('opportunities')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'opportunities' ? 'bg-white text-[#14263D] shadow-xs' : 'text-slate-600 hover:text-[#14263D]'
            }`}
          >
            Opportunities ({opportunities.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, contact, GSTIN..."
              className="rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:border-[#2463EB] focus:outline-none w-60"
            />
          </div>
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value as 'All' | IndustryCategory)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-[#2463EB] focus:outline-none"
          >
            <option value="All">All 6 Industry Sectors</option>
            {INDUSTRY_TEMPLATES.map((t) => (
              <option key={t.category} value={t.category}>
                {t.category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tab === 'clients' ? (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F3F6FA] text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Client / Company</th>
                  <th className="px-4 py-3 font-semibold">Sector</th>
                  <th className="px-4 py-3 font-semibold">Primary Contact</th>
                  <th className="px-4 py-3 font-semibold">Mobile & SMS Verification</th>
                  <th className="px-4 py-3 font-semibold">GSTIN / PAN</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F3F6FA]/60">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#14263D]">{c.companyName}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-xs">{c.siteAddress}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{c.industry}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{c.contactPerson}</div>
                      <div className="text-[11px] text-slate-500">{c.designation} · {c.email}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-mono text-slate-800 tabular-nums">{c.mobile}</div>
                      {c.mobileVerified ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded bg-[#E8F5EE] px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          SMS Verified
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onTriggerSmsVerify({
                              title: 'Verify Client Contact Mobile',
                              subtitle: 'Send OTP to client mobile and verify receipt',
                              phone: c.mobile,
                              recipientName: `${c.contactPerson} (${c.companyName})`,
                              purpose: 'client_mobile_verification',
                              entityType: 'client',
                              entityId: c.id,
                              entityLabel: c.companyName,
                            })
                          }
                          className="mt-1 inline-flex items-center gap-1 rounded bg-[#FFF2E5] px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                        >
                          <ShieldAlert className="h-3 w-3" />
                          Unverified · Verify via SMS
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                      <div>{c.gstin || '—'}</div>
                      <div className="text-slate-500">{c.pan || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                      {!c.mobileVerified && (
                        <button
                          type="button"
                          onClick={() =>
                            onTriggerSmsVerify({
                              title: 'Verify Client Mobile via SMS',
                              subtitle: 'Dispatch 6-digit verification code to handset',
                              phone: c.mobile,
                              recipientName: `${c.contactPerson} (${c.companyName})`,
                              purpose: 'client_mobile_verification',
                              entityType: 'client',
                              entityId: c.id,
                              entityLabel: c.companyName,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#14263D] hover:bg-slate-50"
                        >
                          <Smartphone className="h-3 w-3 text-[#2463EB]" />
                          Verify SMS
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onCreateProposalForClient(c.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-[#14263D] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-slate-800"
                      >
                        Create Proposal
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F3F6FA] text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Opportunity</th>
                  <th className="px-4 py-3 font-semibold">Client & Site</th>
                  <th className="px-4 py-3 font-semibold">Enquiry Ref</th>
                  <th className="px-4 py-3 font-semibold">Stage</th>
                  <th className="px-4 py-3 font-semibold text-right">Est. Annual Value</th>
                  <th className="px-4 py-3 font-semibold text-right">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {opportunities.map((opp) => {
                  const client = clients.find((c) => c.id === opp.clientId);
                  return (
                    <tr key={opp.id} className="hover:bg-[#F3F6FA]/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#14263D]">{opp.title}</div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {opp.id} · {opp.builtUpAreaSqFt.toLocaleString('en-IN')} sq.ft · {opp.floors} floors
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{client?.companyName || opp.clientId}</div>
                        <div className="text-[11px] text-slate-500">{opp.siteName}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-700">{opp.enquiryRef}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-[#2463EB]">
                          {opp.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#14263D] tabular-nums">
                        {formatInrCompact(opp.estimatedAnnualValue)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{opp.owner}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Client Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between bg-[#14263D] px-5 py-4 text-white">
              <div className="flex items-center gap-2.5">
                <Building2 className="h-5 w-5 text-blue-300" />
                <h2 className="text-sm font-semibold">Register Client & Linked Opportunity</h2>
              </div>
              <button type="button" onClick={() => setShowNewModal(false)} className="text-slate-300 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateClient} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Horizon Industrial Park Ltd"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Industry Category *</label>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value as IndustryCategory)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  >
                    {INDUSTRY_TEMPLATES.map((t) => (
                      <option key={t.category} value={t.category}>
                        {t.category}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contact Person *</label>
                  <input
                    type="text"
                    required
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="Facility Procurement Manager"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mobile Number (SMS Verified) *
                  </label>
                  <input
                    type="text"
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="+9198XXXXXXXX"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    placeholder="27AABCH1234K1Z5"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">PAN</label>
                  <input
                    type="text"
                    value={pan}
                    onChange={(e) => setPan(e.target.value)}
                    placeholder="AABCH1234K"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono uppercase"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Billing Address *</label>
                  <input
                    type="text"
                    required
                    value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Site Delivery Address</label>
                  <input
                    type="text"
                    value={siteAddress}
                    onChange={(e) => setSiteAddress(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Opportunity Title</label>
                  <input
                    type="text"
                    value={oppTitle}
                    onChange={(e) => setOppTitle(e.target.value)}
                    placeholder="Integrated FM Services 2025"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Est. Annual Value (₹)</label>
                  <input
                    type="number"
                    value={oppValue}
                    onChange={(e) => setOppValue(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Save Client & Verify Mobile via SMS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
