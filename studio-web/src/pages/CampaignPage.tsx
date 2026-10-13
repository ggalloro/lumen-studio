import {
  ActionButton,
  Button,
  Flex,
  Heading,
  Item,
  Picker,
  ProgressBar,
  StatusLight,
  Text,
  View,
  Well,
} from '@adobe/react-spectrum';
import Delete from '@spectrum-icons/workflow/Delete';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { assetsApi, blobSrc } from '../api/assets';
import { ApiError } from '../api/client';
import {
  campaignsApi,
  isPublishConflict,
  type DeliverableReadiness,
  type Readiness,
} from '../api/campaigns';
import type { Preset } from '../api/renditions';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { BrandStatusChip, ReadinessChip, ReviewStatusChip } from '../components/StatusChip';
import { formatDate, formatDateTime } from '../lib/format';
import { usePresets } from '../lib/presets';
import { campaignStatusAppearance } from '../lib/status';
import { useAsync } from '../lib/useAsync';

export function CampaignPage() {
  const campaignId = Number(useParams().id);
  const campaign = useAsync(() => campaignsApi.get(campaignId), [campaignId]);
  const readiness = useAsync(() => campaignsApi.readiness(campaignId), [campaignId]);
  const presets = usePresets();
  const published = campaign.data?.status === 'published';
  const manifest = useAsync(
    () => (published ? campaignsApi.manifest(campaignId) : Promise.resolve(undefined)),
    [campaignId, published],
  );

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<unknown>(null);
  const [blocked, setBlocked] = useState<DeliverableReadiness[] | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const refresh = async () => {
    await Promise.all([campaign.reload(), readiness.reload()]);
  };

  const publish = async () => {
    setPublishing(true);
    setPublishError(null);
    setBlocked(null);
    try {
      const updated = await campaignsApi.publish(campaignId);
      campaign.setData(updated);
      if (updated.manifest) manifest.setData(updated.manifest);
      void readiness.reload();
    } catch (err) {
      setPublishError(err);
      if (err instanceof ApiError && err.status === 409 && isPublishConflict(err.body)) {
        readiness.setData(err.body.readiness);
        setBlocked(err.body.readiness.deliverables.filter((d) => !d.ready));
      }
    } finally {
      setPublishing(false);
    }
  };

  const remove = async (deliverableId: number) => {
    setActionError(null);
    try {
      await campaignsApi.removeDeliverable(campaignId, deliverableId);
      await refresh();
    } catch (err) {
      setActionError(err);
    }
  };

  if (campaign.error && !campaign.data) return <ErrorMessage error={campaign.error} title="Could not load campaign" />;
  if (!campaign.data) return <Loading />;
  const c = campaign.data;
  const status = campaignStatusAppearance(c.status);
  const r = readiness.data;

  return (
    <Flex direction="column" gap="size-300">
      <View>
        <Flex alignItems="center" gap="size-200" wrap>
          <Heading level={1} margin={0}>
            {c.name}
          </Heading>
          <StatusLight variant={status.variant} data-testid="campaign-status">
            {status.label}
          </StatusLight>
        </Flex>
        <Text UNSAFE_className="muted">
          Due {formatDate(c.due_date)}
          {c.published_at ? ` · published ${formatDateTime(c.published_at)}` : ''}
        </Text>
        {c.brief && <p className="asset-description">{c.brief}</p>}
      </View>

      <Flex alignItems="end" gap="size-300" wrap>
        {r && (
          <ProgressBar
            label="Deliverables ready"
            value={r.ready_count}
            minValue={0}
            maxValue={Math.max(r.total, 1)}
            valueLabel={`${r.ready_count} of ${r.total}`}
            width="size-3600"
          />
        )}
        {!published && (
          <Button
            variant="accent"
            onPress={publish}
            isPending={publishing}
            isDisabled={!r?.ready}
            data-testid="publish-button"
          >
            Publish
          </Button>
        )}
      </Flex>

      {publishError != null && (
        <View>
          <ErrorMessage error={publishError} title="Campaign not published" />
          {blocked && blocked.length > 0 && (
            <ul className="blocker-list" data-testid="publish-blockers">
              {blocked.map((d) => (
                <li key={d.deliverable_id}>
                  <strong>
                    {d.asset_title} / {d.channel}
                  </strong>
                  : {d.blockers.join('; ')}
                </li>
              ))}
            </ul>
          )}
        </View>
      )}

      <ErrorMessage error={readiness.error} title="Could not load readiness" />
      <ErrorMessage error={actionError} title="Could not update deliverables" />

      <View>
        <Heading level={2} marginTop={0}>
          Deliverables
        </Heading>
        {!r ? (
          readiness.error ? null : <Loading />
        ) : r.deliverables.length === 0 ? (
          <Text>No deliverables yet.</Text>
        ) : (
          <DeliverableMatrix
            readiness={r}
            presets={presets.data ?? []}
            canEdit={!published}
            onRemove={remove}
          />
        )}
      </View>

      {!published && (
        <AddDeliverable campaignId={campaignId} presets={presets.data ?? []} onAdded={refresh} />
      )}

      {published && (
        <View>
          <Heading level={2} marginTop={0}>
            Manifest
          </Heading>
          <ErrorMessage error={manifest.error} title="Could not load manifest" />
          {manifest.data ? (
            <div className="rendition-grid" data-testid="manifest">
              {manifest.data.items.map((item) => (
                <div key={`${item.asset_id}-${item.channel}`} className="rendition-card" data-testid="manifest-item">
                  <div className="rendition-thumb" style={{ aspectRatio: `${item.width} / ${item.height}` }}>
                    <img src={blobSrc(item.rendition_url)} alt={`${item.asset_title}, ${item.channel}`} loading="lazy" />
                  </div>
                  <Flex direction="column" gap="size-25" UNSAFE_className="rendition-meta">
                    <Text UNSAFE_className="asset-card-title">{item.asset_title}</Text>
                    <Text UNSAFE_className="muted">
                      {presetLabel(presets.data ?? [], item.channel)} · v{item.version} · {item.width} × {item.height}
                    </Text>
                    <a href={blobSrc(item.rendition_url, true)} className="text-link">
                      Download
                    </a>
                  </Flex>
                </div>
              ))}
            </div>
          ) : (
            !manifest.error && <Loading />
          )}
        </View>
      )}
    </Flex>
  );
}

