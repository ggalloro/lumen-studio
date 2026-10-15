import {
  Button,
  ButtonGroup,
  Flex,
  Heading,
  Text,
  TextArea,
  View,
  Well,
} from '@adobe/react-spectrum';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { assetsApi, blobSrc } from '../api/assets';
import { reviewApi, type Annotation, type Decision, type DecisionKind, type Review } from '../api/review';
import { useAuth } from '../auth/AuthContext';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { ReviewCanvas } from '../components/ReviewCanvas';
import { ReviewStatusChip } from '../components/StatusChip';
import { formatDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { useReviewEvents } from '../lib/useReviewEvents';

function mergeById<T extends { id: number }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list : [...list, item];
}

export function ReviewPage() {
  const reviewId = Number(useParams().id);
  const { user } = useAuth();

  const review = useAsync(() => reviewApi.get(reviewId), [reviewId]);
  const r = review.data;
  const asset = useAsync(
    () => (r ? assetsApi.get(r.asset_id) : Promise.resolve(undefined)),
    [r?.asset_id],
  );
  const version = asset.data?.versions?.find((v) => v.version === r?.version);

  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<unknown>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [deciding, setDeciding] = useState<DecisionKind | null>(null);
  const [decisionError, setDecisionError] = useState<unknown>(null);

  const { setData } = review;
  const patch = useCallback(
    (fn: (prev: Review) => Review) => setData((prev) => (prev ? fn(prev) : prev)),
    [setData],
  );

  useReviewEvents(reviewId, {
    onAnnotation: (a) => patch((p) => ({ ...p, annotations: mergeById(p.annotations, a) })),
    onDecision: (d) => patch((p) => ({ ...p, decisions: mergeById(p.decisions, d) })),
    onStatus: (status) => patch((p) => ({ ...p, status })),
    onReconnect: () => void review.reload(),
  });

  if (review.error && !r) return <ErrorMessage error={review.error} title="Could not load review" />;
  if (!r) return <Loading />;

  const canAnnotate = r.status !== 'approved';
  const canDecide = user?.role === 'reviewer' || user?.role === 'brand_admin';
  const annotations = [...r.annotations].sort((a, b) => a.number - b.number);
  const decisions = [...r.decisions].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const postComment = async () => {
    if (!pending || !comment.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      const a = await reviewApi.annotate(r.id, { x_pct: pending.x, y_pct: pending.y, body: comment.trim() });
      patch((p) => ({ ...p, annotations: mergeById(p.annotations, a) }));
      setPending(null);
      setComment('');
    } catch (err) {
      setPostError(err);
    } finally {
      setPosting(false);
    }
  };

  const decide = async (kind: DecisionKind) => {
    setDeciding(kind);
    setDecisionError(null);
    try {
      const updated = await reviewApi.decide(r.id, kind, note.trim() || undefined);
      review.setData(updated);
      setNote('');
    } catch (err) {
      setDecisionError(err);
    } finally {
      setDeciding(null);
    }
  };

  return (
    <Flex direction="column" gap="size-200">
      <Flex alignItems="center" gap="size-200" wrap>
        <Heading level={1} margin={0}>
          Review #{r.id}
        </Heading>
        <ReviewStatusChip status={r.status} />
        <Text UNSAFE_className="muted">
          <Link to={`/assets/${r.asset_id}?v=${r.version}&tab=reviews`} className="text-link">
            {asset.data?.title ?? `Asset ${r.asset_id}`}
          </Link>{' '}
          · version {r.version}
        </Text>
      </Flex>

      <Flex gap="size-300" wrap alignItems="start">
        <View flex="1 1 480px" minWidth={0}>
          <ErrorMessage error={asset.error} title="Could not load image" />
          {version ? (
            <ReviewCanvas
              src={blobSrc(version.blob_url)}
              alt={version.alt_text || asset.data?.title || 'Image under review'}
              annotations={annotations}
              pending={pending}
              activeId={hovered}
              canAnnotate={canAnnotate}
              onPlace={(p) => {
                setPending(p);
                setPostError(null);
              }}
              onHover={setHovered}
            />
          ) : (
            !asset.error && <Loading label="Loading image" />
          )}
          {canAnnotate && !pending && (
            <Text UNSAFE_className="muted canvas-hint">Click the image to add a comment.</Text>
          )}
          {pending && (
            <Well marginTop="size-200" data-testid="comment-box">
              <Flex direction="column" gap="size-100">
                <TextArea
                  label={`Comment at ${pending.x.toFixed(1)}%, ${pending.y.toFixed(1)}%`}
                  value={comment}
                  onChange={setComment}
                  width="100%"
                  autoFocus
                  data-testid="comment-input"
                />
                <ErrorMessage error={postError} title="Could not add comment" />
                <ButtonGroup>
                  <Button
                    variant="secondary"
                    onPress={() => {
                      setPending(null);
                      setComment('');
                    }}
                    data-testid="comment-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="accent"
                    onPress={postComment}
                    isPending={posting}
                    isDisabled={!comment.trim()}
                    data-testid="comment-submit"
                  >
                    Add comment
                  </Button>
                </ButtonGroup>
              </Flex>
            </Well>
          )}
        </View>

        <Flex direction="column" gap="size-300" flex="0 1 360px" minWidth="size-3400">
          {canDecide && (
            <Well>
              <Flex direction="column" gap="size-150">
                <Heading level={3} margin={0}>
                  Decision
                </Heading>
                <TextArea
                  label="Note (optional)"
                  value={note}
                  onChange={setNote}
                  width="100%"
                  data-testid="decision-note"
                />
                <ErrorMessage error={decisionError} title="Decision not recorded" />
                <Flex gap="size-100" wrap>
                  <Button
                    variant="accent"
                    onPress={() => decide('approve')}
                    isPending={deciding === 'approve'}
                    isDisabled={r.status !== 'in_review' || deciding !== null}
                    data-testid="approve-button"
                  >
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    onPress={() => decide('request_changes')}
                    isPending={deciding === 'request_changes'}
                    isDisabled={r.status !== 'in_review' || deciding !== null}
                    data-testid="request-changes-button"
                  >
                    Request changes
                  </Button>
                </Flex>
              </Flex>
            </Well>
          )}

          <View>
            <Heading level={3} marginTop={0}>
              Comments ({annotations.length})
            </Heading>
            {annotations.length === 0 ? (
              <Text UNSAFE_className="muted">No comments yet.</Text>
            ) : (
              <ol className="thread" data-testid="annotation-thread">
                {annotations.map((a) => (
                  <AnnotationItem
                    key={a.id}
                    annotation={a}
                    active={hovered === a.id}
                    onHover={(h) => setHovered(h ? a.id : null)}
                  />
                ))}
              </ol>
            )}
          </View>

          <View>
            <Heading level={3} marginTop={0}>
              Decision history
            </Heading>
            {decisions.length === 0 ? (
              <Text UNSAFE_className="muted">No decisions yet.</Text>
            ) : (
              <ul className="thread" data-testid="decision-history">
                {decisions.map((d) => (
                  <DecisionItem key={d.id} decision={d} />
                ))}
              </ul>
            )}
          </View>
        </Flex>
      </Flex>
    </Flex>
  );
}

function AnnotationItem({
  annotation: a,
  active,
  onHover,
}: {
  annotation: Annotation;
  active: boolean;
  onHover: (hovering: boolean) => void;
}) {
  return (
    <li
      className={`thread-item${active ? ' is-active' : ''}`}
      data-testid="annotation-item"
      data-number={a.number}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <span className="thread-number">{a.number}</span>
      <div>
        <div className="thread-meta">
          <strong>{a.author_name}</strong> · {formatDateTime(a.created_at)}
        </div>
        <div className="thread-body">{a.body}</div>
      </div>
    </li>
  );
}

function DecisionItem({ decision: d }: { decision: Decision }) {
  return (
    <li className="thread-item" data-testid="decision-item">
      <div>
        <div className="thread-meta">
          <strong>{d.reviewer_name}</strong>{' '}
          {d.decision === 'approve' ? 'approved' : 'requested changes'} · {formatDateTime(d.created_at)}
        </div>
        {d.note && <div className="thread-body">{d.note}</div>}
      </div>
    </li>
  );
}
