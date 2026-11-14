export const SETTINGS_STORAGE_KEY = 'fm_erp_master_settings_v1';

export interface MasterSettingsState {
  defaultGstPct: number;
  defaultManagementFeePct: number;
  statutoryPfEsicPct: number;
  minMarginThreshold: number;
  otpExpiryMinutes: number;
  maxOtpAttempts: number;
}

export const DEFAULT_MASTER_SETTINGS: MasterSettingsState = {
  defaultGstPct: 18,
  defaultManagementFeePct: 10,
  statutoryPfEsicPct: 21.6,
  minMarginThreshold: 11.0,
  otpExpiryMinutes: 5,
  maxOtpAttempts: 5,
};

function sanitizeSettings(raw: Partial<MasterSettingsState>): MasterSettingsState {
  const num = (val: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(val);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  return {
    defaultGstPct: num(raw.defaultGstPct, DEFAULT_MASTER_SETTINGS.defaultGstPct, 0, 28),
    defaultManagementFeePct: num(
      raw.defaultManagementFeePct,
      DEFAULT_MASTER_SETTINGS.defaultManagementFeePct,
      0,
      50
    ),
    statutoryPfEsicPct: num(
      raw.statutoryPfEsicPct,
      DEFAULT_MASTER_SETTINGS.statutoryPfEsicPct,
      0,
      50
    ),
    minMarginThreshold: num(
      raw.minMarginThreshold,
      DEFAULT_MASTER_SETTINGS.minMarginThreshold,
      0,
      50
    ),
    otpExpiryMinutes: Math.round(
      num(raw.otpExpiryMinutes, DEFAULT_MASTER_SETTINGS.otpExpiryMinutes, 1, 30)
    ),
    maxOtpAttempts: Math.round(
      num(raw.maxOtpAttempts, DEFAULT_MASTER_SETTINGS.maxOtpAttempts, 1, 10)
    ),
  };
}

export function loadMasterSettings(): MasterSettingsState {
  try {
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_STORAGE_KEY) : null;
    if (raw) {
      return sanitizeSettings(JSON.parse(raw) as Partial<MasterSettingsState>);
    }
  } catch {
    // Ignore storage read error
  }
  return { ...DEFAULT_MASTER_SETTINGS };
}

export function saveMasterSettings(next: MasterSettingsState): MasterSettingsState {
  const sanitized = sanitizeSettings(next);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
    }
  } catch {
    // Ignore storage quota error
  }
  return sanitized;
}

export function resetMasterSettings(): MasterSettingsState {
  return saveMasterSettings({ ...DEFAULT_MASTER_SETTINGS });
}
