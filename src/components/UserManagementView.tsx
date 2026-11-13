import React from 'react';
import { CheckCircle2, ShieldAlert, ShieldCheck, UserCheck } from 'lucide-react';
import type { ErpRole, UserAccount } from '../types/erp';
import type { SmsVerifyModalContext } from './SmsVerifyModal';

interface UserManagementViewProps {
  users: UserAccount[];
  activeUser: UserAccount;
  onSwitchActiveUser: (userId: string) => void;
  onTriggerSmsVerify: (ctx: SmsVerifyModalContext) => void;
}

const ROLE_DESCRIPTIONS: Record<ErpRole, string> = {
  'Super Admin': 'System configuration, users, roles, templates, master data and access.',
  'Director / Management': 'Business overview, strategic approvals, margin exceptions and financial visibility.',
  'Sales / Business Development': 'Clients, opportunities, proposals, negotiation and follow-ups.',
  'Estimation / Costing': 'Manpower, materials, equipment, overheads, costing and margin analysis.',
  'HR / Recruitment': 'Salary/manpower inputs, recruitment assumptions, attrition and replacement costs.',
  Operations: 'Site feasibility, deployment planning, mobilization and handover.',
  Legal: 'LOI/agreement templates, legal review, revisions and execution.',
  'Finance / Accounts': 'Billing masters, invoices, receipts, tax configuration and receivables.',
  'Department Manager': 'Department-specific review, assignment and approvals.',
};

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users,
  activeUser,
  onSwitchActiveUser,
  onTriggerSmsVerify,
}) => {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[#14263D]">User Management, RBAC & SMS MFA</h1>
        <p className="text-xs text-slate-600 mt-0.5">
          9-role enterprise access matrix with segregation of duties and mandatory SMS OTP multi-factor verification.
        </p>
      </div>

      {/* Active Session Switcher */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#14263D] text-white">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500">Active ERP Session</div>
            <div className="text-sm font-bold text-[#14263D]">
              {activeUser.name} · {activeUser.role} ({activeUser.department})
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600">Switch Role Context:</span>
          <select
            value={activeUser.id}
            onChange={(e) => onSwitchActiveUser(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-[#14263D]"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-[#14263D]">Authorized ERP Accounts ({users.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F3F6FA] text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Role & Scope</th>
                <th className="px-4 py-3 font-semibold">Mobile</th>
                <th className="px-4 py-3 font-semibold">SMS MFA Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#F3F6FA]/50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#14263D]">{u.name}</div>
                    <div className="text-[11px] text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#14263D]">{u.role}</div>
                    <div className="text-[11px] text-slate-500 max-w-md">{ROLE_DESCRIPTIONS[u.role]}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">{u.mobile}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {u.mfaSmsVerified ? (
                      <span className="inline-flex items-center gap-1 rounded bg-[#E8F5EE] px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" />
                        SMS MFA Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-[#FFF2E5] px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        <ShieldAlert className="h-3 w-3" />
                        MFA Verification Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() =>
                        onTriggerSmsVerify({
                          title: 'Verify User MFA via SMS OTP',
                          subtitle: `Multi-factor verification for ${u.name} (${u.role})`,
                          phone: u.mobile,
                          recipientName: u.name,
                          purpose: 'login_mfa',
                          entityType: 'user',
                          entityId: u.id,
                          entityLabel: `${u.name} · ${u.role}`,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#14263D] hover:bg-slate-50"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-[#2463EB]" />
                      Verify MFA SMS
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