function presetLabel(presets: Preset[], id: string): string {
  return presets.find((p) => p.id === id)?.label ?? id;
}

interface MatrixProps {
  readiness: Readiness;
  presets: Preset[];
  canEdit: boolean;
  onRemove: (deliverableId: number) => void;
}

/** Asset rows by channel columns; each filled cell is one deliverable. */
function DeliverableMatrix({ readiness, presets, canEdit, onRemove }: MatrixProps) {
  const { rows, channels, cells } = useMemo(() => {
    const order = new Map(presets.map((p, i) => [p.id, i]));
    const channelSet = new Set<string>();
    const rowMap = new Map<number, DeliverableReadiness>();
    const cellMap = new Map<string, DeliverableReadiness>();
    for (const d of readiness.deliverables) {
      channelSet.add(d.channel);
      if (!rowMap.has(d.asset_id)) rowMap.set(d.asset_id, d);
      cellMap.set(`${d.asset_id}:${d.channel}`, d);
    }
    const channelList = [...channelSet].sort(
      (a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99) || a.localeCompare(b),
    );
    return { rows: [...rowMap.values()], channels: channelList, cells: cellMap };
  }, [readiness, presets]);

  return (
    <div className="matrix-scroll">
      <table className="matrix" data-testid="deliverable-matrix">
        <thead>
          <tr>
            <th scope="col">Asset</th>
            {channels.map((ch) => (
              <th key={ch} scope="col">
                {presetLabel(presets, ch)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.asset_id}>
              <th scope="row">
                <Flex direction="column" gap="size-50">
                  <Link to={`/assets/${row.asset_id}`} className="text-link">
                    {row.asset_title}
                  </Link>
                  <Flex gap="size-100" wrap>
                    <ReviewStatusChip status={row.review_status} />
                    <BrandStatusChip status={row.brand_status} />
                  </Flex>
                  {row.approved_version != null && (
                    <Text UNSAFE_className="muted">Approved version {row.approved_version}</Text>
                  )}
                </Flex>
              </th>
              {channels.map((ch) => {
                const d = cells.get(`${row.asset_id}:${ch}`);
                return (
                  <td key={ch}>
                    {d && (
                      <div className="matrix-cell" data-testid="deliverable-cell" data-ready={d.ready ? 'true' : 'false'}>
                        <Flex alignItems="center" justifyContent="space-between" gap="size-50">
                          <ReadinessChip ready={d.ready} />
                          {canEdit && (
                            <ActionButton
                              isQuiet
                              aria-label={`Remove ${d.asset_title} ${ch}`}
                              onPress={() => onRemove(d.deliverable_id)}
                              data-testid="remove-deliverable"
                            >
                              <Delete />
                            </ActionButton>
                          )}
                        </Flex>
                        {d.blockers.length > 0 && (
                          <ul className="blocker-list">
                            {d.blockers.map((b) => (
                              <li key={b}>{b}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddDeliverable({
  campaignId,
  presets,
  onAdded,
}: {
  campaignId: number;
  presets: Preset[];
  onAdded: () => Promise<void>;
}) {
  const assets = useAsync(() => assetsApi.list().then((r) => r.items), []);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [channel, setChannel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const add = async () => {
    if (!assetId || !channel) return;
    setBusy(true);
    setError(null);
    try {
      await campaignsApi.addDeliverable(campaignId, Number(assetId), channel);
      await onAdded();
      setChannel(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Well>
      <Flex direction="column" gap="size-150">
        <Heading level={3} margin={0}>
          Add deliverable
        </Heading>
        <Flex gap="size-200" alignItems="end" wrap>
          <Picker
            label="Asset"
            items={(assets.data ?? []).map((a) => ({ key: String(a.id), label: a.title }))}
            selectedKey={assetId}
            onSelectionChange={(k) => setAssetId(k == null ? null : String(k))}
            isLoading={assets.loading}
            width="size-3600"
            data-testid="deliverable-asset"
          >
            {(item) => <Item key={item.key}>{item.label}</Item>}
          </Picker>
          <Picker
            label="Channel"
            items={presets.map((p) => ({ key: p.id, label: `${p.label} (${p.width} × ${p.height})` }))}
            selectedKey={channel}
            onSelectionChange={(k) => setChannel(k == null ? null : String(k))}
            width="size-3600"
            data-testid="deliverable-channel"
          >
            {(item) => <Item key={item.key}>{item.label}</Item>}
          </Picker>
          <Button
            variant="secondary"
            onPress={add}
            isPending={busy}
            isDisabled={!assetId || !channel}
            data-testid="add-deliverable"
          >
            Add
          </Button>
        </Flex>
        <ErrorMessage error={error} title="Could not add deliverable" />
      </Flex>
    </Well>
  );
}
