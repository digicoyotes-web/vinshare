import type {
  AgreementRecord,
  AttritionRecord,
  ClientRecord,
  DocumentVersionSnapshot,
  InvoiceRecord,
  LoiRecord,
  OpportunityRecord,
  PaymentRecord,
  ProjectEmailRecord,
  ProjectRecord,
  ProposalRecord,
} from '../types/erp';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured =
  Boolean(SUPABASE_URL) &&
  Boolean(SUPABASE_ANON_KEY) &&
  !SUPABASE_URL.includes('YOUR_PROJECT_REF') &&
  !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY');

export type ErpTableName =
  | 'clients'
  | 'opportunities'
  | 'proposals'
  | 'attrition_records'
  | 'lois'
  | 'agreements'
  | 'projects'
  | 'invoices'
  | 'payments'
  | 'project_emails'
  | 'doc_snapshots';

export interface SupabaseRowEnvelope<T> {
  id: string;
  reference?: string | null;
  client_id?: string | null;
  status?: string | null;
  payload: T;
  updated_at?: string;
}

export interface SupabaseResponse<T> {
  data: T | null;
  error: string | null;
}

class SupabaseTableQuery {
  constructor(
    private readonly baseUrl: string,
    private readonly anonKey: string,
    private readonly table: ErpTableName
  ) {}

  private buildHeaders(extra?: Record<string, string>): HeadersInit {
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${this.anonKey}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async select<T = unknown>(columns = '*', orderBy = 'updated_at.desc'): Promise<SupabaseResponse<T[]>> {
    if (!isSupabaseConfigured) {
      return { data: null, error: 'Supabase not configured' };
    }
    try {
      const url = `${this.baseUrl}/rest/v1/${this.table}?select=${encodeURIComponent(columns)}&order=${encodeURIComponent(orderBy)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });
      if (!res.ok) {
        return { data: null, error: `HTTP ${res.status}: ${await res.text()}` };
      }
      const data = (await res.json()) as T[];
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Supabase select failed' };
    }
  }

  async upsert<T extends Record<string, unknown>>(
    rows: T | T[],
    onConflict = 'id'
  ): Promise<SupabaseResponse<T[]>> {
    if (!isSupabaseConfigured) {
      return { data: null, error: 'Supabase not configured' };
    }
    const list = Array.isArray(rows) ? rows : [rows];
    if (list.length === 0) return { data: [], error: null };
    try {
      const url = `${this.baseUrl}/rest/v1/${this.table}?on_conflict=${encodeURIComponent(onConflict)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders({
          Prefer: 'resolution=merge-duplicates,return=representation',
        }),
        body: JSON.stringify(list),
      });
      if (!res.ok) {
        return { data: null, error: `HTTP ${res.status}: ${await res.text()}` };
      }
      const data = (await res.json()) as T[];
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Supabase upsert failed' };
    }
  }

  async updateById<T extends Record<string, unknown>>(
    id: string,
    patch: Partial<T>
  ): Promise<SupabaseResponse<T[]>> {
    if (!isSupabaseConfigured) {
      return { data: null, error: 'Supabase not configured' };
    }
    try {
      const url = `${this.baseUrl}/rest/v1/${this.table}?id=eq.${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: this.buildHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        return { data: null, error: `HTTP ${res.status}: ${await res.text()}` };
      }
      const data = (await res.json()) as T[];
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Supabase update failed' };
    }
  }

  async deleteById(id: string): Promise<SupabaseResponse<null>> {
    if (!isSupabaseConfigured) {
      return { data: null, error: 'Supabase not configured' };
    }
    try {
      const url = `${this.baseUrl}/rest/v1/${this.table}?id=eq.${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: this.buildHeaders(),
      });
      if (!res.ok) {
        return { data: null, error: `HTTP ${res.status}: ${await res.text()}` };
      }
      return { data: null, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Supabase delete failed' };
    }
  }
}

export const supabase = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  isConfigured: isSupabaseConfigured,
  from(table: ErpTableName) {
    return new SupabaseTableQuery(SUPABASE_URL, SUPABASE_ANON_KEY, table);
  },
};

