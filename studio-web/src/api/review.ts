import { getToken, request, type ItemList } from './client';

const BASE = '/api/review';

export type ReviewStatus = 'in_review' | 'changes_requested' | 'approved';
export type DecisionKind = 'approve' | 'request_changes';

export interface Annotation {
  id: number;
  review_id: number;
  number: number;
  author_id: number;
  author_name: string;
  /** 0 to 100, from the left edge of the image. */
  x_pct: number;
  /** 0 to 100, from the top edge of the image. */
  y_pct: number;
  body: string;
  created_at: string;
}

export interface Decision {
  id: number;
  review_id: number;
  reviewer_id: number;
  reviewer_name: string;
  decision: DecisionKind;
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

export interface ReviewQuery {
  asset_id?: number;
  status?: ReviewStatus;
}

export const reviewApi = {
  list: (query: ReviewQuery = {}) =>
    request<ItemList<Review>>(`${BASE}/reviews`, { query: { ...query } }),
  get: (id: number) => request<Review>(`${BASE}/reviews/${id}`),
  create: (assetId: number, version: number) =>
    request<Review>(`${BASE}/reviews`, {
      method: 'POST',
      body: { asset_id: assetId, version },
    }),
  annotate: (id: number, input: { x_pct: number; y_pct: number; body: string }) =>
    request<Annotation>(`${BASE}/reviews/${id}/annotations`, { method: 'POST', body: input }),
  decide: (id: number, decision: DecisionKind, note?: string) =>
    request<Review>(`${BASE}/reviews/${id}/decision`, {
      method: 'POST',
      body: note ? { decision, note } : { decision },
    }),
  submitVersion: (id: number, version: number) =>
    request<Review>(`${BASE}/reviews/${id}/versions`, { method: 'POST', body: { version } }),
  /** EventSource cannot send headers, so the JWT goes in the query string. */
  eventsUrl: (id: number) =>
    `${BASE}/reviews/${id}/events?token=${encodeURIComponent(getToken() ?? '')}`,
};

/** Latest review per asset id, by creation time (ties broken by id). */
export function latestReviewByAsset(reviews: Review[]): Map<number, Review> {
  const latest = new Map<number, Review>();
  for (const review of reviews) {
    const current = latest.get(review.asset_id);
    if (
      !current ||
      review.created_at > current.created_at ||
      (review.created_at === current.created_at && review.id > current.id)
    ) {
      latest.set(review.asset_id, review);
    }
  }
  return latest;
}
