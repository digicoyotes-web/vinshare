import { useSyncExternalStore } from 'react';

export interface SmtpFailureNotification {
  id: string;
  dedupeKey: string;
  timestamp: string;
  eventType: 'Send Email' | 'SMTP Verify' | 'Connection Test';
  to?: string;
  subject?: string;
  smtpHost?: string;
  smtpPort?: number;
  failureCategory: string;
  plainEnglishTitle: string;
  plainEnglishExplanation: string;
  actionHint?: string;
  debuggingClues?: string[];
  suggestedFix?: {
    label: string;
    port: number;
    secure: boolean;
  };
  smtpErrorCode?: string;
  smtpResponseCode?: number;
  logEntryId?: string;
  read: boolean;
  dismissedFromToast: boolean;
}

const MAX_NOTIFICATIONS = 25;
let notifications: SmtpFailureNotification[] = [];
const listeners = new Set<() => void>();
const recentDedupeTimestamps = new Map<string, number>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function publishSmtpFailureNotification(
  input: Omit<SmtpFailureNotification, 'id' | 'dedupeKey' | 'timestamp' | 'read' | 'dismissedFromToast'> & {
    id?: string;
    timestamp?: string;
    dedupeKey?: string;
  }
): SmtpFailureNotification | null {
  const now = Date.now();
  const dedupeKey =
    input.logEntryId ||
    input.dedupeKey ||
    `${input.eventType}:${input.to || ''}:${input.subject || ''}:${input.smtpErrorCode || input.plainEnglishTitle}`;

  const lastSeen = recentDedupeTimestamps.get(dedupeKey);
  if (lastSeen && now - lastSeen < 8000) {
    return null;
  }
  recentDedupeTimestamps.set(dedupeKey, now);

  // Prune old dedupe entries periodically
  if (recentDedupeTimestamps.size > 100) {
    for (const [key, ts] of recentDedupeTimestamps.entries()) {
      if (now - ts > 30000) {
        recentDedupeTimestamps.delete(key);
      }
    }
  }

  const item: SmtpFailureNotification = {
    id: input.id || `NOTIF-${now.toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    dedupeKey,
    timestamp: input.timestamp || new Date().toISOString(),
    eventType: input.eventType,
    to: input.to,
    subject: input.subject,
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    failureCategory: input.failureCategory,
    plainEnglishTitle: input.plainEnglishTitle,
    plainEnglishExplanation: input.plainEnglishExplanation,
    actionHint: input.actionHint,
    debuggingClues: input.debuggingClues,
    suggestedFix: input.suggestedFix,
    smtpErrorCode: input.smtpErrorCode,
    smtpResponseCode: input.smtpResponseCode,
    logEntryId: input.logEntryId,
    read: false,
    dismissedFromToast: false,
  };

  notifications = [item, ...notifications.filter((n) => n.dedupeKey !== dedupeKey)].slice(
    0,
    MAX_NOTIFICATIONS
  );
  emitChange();
  return item;
}

export function dismissSmtpToast(id: string): void {
  let changed = false;
  notifications = notifications.map((item) => {
    if (item.id === id && !item.dismissedFromToast) {
      changed = true;
      return { ...item, dismissedFromToast: true };
    }
    return item;
  });
  if (changed) emitChange();
}

export function markSmtpNotificationRead(id: string): void {
  let changed = false;
  notifications = notifications.map((item) => {
    if (item.id === id && (!item.read || !item.dismissedFromToast)) {
      changed = true;
      return { ...item, read: true, dismissedFromToast: true };
    }
    return item;
  });
  if (changed) emitChange();
}

export function markAllSmtpNotificationsRead(): void {
  let changed = false;
  notifications = notifications.map((item) => {
    if (!item.read) {
      changed = true;
      return { ...item, read: true };
    }
    return item;
  });
  if (changed) emitChange();
}

export function clearAllSmtpToasts(): void {
  let changed = false;
  notifications = notifications.map((item) => {
    if (!item.dismissedFromToast) {
      changed = true;
      return { ...item, dismissedFromToast: true };
    }
    return item;
  });
  if (changed) emitChange();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SmtpFailureNotification[] {
  return notifications;
}

export function useSmtpNotifications() {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const activeToasts = all.filter((n) => !n.dismissedFromToast).slice(0, 3);
  const unreadCount = all.filter((n) => !n.read).length;
  return {
    notifications: all,
    activeToasts,
    unreadCount,
  };
}

export function startSmtpEventStream(): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => undefined;
  }

  const source = new EventSource('/api/email/smtp-events');

  const handleFailureEvent = (ev: MessageEvent) => {
    try {
      const data = JSON.parse(ev.data) as Partial<SmtpFailureNotification> & {
        id?: string;
        errorMessage?: string;
      };
      // Real-time toast stream focuses on failed outbound email dispatches
      if (data.eventType !== 'Send Email') {
        return;
      }
      publishSmtpFailureNotification({
        id: data.id ? `SSE-${data.id}` : undefined,
        logEntryId: data.logEntryId || data.id,
        timestamp: data.timestamp,
        eventType: 'Send Email',
        to: data.to,
        subject: data.subject,
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        failureCategory: data.failureCategory || 'Handshake Failed',
        plainEnglishTitle: data.plainEnglishTitle || 'Email Dispatch Failed',
        plainEnglishExplanation:
          data.plainEnglishExplanation ||
          data.errorMessage ||
          'SMTP mail dispatch failed. Open the SMTP Diagnostic Tool to inspect the connection.',
        actionHint: data.actionHint,
        debuggingClues: data.debuggingClues,
        suggestedFix: data.suggestedFix,
        smtpErrorCode: data.smtpErrorCode,
        smtpResponseCode: data.smtpResponseCode,
      });
    } catch {
      // Ignore malformed SSE payload
    }
  };

  source.addEventListener('smtp_failure', handleFailureEvent as EventListener);

  return () => {
    source.removeEventListener('smtp_failure', handleFailureEvent as EventListener);
    source.close();
  };
}
