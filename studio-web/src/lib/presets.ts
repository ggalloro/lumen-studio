import { renditionsApi, type Preset } from '../api/renditions';
import { useAsync } from './useAsync';

let cache: Promise<Preset[]> | null = null;

/** Presets are static per deployment, so fetch them once per page load. */
export function loadPresets(): Promise<Preset[]> {
  if (!cache) {
    cache = renditionsApi.presets().then((r) => r.items);
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

export function usePresets() {
  return useAsync(loadPresets, []);
}
