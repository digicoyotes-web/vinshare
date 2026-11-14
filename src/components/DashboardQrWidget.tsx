import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  MapPin,
  QrCode,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { ProjectRecord } from '../types/erp';

interface DashboardQrWidgetProps {
  projects: ProjectRecord[];
  onOpenSitePortal: (projectId: string) => void;
}

export const DashboardQrWidget: React.FC<DashboardQrWidgetProps> = ({
  projects,
  onOpenSitePortal,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || projects[0],
    [projects, selectedProjectId]
  );

  const portalUrl = useMemo(() => {
    if (!selectedProject) return '';
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://vinshar-erp.app';
    return `${origin}/?portal=site&project=${encodeURIComponent(selectedProject.code)}`;
  }, [selectedProject]);

  useEffect(() => {
    let cancelled = false;
    if (!portalUrl) return;
    QRCode.toDataURL(portalUrl, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#14263D',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [portalUrl]);

  if (!selectedProject) return null;

  const completedChecks = selectedProject.checklist.filter((c) => c.completed).length;
  const totalChecks = selectedProject.checklist.length;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API fallback omitted for iframe compatibility
    }
  };

  const handleDownloadQrPng = () => {
    if (!qrDataUrl) return;
    const anchor = document.createElement('a');
    anchor.href = qrDataUrl;
    anchor.download = `${selectedProject.code}-Field-Portal-QR.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        {/* Left: Site Selector & Field Portal Context */}
        <div className="flex-1 space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#2463EB] shrink-0">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[#14263D]">
                  Site Quick-Access Field Portal QR
                </h2>
                <p className="text-xs text-slate-500">
                  Scan on mobile to open site handover checklists, approved headcount, and manager escalation for field supervisors.
                </p>
              </div>
            </div>

            <div className="w-full sm:w-auto">
              <select
                value={selectedProject.id}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                aria-label="Select site for Field Portal QR code"
                className="w-full sm:w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#14263D] focus:border-[#2463EB] focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.clientName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-[#F3F6FA] p-3.5 text-xs">
            <div className="flex items-start gap-2 min-w-0">
              <MapPin className="h-4 w-4 text-[#2463EB] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500">Assigned Site</div>
                <div className="font-semibold text-[#14263D] truncate" title={selectedProject.siteName}>
                  {selectedProject.siteName}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 min-w-0">
              <Users className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500">Ops Manager & Strength</div>
                <div className="font-semibold text-[#14263D] truncate tabular-nums">
                  {selectedProject.opsManager} · {selectedProject.approvedManpower} Staff
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 min-w-0">
              <ShieldCheck className="h-4 w-4 text-indigo-700 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500">Mobilization Status</div>
                <div className="font-semibold text-[#14263D] truncate tabular-nums">
                  {selectedProject.closingStatus} ({completedChecks}/{totalChecks})
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[200px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-[11px] text-slate-600 truncate">
              {portalUrl}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#14263D] hover:bg-slate-50 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Link
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadQrPng}
                disabled={!qrDataUrl}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#14263D] hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Download QR PNG
              </button>
              <button
                type="button"
                onClick={() => onOpenSitePortal(selectedProject.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#2463EB] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Site Portal
              </button>
            </div>
          </div>
        </div>

        {/* Right: Scannable QR Badge */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-[#F3F6FA] p-3.5 shrink-0 self-center lg:self-stretch">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR Code for ${selectedProject.code} site portal`}
              className="h-32 w-32 rounded-lg bg-white p-1.5 border border-slate-200"
            />
          ) : (
            <div className="h-32 w-32 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs text-slate-400">
              Generating QR...
            </div>
          )}
          <div className="mt-2 text-[11px] font-mono font-semibold text-[#14263D] tabular-nums">
            {selectedProject.code}
          </div>
          <div className="text-[10px] text-slate-500">Scan for Field Access</div>
        </div>
      </div>
    </div>
  );
};
