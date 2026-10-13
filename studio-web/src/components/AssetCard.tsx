import { Flex, Text } from '@adobe/react-spectrum';
import { Link } from 'react-router-dom';
import { blobSrc, findRendition, type Asset } from '../api/assets';
import type { Review } from '../api/review';
import { ReviewStatusChip } from './StatusChip';

interface AssetCardProps {
  asset: Asset;
  ownerName: string;
  review: Review | undefined;
}

export function AssetCard({ asset, ownerName, review }: AssetCardProps) {
  const version = asset.latest_version;
  const thumb = findRendition(version, 'thumbnail');
  const src = thumb ? blobSrc(thumb.blob_url) : version ? blobSrc(version.blob_url) : undefined;

  return (
    <Link to={`/assets/${asset.id}`} className="asset-card" data-testid="asset-card" data-asset-id={asset.id}>
      <div className="asset-card-thumb">
        {src ? <img src={src} alt={version?.alt_text || asset.title} loading="lazy" /> : null}
      </div>
      <Flex direction="column" gap="size-50" UNSAFE_className="asset-card-body">
        <Text UNSAFE_className="asset-card-title">{asset.title}</Text>
        <Text UNSAFE_className="muted">
          {ownerName}
          {version ? ` · v${version.version}` : ''}
        </Text>
        {asset.tags.length > 0 && (
          <div className="tag-list">
            {asset.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
        <ReviewStatusChip status={review?.status ?? 'none'} />
      </Flex>
    </Link>
  );
}
