import {
  Button,
  DialogTrigger,
  Flex,
  Heading,
  Item,
  Picker,
  SearchField,
  Text,
  View,
} from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { assetsApi } from '../api/assets';
import { latestReviewByAsset, reviewApi } from '../api/review';
import { AssetCard } from '../components/AssetCard';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { UploadDialog } from '../components/UploadDialog';
import { reviewStatusAppearance, type ReviewChipStatus } from '../lib/status';
import { useAsync } from '../lib/useAsync';
import { useDebounced } from '../lib/useDebounced';
import { useDirectory } from '../lib/users';

const ALL = '__all__';
const STATUS_KEYS: ReviewChipStatus[] = ['none', 'in_review', 'changes_requested', 'approved'];

export function LibraryPage() {
  const navigate = useNavigate();
  const { users, byId } = useDirectory();
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState<string>(ALL);
  const [owner, setOwner] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const q = useDebounced(search.trim());

  const assets = useAsync(
    () =>
      assetsApi
        .list({
          q: q || undefined,
          tag: tag === ALL ? undefined : tag,
          owner_id: owner === ALL ? undefined : Number(owner),
        })
        .then((r) => r.items),
    [q, tag, owner],
  );
  // Unfiltered list, only used to offer every tag in the filter.
  const allAssets = useAsync(() => assetsApi.list().then((r) => r.items), []);
  const reviews = useAsync(() => reviewApi.list().then((r) => latestReviewByAsset(r.items)), []);

  const tagItems = useMemo(() => {
    const tags = new Set<string>();
    for (const a of allAssets.data ?? []) a.tags.forEach((t) => tags.add(t));
    return [{ key: ALL, label: 'All tags' }, ...[...tags].sort().map((t) => ({ key: t, label: t }))];
  }, [allAssets.data]);

  const ownerItems = useMemo(
    () => [{ key: ALL, label: 'All owners' }, ...users.map((u) => ({ key: String(u.id), label: u.name }))],
    [users],
  );

  const statusItems = useMemo(
    () => [
      { key: ALL, label: 'Any review status' },
      ...STATUS_KEYS.map((s) => ({ key: s, label: reviewStatusAppearance(s).label })),
    ],
    [],
  );

  const visible = useMemo(() => {
    const list = assets.data ?? [];
    if (status === ALL) return list;
    return list.filter((a) => (reviews.data?.get(a.id)?.status ?? 'none') === status);
  }, [assets.data, reviews.data, status]);

  return (
    <Flex direction="column" gap="size-300">
      <Flex alignItems="center" justifyContent="space-between" wrap gap="size-200">
        <Heading level={1} margin={0}>
          Library
        </Heading>
        <DialogTrigger>
          <Button variant="accent" data-testid="upload-open">
            <Add />
            <Text>Upload</Text>
          </Button>
          {(close) => (
            <UploadDialog
              close={close}
              onUploaded={(asset) => {
                void assets.reload();
                void allAssets.reload();
                navigate(`/assets/${asset.id}`);
              }}
            />
          )}
        </DialogTrigger>
      </Flex>

      <Flex gap="size-200" wrap alignItems="end">
        <SearchField
          label="Search"
          value={search}
          onChange={setSearch}
          width="size-3600"
          data-testid="library-search"
        />
        <Picker
          label="Tag"
          items={tagItems}
          selectedKey={tag}
          onSelectionChange={(k) => setTag(String(k ?? ALL))}
          data-testid="filter-tag"
        >
          {(item) => <Item key={item.key}>{item.label}</Item>}
        </Picker>
        <Picker
          label="Owner"
          items={ownerItems}
          selectedKey={owner}
          onSelectionChange={(k) => setOwner(String(k ?? ALL))}
          data-testid="filter-owner"
        >
          {(item) => <Item key={item.key}>{item.label}</Item>}
        </Picker>
        <Picker
          label="Review status"
          items={statusItems}
          selectedKey={status}
          onSelectionChange={(k) => setStatus(String(k ?? ALL))}
          data-testid="filter-status"
        >
          {(item) => <Item key={item.key}>{item.label}</Item>}
        </Picker>
      </Flex>

      <ErrorMessage error={assets.error} title="Could not load assets" />
      {assets.loading && !assets.data ? (
        <Loading />
      ) : visible.length === 0 ? (
        <View paddingY="size-400">
          <Text>No assets match these filters.</Text>
        </View>
      ) : (
        <div className="asset-grid" data-testid="asset-grid">
          {visible.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              ownerName={byId.get(asset.owner_id)?.name ?? `User ${asset.owner_id}`}
              review={reviews.data?.get(asset.id)}
            />
          ))}
        </div>
      )}
    </Flex>
  );
}
