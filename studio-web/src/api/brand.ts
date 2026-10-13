import { request, type ItemList } from './client';

const BASE = '/api/brand';

export interface PaletteColor {
  name: string;
  hex: string;
}

export interface BrandKit {
  workspace_id: number;
  name: string;
  palette: PaletteColor[];
  fonts: string[];
  tone_of_voice: string;
  logo_rules: string;
  palette_tolerance: number;
  updated_at: string;
}

export type BrandKitInput = Omit<BrandKit, 'workspace_id' | 'updated_at'>;

export type CheckStatus = 'pass' | 'warn' | 'fail';
export type RuleId = 'palette' | 'copy_style';

export interface PaletteColorResult {
  hex: string;
  share: number;
  nearest: string;
  delta_e: number;
  on_palette: boolean;
  neutral: boolean;
}

export interface RuleResult {
  rule: RuleId;
  status: CheckStatus;
  message: string;
  details: { colors?: PaletteColorResult[] } & Record<string, unknown>;
}

export interface Report {
  id: number;
  asset_id: number;
  version: number;
  overall: CheckStatus;
  score: number;
  rules: RuleResult[];
  created_at: string;
}

export const RULE_LABELS: Record<RuleId, string> = {
  palette: 'Palette',
  copy_style: 'Copy style',
};

export const brandApi = {
  getKit: () => request<BrandKit>(`${BASE}/brand-kit`),
  updateKit: (kit: BrandKitInput) => request<BrandKit>(`${BASE}/brand-kit`, { method: 'PUT', body: kit }),
  runCheck: (assetId: number, version: number) =>
    request<Report>(`${BASE}/checks`, { method: 'POST', body: { asset_id: assetId, version } }),
  listChecks: (assetId: number, version?: number) =>
    request<ItemList<Report>>(`${BASE}/checks`, { query: { asset_id: assetId, version } }),
  latest: (assetId: number, version: number) =>
    request<Report>(`${BASE}/checks/latest`, { query: { asset_id: assetId, version } }),
};