function extractEnvelopeMeta<T extends { id: string }>(
  table: ErpTableName,
  record: T
): SupabaseRowEnvelope<T> {
  const anyRec = record as unknown as Record<string, unknown>;
  let reference: string | null = null;
  let clientId: string | null = null;
  let status: string | null = null;

  if (typeof anyRec.reference === 'string') reference = anyRec.reference;
  else if (typeof anyRec.invoiceNumber === 'string') reference = anyRec.invoiceNumber;
  else if (typeof anyRec.code === 'string') reference = anyRec.code;
  else if (typeof anyRec.companyName === 'string') reference = anyRec.companyName;

  if (typeof anyRec.clientId === 'string') clientId = anyRec.clientId;
  else if (table === 'clients') clientId = record.id;

  if (typeof anyRec.status === 'string') status = anyRec.status;
  else if (typeof anyRec.closingStatus === 'string') status = anyRec.closingStatus;

  return {
    id: record.id,
    reference,
    client_id: clientId,
    status,
    payload: record,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchErpTable<T extends { id: string }>(
  table: ErpTableName
): Promise<T[] | null> {
  if (!isSupabaseConfigured) return null;
  const res = await supabase.from(table).select<SupabaseRowEnvelope<T>>('*');
  if (res.error || !res.data) return null;
  return res.data.map((row) => row.payload);
}

export async function upsertErpRecord<T extends { id: string }>(
  table: ErpTableName,
  record: T
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const envelope = extractEnvelopeMeta(table, record);
  const res = await supabase.from(table).upsert(envelope as unknown as Record<string, unknown>);
  return !res.error;
}

export async function upsertErpRecords<T extends { id: string }>(
  table: ErpTableName,
  records: T[]
): Promise<boolean> {
  if (!isSupabaseConfigured || records.length === 0) return false;
  const envelopes = records.map((r) =>
    extractEnvelopeMeta(table, r) as unknown as Record<string, unknown>
  );
  const res = await supabase.from(table).upsert(envelopes);
  return !res.error;
}

export async function deleteErpRecord(table: ErpTableName, id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const res = await supabase.from(table).deleteById(id);
  return !res.error;
}

export interface ErpDatasetSnapshot {
  clients: ClientRecord[];
  opportunities: OpportunityRecord[];
  proposals: ProposalRecord[];
  attritionRecords: AttritionRecord[];
  lois: LoiRecord[];
  agreements: AgreementRecord[];
  projects: ProjectRecord[];
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
  projectEmails: ProjectEmailRecord[];
  docSnapshots: DocumentVersionSnapshot[];
}

export async function syncOrSeedSupabaseDataset(
  defaults: ErpDatasetSnapshot
): Promise<Partial<ErpDatasetSnapshot> | null> {
  if (!isSupabaseConfigured) return null;

  const tablePairs: Array<[ErpTableName, Array<{ id: string }>]> = [
    ['clients', defaults.clients],
    ['opportunities', defaults.opportunities],
    ['proposals', defaults.proposals],
    ['attrition_records', defaults.attritionRecords],
    ['lois', defaults.lois],
    ['agreements', defaults.agreements],
    ['projects', defaults.projects],
    ['invoices', defaults.invoices],
    ['payments', defaults.payments],
    ['project_emails', defaults.projectEmails],
    ['doc_snapshots', defaults.docSnapshots],
  ];

  const loaded: Partial<ErpDatasetSnapshot> = {};

  await Promise.all(
    tablePairs.map(async ([table, seedRows]) => {
      const existing = await fetchErpTable<{ id: string }>(table);
      if (existing === null) return;
      if (existing.length === 0 && seedRows.length > 0) {
        await upsertErpRecords(table, seedRows);
        (loaded as Record<string, unknown>)[
          table === 'attrition_records'
            ? 'attritionRecords'
            : table === 'project_emails'
            ? 'projectEmails'
            : table === 'doc_snapshots'
            ? 'docSnapshots'
            : table
        ] = seedRows;
      } else if (existing.length > 0) {
        (loaded as Record<string, unknown>)[
          table === 'attrition_records'
            ? 'attritionRecords'
            : table === 'project_emails'
            ? 'projectEmails'
            : table === 'doc_snapshots'
            ? 'docSnapshots'
            : table
        ] = existing;
      }
    })
  );

  return loaded;
}
