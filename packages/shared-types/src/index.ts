// Hand-maintained until `pnpm gen:types` runs against an installed Python
// API venv. These types mirror apps/api/app/models.py and are the source
// of truth for the web app.

export type EvidenceClass =
  | "protocol_exploit"
  | "operational_compromise"
  | "market_event"
  | "regulatory"
  | "governance"
  | "disclosure"
  | "other";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type EventStatus = "unverified" | "corroborated" | "confirmed" | "retracted";

export type ProfileRole = "user" | "admin";

export type NotificationKind =
  | "watched_company_event"
  | "sector_signal"
  | "system";

export type CompanyEventRole =
  | "victim"
  | "attacker"
  | "vendor"
  | "oracle"
  | "related";

export interface Profile {
  id: string;
  role: ProfileRole;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Sector {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface Subsector {
  id: string;
  sector_id: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface Company {
  id: string;
  subsector_id: string | null;
  slug: string;
  name: string;
  website: string | null;
  chains: string[];
  tags: string[];
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EventSource {
  id: string;
  event_id: string;
  url: string;
  source_type: string;
  captured_at: string;
  snapshot_path: string | null;
  meta: Record<string, unknown>;
}

export interface EventCompanyRef {
  company_id: string;
  role: CompanyEventRole;
}

export interface Event {
  id: string;
  title: string;
  summary: string;
  evidence_class: EvidenceClass;
  severity: Severity;
  status: EventStatus;
  occurred_at: string | null;
  detected_at: string;
  primary_company_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EventWithRelations extends Event {
  sources: EventSource[];
  companies: EventCompanyRef[];
}

export interface WatchlistEntry {
  user_id: string;
  company_id: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  event_id: string | null;
  sector_signal_id: string | null;
  kind: NotificationKind;
  read_at: string | null;
  created_at: string;
}

export interface SectorSignal {
  id: string;
  subsector_id: string;
  window_start: string;
  window_end: string;
  severity: Severity;
  rationale: string;
  event_count: number;
  created_at: string;
}

export interface AgentRun {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  found_count: number;
  cost_cents: number;
  log_path: string | null;
  meta: Record<string, unknown>;
}

export interface ThreatCell {
  subsector_id: string;
  evidence_class: EvidenceClass;
  event_count: number;
  unique_companies: number;
  severity_sum: number;
  recency_sum: number;
  score: number;
}

export interface ThreatMatrix {
  cells: ThreatCell[];
  subsectors: Subsector[];
  evidence_classes: EvidenceClass[];
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}
