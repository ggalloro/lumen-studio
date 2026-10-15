import { Flex, Heading, Item, TabList, TabPanels, Tabs, Text, View } from '@adobe/react-spectrum';
import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { assetsApi } from '../api/assets';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { useAsync } from '../lib/useAsync';
import { useUserName } from '../lib/users';
import { BrandCheckTab } from './asset/BrandCheckTab';
import { RenditionsTab } from './asset/RenditionsTab';
import { ReviewsTab } from './asset/ReviewsTab';
import { RightsTab } from './asset/RightsTab';
import { VersionsTab } from './asset/VersionsTab';

export function AssetPage() {
  const assetId = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const asset = useAsync(() => assetsApi.get(assetId), [assetId]);
  const ownerName = useUserName(asset.data?.owner_id);

  const versions = useMemo(() => asset.data?.versions ?? [], [asset.data]);
  const requested = Number(params.get('v'));
  const selected =
    versions.find((v) => v.version === requested) ?? versions[versions.length - 1] ?? asset.data?.latest_version;
  const tab = params.get('tab') ?? 'versions';

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) next.set(k, v);
    setParams(next, { replace: true });
  };

  if (asset.error && !asset.data) return <ErrorMessage error={asset.error} title="Could not load asset" />;
  if (!asset.data || !selected) return <Loading />;
  const a = asset.data;

  return (
    <Flex direction="column" gap="size-200">
      <View>
        <Heading level={1} marginTop={0} marginBottom="size-50" data-testid="asset-title">
          {a.title}
        </Heading>
        <Flex gap="size-200" alignItems="center" wrap>
          <Text UNSAFE_className="muted">Owner: {ownerName}</Text>
          {a.tags.length > 0 && (
            <div className="tag-list">
              {a.tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          )}
        </Flex>
        {a.description && <p className="asset-description">{a.description}</p>}
      </View>

      <Tabs
        aria-label="Asset details"
        selectedKey={tab}
        onSelectionChange={(k) => update({ tab: String(k) })}
      >
        <TabList>
          <Item key="versions" data-testid="tab-versions">
            Versions
          </Item>
          <Item key="renditions" data-testid="tab-renditions">
            Renditions
          </Item>
          <Item key="brand" data-testid="tab-brand-check">
            Brand check
          </Item>
          <Item key="rights" data-testid="tab-rights">
            Rights
          </Item>
          <Item key="reviews" data-testid="tab-reviews">
            Reviews
          </Item>
        </TabList>
        <TabPanels UNSAFE_className="asset-tab-panels">
          <Item key="versions">
            <VersionsTab
              asset={a}
              versions={versions}
              selected={selected}
              onSelect={(v) => update({ v: String(v) })}
              onUploaded={async (v) => {
                await asset.reload();
                update({ v: String(v.version) });
              }}
            />
          </Item>
          <Item key="renditions">
            <RenditionsTab version={selected} onRefresh={asset.reload} />
          </Item>
          <Item key="brand">
            <BrandCheckTab assetId={a.id} version={selected.version} />
          </Item>
          <Item key="rights">
            <RightsTab assetId={a.id} />
          </Item>
          <Item key="reviews">
            <ReviewsTab asset={a} selectedVersion={selected.version} />
          </Item>
        </TabPanels>
      </Tabs>
    </Flex>
  );
}
