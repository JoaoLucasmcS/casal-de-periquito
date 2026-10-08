export type Slug = "joao" | "carol";

export interface ProfileCard {
  slug: Slug;
  display_name: string;
  avatar_version: number | null;
}

export interface Partner extends ProfileCard {
  whatsapp: string | null;
}

export interface Me extends ProfileCard {
  whatsapp: string | null;
  partner: Partner;
}

export interface Permissions {
  approve: boolean;
  reject: boolean;
  suggest: boolean;
  edit: boolean;
  cancel: boolean;
}

export type EventKind = "shared" | "personal";
export type EventStatus = "pending" | "confirmed" | "rejected" | "cancelled";

export interface CalEvent {
  id: number;
  kind: EventKind;
  owner: Slug;
  proposed_by: Slug | null;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  status: EventStatus;
  expired: boolean;
  rejection_comment: string | null;
  decided_at: string | null;
  updated_at: string;
  can: Permissions;
}

export interface PendingLists {
  waiting_me: CalEvent[];
  sent_by_me: CalEvent[];
}

export interface ResetRequest {
  id: number;
  created_at: string;
  code_generated: boolean;
  requester: ProfileCard;
}

export interface EventInput {
  kind?: EventKind;
  title?: string;
  starts_at?: string;
  ends_at?: string;
  all_day?: boolean;
  location?: string | null;
  notes?: string | null;
}
