import { request, type ItemList } from './client';
import type { ReviewStatus } from './review';
import type { CheckStatus } from './brand';

const BASE = '/api/campaigns';

export interface Deliverable {
  id: number;
  campaign_id: number;
  asset_id: number;
  /** A renditions preset id. */
  channel: string;
  created_at: string;
}

export interface Campaign {
  id: number;
  workspace_id: number;
  name: string;
  brief: string;
  due_date: string;
  status: 'draft' | 'published';
  created_by: number;
  created_at: string;
  published_at: string | null;
  deliverables: Deliverable[];
  manifest?: Manifest;
}

export interface DeliverableReadiness {
  deliverable_id: number;
  asset_id: number;
  asset_title: string;
  channel: string;
  review_status: ReviewStatus | 'none';
  approved_version: number | null;
  brand_status: CheckStatus | 'none';
  rendition_url: string | null;
  rights_cleared: boolean;
  ready: boolean;
  blockers: string[];
}

export interface Readiness {
  campaign_id: number;
  ready: boolean;
  total: number;
  ready_count: number;
  deliverables: DeliverableReadiness[];
}

export interface ManifestItem {
  asset_id: number;
  asset_title: string;
  version: number;
  channel: string;
  rendition_url: string;
  width: number;
  height: number;
}

export interface Manifest {
  campaign_id: number;
  name: string;
  published_at: string;
  items: ManifestItem[];
}

export interface NewCampaign {
  name: string;
  brief: string;
  due_date: string;
}

/** Body of a 409 from POST /campaigns/{id}/publish. */
export interface PublishConflict {
  error: string;
  readiness: Readiness;
}

export function isPublishConflict(body: unknown): body is PublishConflict {
  return !!body && typeof body === 'object' && 'readiness' in body;
}

export const campaignsApi = {
  list: () => request<ItemList<Campaign>>(`${BASE}/campaigns`),
  create: (input: NewCampaign) => request<Campaign>(`${BASE}/campaigns`, { method: 'POST', body: input }),
  get: (id: number) => request<Campaign>(`${BASE}/campaigns/${id}`),
  addDeliverable: (id: number, assetId: number, channel: string) =>
    request<Deliverable>(`${BASE}/campaigns/${id}/deliverables`, {
      method: 'POST',
      body: { asset_id: assetId, channel },
    }),
  removeDeliverable: (id: number, deliverableId: number) =>
    request<void>(`${BASE}/campaigns/${id}/deliverables/${deliverableId}`, { method: 'DELETE' }),
  readiness: (id: number) => request<Readiness>(`${BASE}/campaigns/${id}/readiness`),
  publish: (id: number) => request<Campaign>(`${BASE}/campaigns/${id}/publish`, { method: 'POST' }),
  manifest: (id: number) => request<Manifest>(`${BASE}/campaigns/${id}/manifest`),
};
