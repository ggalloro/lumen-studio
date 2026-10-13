import { request, type ItemList } from './client';

const BASE = '/api/rights';

export type LicenseType = 'owned' | 'licensed' | 'ugc';

/** Value of `channels` that covers every renditions preset. */
export const ALL_CHANNELS = 'all';

export interface Rights {
  asset_id: number;
  workspace_id: number;
  license_type: LicenseType;
  licensor: string;
  /** Renditions preset ids, or the single value `"all"`. */
  channels: string[];
  /** `YYYY-MM-DD`. */
  valid_from: string;
  /** `YYYY-MM-DD`, or null for perpetual rights. */
  expires_on: string | null;
  model_release_required: boolean;
  model_release_on_file: boolean;
  notes: string;
  updated_by: number;
  updated_at: string;
}

export type RightsInput = Omit<Rights, 'asset_id' | 'workspace_id' | 'updated_by' | 'updated_at'>;

export interface Clearance {
  asset_id: number;
  channel: string;
  date: string;
  cleared: boolean;
  reasons: string[];
}

export const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  owned: 'Owned',
  licensed: 'Licensed',
  ugc: 'User generated',
};

export const rightsApi = {
  list: (assetId?: number) => request<ItemList<Rights>>(`${BASE}/rights`, { query: { asset_id: assetId } }),
  get: (assetId: number) => request<Rights>(`${BASE}/rights/${assetId}`),
  update: (assetId: number, input: RightsInput) =>
    request<Rights>(`${BASE}/rights/${assetId}`, { method: 'PUT', body: input }),
  /** `date` defaults to today (UTC) on the server. */
  clearance: (assetId: number, channel: string, date?: string) =>
    request<Clearance>(`${BASE}/rights/${assetId}/clearance`, { query: { channel, date } }),
};
