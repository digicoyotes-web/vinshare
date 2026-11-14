import type nodemailer from 'nodemailer';

export interface SmtpConnectionConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass?: string;
  timeoutMs?: number;
}

export interface SmtpHandshakeCheckResult {
  ok: boolean;
  host: string;
  port: number;
  secure: boolean;
  latencyMs: number;
  message: string;
  smtpErrorCode?: string;
  smtpResponseCode?: number;
  smtpCommand?: string;
  smtpRawResponse?: string;
  actionHint?: string;
  debuggingClues: string[];
  handshakeTrace: string[];
  logEntryId?: string;
}

export interface SmtpCheckDeps {
  createTransporter?: typeof nodemailer.createTransport;
  fetchImpl?: typeof fetch;
}

interface NodemailerErrorLike {
  message?: string;
  code?: string;
  errno?: string | number;
  syscall?: string;
  command?: string;
  responseCode?: number;
  response?: string;
}

function isValidHost(host: string): boolean {
  const h = (host || '').trim().toLowerCase();
  if (!h || h.length < 3 || h.length > 253) return false;
  if (/^\d+$/.test(h)) return false;
  if (h.startsWith('my_') || h.includes('your-smtp') || h === 'example.com') return false;
  return h === 'localhost' || h.includes('.');
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function normalizeSmtpPass(host: string, pass: string): string {
  const trimmed = (pass || '').trim();
  if (!trimmed) return '';
  if (
    host.toLowerCase().includes('gmail') &&
    /^[a-z0-9]{4}(\s+[a-z0-9]{4}){3}$/i.test(trimmed)
  ) {
    return trimmed.replace(/\s+/g, '');
  }
  return trimmed;
}

export function buildSmtpDebuggingClues(params: {
  host: string;
  port: number;
  secure: boolean;
  errorCode?: string;
  responseCode?: number;
  command?: string;
  rawResponse?: string;
}): { message: string; actionHint: string; debuggingClues: string[] } {
  const { host, port, secure, errorCode, responseCode, command, rawResponse = '' } = params;
  const lowerHost = host.toLowerCase();
  const lowerRaw = rawResponse.toLowerCase();
  const clues: string[] = [];

  if (
    responseCode === 535 ||
    errorCode === 'EAUTH' ||
    lowerRaw.includes('535-5.7.8') ||
    lowerRaw.includes('username and password not accepted') ||
    lowerRaw.includes('authentication failed')
  ) {
    const message = lowerHost.includes('gmail')
      ? 'Authentication failed (EAUTH / SMTP 535): Gmail rejected the username or password.'
      : `Authentication failed (${errorCode || 'EAUTH'}${responseCode ? ` / SMTP ${responseCode}` : ''}): ${host} rejected your SMTP credentials.`;

    const actionHint = lowerHost.includes('gmail')
      ? 'Enable 2-Step Verification on your Google Account and generate a 16-character App Password at myaccount.google.com/apppasswords (regular Gmail login passwords are blocked).'
      : lowerHost.includes('office365') || lowerHost.includes('outlook')
        ? 'Confirm Authenticated SMTP (SMTP AUTH) is enabled for this mailbox in Microsoft 365 Admin and use an App Password if MFA is enabled.'
        : `Verify that SMTP Username is the full mailbox email and the SMTP Password / App Password for ${host} is active.`;

    clues.push(`Failure Stage: ${command || 'AUTH'} (${errorCode || 'EAUTH'}${responseCode ? `, SMTP ${responseCode}` : ''})`);
    if (lowerHost.includes('gmail')) {
      clues.push('Gmail requires a 16-character Google App Password when 2-Step Verification is enabled.');
      clues.push('Confirm SMTP Username matches the exact Gmail / Google Workspace address that generated the App Password.');
    } else {
      clues.push('Check for extra leading/trailing spaces or expired API/App passwords.');
      clues.push('Ensure the From Email / Username matches an authorized mailbox on this relay.');
    }
    return { message, actionHint, debuggingClues: clues };
  }

  if (responseCode === 534 || responseCode === 530 || lowerRaw.includes('must issue a starttls')) {
    const message = `Encryption required by ${host}:${port} (SMTP ${responseCode || 530}).`;
    const actionHint =
      port === 465
        ? 'Port 465 requires SSL/TLS encryption mode.'
        : 'Port 587 requires STARTTLS (secure: false) and TLS upgrade support.';
    clues.push(`Failure Stage: ${command || 'STARTTLS'} (SMTP ${responseCode || 530})`);
    clues.push('Switch Encryption to STARTTLS on port 587, or SSL/TLS on port 465.');
    return { message, actionHint, debuggingClues: clues };
  }

  if (errorCode === 'ETIMEDOUT' || lowerRaw.includes('timed out') || lowerRaw.includes('timeout')) {
    const message = `Connection timed out (ETIMEDOUT) while reaching ${host}:${port}.`;
    const actionHint = `Verify outbound TCP port ${port} is open and not blocked by firewall/proxy, or switch between Port 587 (STARTTLS) and Port 465 (SSL/TLS).`;
    clues.push(`Target ${host}:${port} (${secure ? 'SSL/TLS' : 'STARTTLS'}) did not respond before the handshake timeout.`);
    clues.push('Port 25 is often blocked in cloud containers; prefer Port 587 (STARTTLS) or Port 465 (SSL/TLS).');
    clues.push('Check if the SMTP hostname is spelled accurately and reachable from the server network.');
    return { message, actionHint, debuggingClues: clues };
  }

  if (errorCode === 'ECONNREFUSED') {
    const message = `Connection refused (ECONNREFUSED) by ${host}:${port}.`;
    const actionHint = `${host} is not accepting SMTP connections on port ${port}. Try Port 587 (STARTTLS) or Port 465 (SSL/TLS).`;
    clues.push(`TCP handshake to ${host}:${port} was actively rejected.`);
    clues.push('Confirm the port matches the provider setting (587 for STARTTLS, 465 for SSL/TLS).');
    return { message, actionHint, debuggingClues: clues };
  }

  if (
    errorCode === 'ENOTFOUND' ||
    errorCode === 'EDNS' ||
    errorCode === 'EAI_AGAIN' ||
    lowerRaw.includes('enotfound')
  ) {
    const message = `DNS resolution failed (${errorCode || 'ENOTFOUND'}) for SMTP host "${host}".`;
    const actionHint = `Check the SMTP Host spelling (e.g. smtp.gmail.com, smtp.office365.com, smtp.zoho.in).`;
    clues.push(`Server could not resolve hostname "${host}" via DNS.`);
    clues.push('Verify there are no typos, spaces, or protocols (https://) in the SMTP Host field.');
    return { message, actionHint, debuggingClues: clues };
  }

  if (
    errorCode === 'ESOCKET' ||
    lowerRaw.includes('wrong version number') ||
    lowerRaw.includes('ssl routines') ||
    lowerRaw.includes('certificate')
  ) {
    const message = `TLS/SSL socket error (${errorCode || 'ESOCKET'}) connecting to ${host}:${port}.`;
    const actionHint = `TLS mode mismatch on ${host}:${port}. Use STARTTLS (secure=false) for Port 587, or SSL/TLS (secure=true) for Port 465.`;
    clues.push(`Current setting: Port ${port} with ${secure ? 'SSL/TLS (secure=true)' : 'STARTTLS (secure=false)'}.`);
    clues.push('Setting secure=true on port 587 triggers "wrong version number" TLS errors.');
    return { message, actionHint, debuggingClues: clues };
  }

  const message = rawResponse
    ? `SMTP verification failed${errorCode ? ` (${errorCode})` : ''}: ${rawResponse}`
    : `SMTP verification failed while handshaking with ${host}:${port}.`;
  const actionHint = `Verify SMTP Host (${host}), Port (${port}), encryption mode, and credentials, then inspect the handshake trace.`;
  clues.push(`Target: ${host}:${port} (${secure ? 'SSL/TLS' : 'STARTTLS'})`);
  if (errorCode || responseCode || command) {
    clues.push(
      `Details: ${[errorCode, responseCode ? `SMTP ${responseCode}` : null, command ? `Cmd ${command}` : null]
        .filter(Boolean)
        .join(' · ')}`
    );
  }
  return { message, actionHint, debuggingClues: clues };
}

async function runNodeVerifyWithNodemailer(
  cfg: SmtpConnectionConfig,
  deps: SmtpCheckDeps
): Promise<SmtpHandshakeCheckResult> {
  const host = (cfg.host || '').trim();
  const port = Number(cfg.port) || 587;
  const secure = typeof cfg.secure === 'boolean' ? cfg.secure : port === 465;
  const user = (cfg.user || '').trim();
  const pass = normalizeSmtpPass(host, cfg.pass || '');
  const timeoutMs = cfg.timeoutMs ?? 15000;
  const startedAt = Date.now();

  if (!isValidHost(host) || !isValidPort(port)) {
    return {
      ok: false,
      host,
      port,
      secure,
      latencyMs: 0,
      message: `Invalid SMTP host ("${host || 'empty'}") or port (${port}).`,
      smtpErrorCode: 'INVALID_HOST',
      smtpCommand: 'PREFLIGHT',
      smtpRawResponse: `Rejected invalid host="${host}" port=${port} before opening socket.`,
      actionHint: 'Enter a valid SMTP Host (e.g. smtp.gmail.com) and Port (587 or 465).',
      debuggingClues: [
        'Host must be a valid domain name (such as smtp.gmail.com) without http:// or spaces.',
        'Port must be an integer between 1 and 65535 (commonly 587 for STARTTLS or 465 for SSL/TLS).',
      ],
      handshakeTrace: [
        `[PREFLIGHT] Validating target host="${host}" port=${port}...`,
        '[ERR] Invalid SMTP host or port.',
      ],
    };
  }

  if (!user || !pass) {
    return {
      ok: false,
      host,
      port,
      secure,
      latencyMs: 0,
      message: 'SMTP Username / Email and Password / App Password are required for nodemailer.verify().',
      smtpErrorCode: 'MISSING_CREDENTIALS',
      smtpCommand: 'PREFLIGHT',
      smtpRawResponse: 'Missing SMTP user or password before calling transporter.verify().',
      actionHint: 'Enter your full SMTP Username/Email and Password (or 16-char Google App Password) before verifying.',
      debuggingClues: [
        !user ? 'SMTP Username / Email is empty.' : 'SMTP Username is provided.',
        !pass ? 'SMTP Password / App Password is empty or not stored on the server yet.' : 'SMTP Password is provided.',
      ],
      handshakeTrace: [
        `[PREFLIGHT] Checking credentials for ${host}:${port}...`,
        '[ERR] Missing SMTP username or password.',
      ],
    };
  }

  let createTransportFn = deps.createTransporter;
  if (!createTransportFn) {
    const pkgName = 'nodemailer';
    const imported = (await import(/* @vite-ignore */ pkgName)) as {
      default?: typeof nodemailer;
    } & Partial<typeof nodemailer>;
    const nm = imported.default ?? imported;
    if (!nm || typeof nm.createTransport !== 'function') {
      throw new Error('Nodemailer createTransport could not be loaded in this runtime.');
    }
    createTransportFn = nm.createTransport.bind(nm);
  }

  const trace: string[] = [];
  let expectAuthSecretLine = false;

  const recordLine = (tnx: string, rawText: string) => {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (trace.length >= 60) break;
      if (tnx === 'client') {
        if (expectAuthSecretLine) {
          trace.push('C: [AUTH CREDENTIALS REDACTED]');
          expectAuthSecretLine = false;
          continue;
        }
        if (/^AUTH\s+/i.test(line)) {
          const parts = line.split(/\s+/);
          const mechanism = parts[1] || 'LOGIN';
          trace.push(
            parts.length > 2
              ? `C: AUTH ${mechanism} [CREDENTIALS REDACTED]`
              : `C: AUTH ${mechanism}`
          );
          if (parts.length <= 2) {
            expectAuthSecretLine = true;
          }
          continue;
        }
        trace.push(`C: ${line}`);
      } else if (tnx === 'server') {
        expectAuthSecretLine = line.startsWith('334');
        trace.push(`S: ${line}`);
      } else {
        trace.push(`[SMTP] ${line}`);
      }
    }
  };

  const formatSimple = (msg?: string, ...args: unknown[]) => {
    if (typeof msg !== 'string') {
      return args.map((a) => String(a ?? '')).join(' ').trim();
    }
    let idx = 0;
    const formatted = msg.replace(/%[sdjOo]/g, () => {
      if (idx >= args.length) return '';
      const val = args[idx++];
      return typeof val === 'string' ? val : JSON.stringify(val);
    });
    const rest = args.slice(idx).map((a) => String(a ?? '')).join(' ');
    return `${formatted} ${rest}`.trim();
  };

  const logger = {
    level: () => undefined,
    trace: () => undefined,
    debug: (data: unknown, message?: string, ...args: unknown[]) => {
      const obj = (data && typeof data === 'object' ? data : {}) as { tnx?: string };
      const text = formatSimple(message, ...args);
      if (text) recordLine(obj.tnx || 'smtp', text);
    },
    info: (data: unknown, message?: string, ...args: unknown[]) => {
      const obj = (data && typeof data === 'object' ? data : {}) as { tnx?: string };
      const text = formatSimple(message, ...args);
      if (text) recordLine(obj.tnx || 'smtp', text);
    },
    warn: (_data: unknown, message?: string, ...args: unknown[]) => {
      const text = formatSimple(message, ...args);
      if (text && trace.length < 60) trace.push(`[WARN] ${text}`);
    },
    error: (_data: unknown, message?: string, ...args: unknown[]) => {
      const text = formatSimple(message, ...args);
      if (text && trace.length < 60) trace.push(`[ERR] ${text}`);
    },
  };

  const transporter = createTransportFn({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: Math.max(timeoutMs, 20000),
    debug: true,
    logger: logger as never,
  });

  try {
    await transporter.verify();
    const latencyMs = Date.now() - startedAt;
    return {
      ok: true,
      host,
      port,
      secure,
      latencyMs,
      message: `Nodemailer verify() succeeded for ${host}:${port} (${latencyMs} ms). Ready to send as ${user}.`,
      debuggingClues: [
        `TCP + ${secure ? 'SSL/TLS' : 'STARTTLS'} handshake and AUTH login verified for ${user}.`,
      ],
      handshakeTrace:
        trace.length > 0
          ? trace
          : [`Connected to ${host}:${port}`, `250 Authentication succeeded (${latencyMs} ms)`],
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const e = (err && typeof err === 'object' ? err : {}) as NodemailerErrorLike;
    const rawMsg = err instanceof Error ? err.message : String(err || 'Unknown SMTP error');
    const smtpErrorCode =
      typeof e.code === 'string' && e.code
        ? e.code
        : rawMsg.match(
            /\b(EAUTH|ECONNECTION|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ESOCKET|EENVELOPE|EMESSAGE|EAI_AGAIN)\b/
          )?.[1];
    const smtpResponseCode =
      typeof e.responseCode === 'number'
        ? e.responseCode
        : Number(rawMsg.match(/\b(4\d{2}|5\d{2})\b/)?.[1]) || undefined;
    const smtpCommand =
      typeof e.command === 'string' && e.command
        ? e.command
        : smtpResponseCode === 535 || smtpErrorCode === 'EAUTH'
          ? 'AUTH'
          : smtpErrorCode === 'ECONNREFUSED' ||
              smtpErrorCode === 'ENOTFOUND' ||
              smtpErrorCode === 'ETIMEDOUT'
            ? 'CONN'
            : undefined;
    const smtpRawResponse =
      typeof e.response === 'string' && e.response.trim() ? e.response.trim() : rawMsg;

    const { message, actionHint, debuggingClues } = buildSmtpDebuggingClues({
      host,
      port,
      secure,
      errorCode: smtpErrorCode,
      responseCode: smtpResponseCode,
      command: smtpCommand,
      rawResponse: smtpRawResponse,
    });

    return {
      ok: false,
      host,
      port,
      secure,
      latencyMs,
      message,
      smtpErrorCode,
      smtpResponseCode,
      smtpCommand,
      smtpRawResponse,
      actionHint,
      debuggingClues,
      handshakeTrace:
        trace.length > 0
          ? trace
          : [`Connecting to ${host}:${port} (${secure ? 'SSL/TLS' : 'STARTTLS'})...`, `[ERR] ${smtpRawResponse}`],
    };
  } finally {
    if (typeof (transporter as { close?: () => void }).close === 'function') {
      try {
        (transporter as { close: () => void }).close();
      } catch {
        // Ignore transporter cleanup errors
      }
    }
  }
}

/**
 * Verifies an SMTP connection via Nodemailer `transporter.verify()` on the server
 * (or delegates to `/api/email/smtp-verify` when invoked from the browser UI) and
 * records detailed handshake errors & debugging clues into the SMTP Activity Log.
 */
export async function checkSmtpConnection(
  config: SmtpConnectionConfig,
  deps: SmtpCheckDeps = {}
): Promise<SmtpHandshakeCheckResult> {
  if (typeof window === 'undefined' || deps.createTransporter) {
    return runNodeVerifyWithNodemailer(config, deps);
  }

  const fetchFn = deps.fetchImpl ?? fetch;
  const host = (config.host || '').trim();
  const port = Number(config.port) || 587;
  const secure = typeof config.secure === 'boolean' ? config.secure : port === 465;

  let res: Response;
  try {
    res = await fetchFn('/api/email/smtp-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host,
        port,
        secure,
        user: (config.user || '').trim(),
        pass: config.pass || undefined,
      }),
    });
  } catch (networkErr) {
    const errMsg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    return {
      ok: false,
      host,
      port,
      secure,
      latencyMs: 0,
      message: `Unable to reach the backend SMTP verification service (${errMsg}).`,
      smtpErrorCode: 'NETWORK_ERROR',
      smtpCommand: 'HTTP_RPC',
      smtpRawResponse: errMsg,
      actionHint: 'Confirm the Node.js ERP server is running on port 3000 and retry.',
      debuggingClues: [
        'Browser request to /api/email/smtp-verify failed before receiving an HTTP response.',
        `Network detail: ${errMsg}`,
      ],
      handshakeTrace: [`POST /api/email/smtp-verify -> Network Error: ${errMsg}`],
    };
  }

  const rawText = await res.text();
  let parsed: Partial<SmtpHandshakeCheckResult> & { error?: string } = {};
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    const snippet = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
    return {
      ok: false,
      host,
      port,
      secure,
      latencyMs: 0,
      message: `SMTP verify endpoint returned HTTP ${res.status} (${res.statusText || 'non-JSON response'}).`,
      smtpErrorCode: `HTTP_${res.status}`,
      smtpCommand: 'HTTP_RPC',
      smtpRawResponse: snippet || `HTTP ${res.status} ${res.statusText}`,
      actionHint:
        res.status >= 500
          ? 'The server encountered a gateway or restart error while checking SMTP. Retry in a few seconds and inspect server logs.'
          : 'Check that /api/email/smtp-verify is reachable and returning JSON.',
      debuggingClues: [
        `HTTP Status: ${res.status} ${res.statusText}`.trim(),
        snippet ? `Response body preview: ${snippet}` : 'Server returned an empty or HTML error body.',
      ],
      handshakeTrace: [`POST /api/email/smtp-verify -> HTTP ${res.status}`, snippet || '(empty body)'],
    };
  }

  return {
    ok: Boolean(parsed.ok && res.ok),
    host: parsed.host || host,
    port: parsed.port || port,
    secure: typeof parsed.secure === 'boolean' ? parsed.secure : secure,
    latencyMs: Number(parsed.latencyMs) || 0,
    message:
      parsed.message ||
      parsed.error ||
      (res.ok ? 'SMTP connection verified.' : `SMTP verification failed (HTTP ${res.status}).`),
    smtpErrorCode: parsed.smtpErrorCode || (!res.ok ? parsed.error : undefined),
    smtpResponseCode: parsed.smtpResponseCode,
    smtpCommand: parsed.smtpCommand,
    smtpRawResponse: parsed.smtpRawResponse,
    actionHint: parsed.actionHint,
    debuggingClues: Array.isArray(parsed.debuggingClues) ? parsed.debuggingClues : [],
    handshakeTrace: Array.isArray(parsed.handshakeTrace) ? parsed.handshakeTrace : [],
    logEntryId: parsed.logEntryId,
  };
}
