import React, { useState } from 'react';
import { CheckCircle2, CopyPlus, History, Plus, X } from 'lucide-react';
import type { DocumentVersionSnapshot, ProposalVersion } from '../types/erp';
import { formatInrFull } from '../utils/formatters';

interface VersionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  mode: 'proposal' | 'snapshot';
  proposalVersions?: ProposalVersion[];
  activeProposalVersion?: string;
  onSelectProposalVersion?: (version: string) => void;
  onCreateProposalSnapshot?: (note: string) => void;
  snapshots?: DocumentVersionSnapshot[];
  onCreateSnapshot?: (note: string) => void;
}

export const VersionsModal: React.FC<VersionsModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  mode,
  proposalVersions = [],
  activeProposalVersion,
  onSelectProposalVersion,
  onCreateProposalSnapshot,
  snapshots = [],
  onCreateSnapshot,
}) => {
  const [note, setNote] = useState('');

  if (!isOpen) return null;

  const handleSaveNew = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNote = note.trim() || 'Commercial / operational checkpoint saved';
    if (mode === 'proposal' && onCreateProposalSnapshot) {
      onCreateProposalSnapshot(cleanNote);
    } else if (mode === 'snapshot' && onCreateSnapshot) {
      onCreateSnapshot(cleanNote);
    }
    setNote('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="bg-[#14263D] px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="h-4 w-4 text-sky-300" />
            <div>
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="text-[11px] text-slate-300">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-300 hover:bg-white/10 hover:text-white"
            aria-label="Close version history"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <form onSubmit={handleSaveNew} className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-[#F3F6FA] p-3">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                mode === 'proposal'
                  ? 'Reason for new proposal version (e.g. Client rate card update)...'
                  : 'Revision / checkpoint note (e.g. Updated PO reference)...'
              }
              className="flex-1 min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-[#2463EB] focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              {mode === 'proposal' ? <CopyPlus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {mode === 'proposal' ? 'Save as New Version' : 'Save Revision Snapshot'}
            </button>
          </form>

          {mode === 'proposal' ? (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {proposalVersions
                .slice()
                .reverse()
                .map((ver) => {
                  const isActive = ver.version === activeProposalVersion;
                  return (
                    <div
                      key={ver.version}
                      className={`p-4 flex flex-wrap items-center justify-between gap-3 ${
                        isActive ? 'bg-blue-50/50' : 'bg-white'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#14263D]">{ver.version}</span>
                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                              ver.status === 'Approved'
                                ? 'bg-[#E8F5EE] text-emerald-800'
                                : ver.status === 'Shared with Client'
                                ? 'bg-blue-50 text-[#2463EB]'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {ver.status}
                          </span>
                          {isActive && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2463EB]">
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-700">{ver.reason}</div>
                        <div className="text-[11px] text-slate-500">
                          By {ver.createdBy} · {new Date(ver.createdAt).toLocaleString('en-IN')} · Margin {ver.grossMarginPct}%
                        </div>
                      </div>
                      <div className="text-right space-y-1.5">
                        <div className="font-mono text-xs font-bold text-[#14263D] tabular-nums">
                          {formatInrFull(ver.annualContractValue)} / yr
                        </div>
                        {!isActive && onSelectProposalVersion && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectProposalVersion(ver.version);
                              onClose();
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-[#14263D] hover:bg-slate-50"
                          >
                            Switch to {ver.version}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {snapshots.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No revision snapshots saved yet. Click Save or add a revision note above to capture the first snapshot.
                </div>
              ) : (
                snapshots.map((snap, idx) => (
                  <div key={snap.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#14263D]">{snap.version}</span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {snap.statusLabel}
                        </span>
                        {idx === 0 && (
                          <span className="text-[11px] font-semibold text-[#2463EB]">Latest</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-700">{snap.note}</div>
                      <div className="text-[11px] text-slate-500">
                        Saved by {snap.savedBy} · {new Date(snap.savedAt).toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="font-mono text-xs font-semibold text-[#14263D] tabular-nums">
                      {snap.summaryValue}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
