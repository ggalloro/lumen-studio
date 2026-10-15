import { Button, Flex, Text, View, Well } from '@adobe/react-spectrum';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Asset } from '../../api/assets';
import { reviewApi, type Review } from '../../api/review';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Loading } from '../../components/Loading';
import { ReviewStatusChip } from '../../components/StatusChip';
import { formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';

interface ReviewsTabProps {
  asset: Asset;
  selectedVersion: number;
}

function isOpen(r: Review): boolean {
  return r.status === 'in_review' || r.status === 'changes_requested';
}

export function ReviewsTab({ asset, selectedVersion }: ReviewsTabProps) {
  const navigate = useNavigate();
  const reviews = useAsync(() => reviewApi.list({ asset_id: asset.id }).then((r) => r.items), [asset.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const list = reviews.data ?? [];
  const open = list.find(isOpen);
  const resubmittable =
    open && open.status === 'changes_requested' && selectedVersion > open.version ? open : undefined;

  const act = async (fn: () => Promise<Review>) => {
    setBusy(true);
    setError(null);
    try {
      const review = await fn();
      navigate(`/reviews/${review.id}`);
    } catch (err) {
      setError(err);
      void reviews.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex direction="column" gap="size-200">
      <Flex gap="size-200" wrap alignItems="center">
        {resubmittable ? (
          <Button
            variant="accent"
            isPending={busy}
            onPress={() => act(() => reviewApi.submitVersion(resubmittable.id, selectedVersion))}
            data-testid="resubmit-review"
          >
            Submit version {selectedVersion} for review
          </Button>
        ) : (
          <Button
            variant="accent"
            isPending={busy}
            isDisabled={!!open}
            onPress={() => act(() => reviewApi.create(asset.id, selectedVersion))}
            data-testid="start-review"
          >
            Start review of version {selectedVersion}
          </Button>
        )}
        {open && !resubmittable && (
          <Text UNSAFE_className="muted">
            Review #{open.id} is still open on version {open.version}.
            {open.status === 'changes_requested' ? ' Select a newer version to resubmit.' : ''}
          </Text>
        )}
      </Flex>
      <ErrorMessage error={error} title="Could not update review" />
      <ErrorMessage error={reviews.error} title="Could not load reviews" />

      {reviews.loading && !reviews.data ? (
        <Loading />
      ) : list.length === 0 ? (
        <Text>No reviews yet.</Text>
      ) : (
        <Flex direction="column" gap="size-100">
          {list.map((r) => (
            <Well key={r.id} data-testid="review-row">
              <Flex alignItems="center" gap="size-300" wrap>
                <Link to={`/reviews/${r.id}`} className="text-link" data-testid={`review-link-${r.id}`}>
                  Review #{r.id}
                </Link>
                <Text>Version {r.version}</Text>
                <ReviewStatusChip status={r.status} />
                <Text UNSAFE_className="muted">
                  {r.annotations.length} comment{r.annotations.length === 1 ? '' : 's'}
                </Text>
                <View flexGrow={1} />
                <Text UNSAFE_className="muted">Updated {formatDateTime(r.updated_at)}</Text>
              </Flex>
            </Well>
          ))}
        </Flex>
      )}
    </Flex>
  );
}
