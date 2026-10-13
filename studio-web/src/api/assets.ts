import { request, type ItemList } from './client';

const BASE = '/api/assets';

export interface Rendition {
  preset: string;
  width: number;
  height: number;
  sha256: string;
  blob_url: string;
  created_at: string;
}

export interface Version {
  asset_id: number;
  version: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  width: number;
  height: number;
  sha256: string;
  blob_url: string;
  alt_text: string;
  created_by: number;
  created_at: string;
  renditions: Rendition[];
}

export interface Asset {
  id: number;
  workspace_id: number;
  title: string;
  description: string;
  owner_id: number;
  tags: string[];
  created_at: string;
  updated_at: string;
  latest_version: Version;
  /** Ascending by version. Only present on GET /assets/{id} and on create. */
  versions?: Version[];
}

export interface AssetQuery {
  q?: string;
  tag?: string;
  owner_id?: number;
}

export interface NewAsset {
  file: File;
  title: string;
  description?: string;
  tags?: string[];
  alt_text?: string;
}

/**
 * Blob URLs from the assets service are relative to that service
 * (`/blobs/<sha>`). The browser reaches them through the proxy prefix.
 */
export function blobSrc(blobUrl: string, download = false): string {
  const path = blobUrl.startsWith('/api/assets/') ? blobUrl : `${BASE}${blobUrl}`;
  return download ? `${path}?download=1` : path;
}

export function findRendition(version: Version | undefined, preset: string): Rendition | undefined {
  return version?.renditions?.find((r) => r.preset === preset);
}

export const assetsApi = {
  list: (query: AssetQuery = {}) =>
    request<ItemList<Asset>>(`${BASE}/assets`, { query: { ...query } }),
  get: (id: number) => request<Asset>(`${BASE}/assets/${id}`),
  create: (input: NewAsset) => {
    const form = new FormData();
    form.set('file', input.file);
    form.set('title', input.title);
    if (input.description) form.set('description', input.description);
    if (input.tags?.length) form.set('tags', input.tags.join(','));
    if (input.alt_text) form.set('alt_text', input.alt_text);
    return request<Asset>(`${BASE}/assets`, { method: 'POST', body: form });
  },
  addVersion: (assetId: number, file: File, altText?: string) => {
    const form = new FormData();
    form.set('file', file);
    if (altText) form.set('alt_text', altText);
    return request<Version>(`${BASE}/assets/${assetId}/versions`, { method: 'POST', body: form });
  },
  getVersion: (assetId: number, version: number) =>
    request<Version>(`${BASE}/assets/${assetId}/versions/${version}`),
};
