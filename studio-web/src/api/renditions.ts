import { request, type ItemList } from './client';

const BASE = '/api/renditions';

export interface Preset {
  id: string;
  label: string;
  width: number;
  height: number;
  mode: 'fill' | 'fit';
  anchor: string;
}

export const renditionsApi = {
  presets: () => request<ItemList<Preset>>(`${BASE}/presets`),
};
