import { badGateway, notFound } from './errors.js';

export type FetchFn = typeof fetch;

/** The subset of the assets service Asset object that review relies on. */
export interface AssetSummary {
  id: number;
  workspace_id: number;
  owner_id: number;
  versions: { version: number }[];
}

/** Reads assets over HTTP using the internal token. */
export class AssetsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async getAsset(assetId: number): Promise<AssetSummary> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/assets/${assetId}`, {
        headers: { 'X-Internal-Token': this.internalToken, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw badGateway(`assets service unreachable: ${(err as Error).message}`);
    }
    if (res.status === 404) {
      throw notFound(`asset ${assetId} not found`);
    }
    if (!res.ok) {
      throw badGateway(`assets service returned ${res.status}`);
    }
    const body = (await res.json()) as Partial<AssetSummary>;
    if (typeof body.owner_id !== 'number' || typeof body.workspace_id !== 'number') {
      throw badGateway('assets service returned an unexpected asset shape');
    }
    return {
      id: assetId,
      workspace_id: body.workspace_id,
      owner_id: body.owner_id,
      versions: Array.isArray(body.versions) ? body.versions : [],
    };
  }

  /** Returns the asset, or throws 404 when the asset or the version does not exist. */
  async getAssetWithVersion(assetId: number, version: number): Promise<AssetSummary> {
    const asset = await this.getAsset(assetId);
    if (!asset.versions.some((v) => v.version === version)) {
      throw notFound(`asset ${assetId} has no version ${version}`);
    }
    return asset;
  }
}
