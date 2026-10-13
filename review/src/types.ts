export const REVIEW_STATUSES = ['in_review', 'changes_requested', 'approved'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const DECISIONS = ['approve', 'request_changes'] as const;
export type DecisionValue = (typeof DECISIONS)[number];

export const ROLES = ['designer', 'reviewer', 'brand_admin'] as const;
export type Role = (typeof ROLES)[number];

export interface Annotation {
  id: number;
  review_id: number;
  number: number;
  author_id: number;
  author_name: string;
  x_pct: number;
  y_pct: number;
  body: string;
  created_at: string;
}

export interface Decision {
  id: number;
  review_id: number;
  reviewer_id: number;
  reviewer_name: string;
  decision: DecisionValue;
  note: string;
  created_at: string;
}

export interface Review {
  id: number;
  workspace_id: number;
  asset_id: number;
  version: number;
  asset_owner_id: number;
  status: ReviewStatus;
  created_by: number;
  created_at: string;
  updated_at: string;
  annotations: Annotation[];
  decisions: Decision[];
}

/** Caller identity resolved from a JWT. */
export interface UserPrincipal {
  kind: 'user';
  user_id: number;
  workspace_id: number;
  role: Role;
  name: string;
}

/** A trusted service calling with the internal token. */
export interface InternalPrincipal {
  kind: 'internal';
}

export type Principal = UserPrincipal | InternalPrincipal;
