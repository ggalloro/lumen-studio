import { useEffect, useRef } from 'react';
import { reviewApi, type Annotation, type Decision, type ReviewStatus } from '../api/review';

export interface ReviewEventHandlers {
  onAnnotation: (a: Annotation) => void;
  onDecision: (d: Decision) => void;
  onStatus: (status: ReviewStatus) => void;
  /** Called after the stream reconnects, so the caller can refetch anything missed. */
  onReconnect?: () => void;
}

/** Subscribes to the review's Server-Sent Events stream for the lifetime of the component. */
export function useReviewEvents(reviewId: number, handlers: ReviewEventHandlers): void {
  // Keep the latest handlers without reopening the stream on every render.
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!Number.isFinite(reviewId) || typeof EventSource === 'undefined') return;
    const source = new EventSource(reviewApi.eventsUrl(reviewId));
    let opened = false;

    const parse = <T,>(e: MessageEvent): T | null => {
      try {
        return JSON.parse(e.data) as T;
      } catch {
        return null;
      }
    };

    source.addEventListener('annotation', (e) => {
      const a = parse<Annotation>(e as MessageEvent);
      if (a) ref.current.onAnnotation(a);
    });
    source.addEventListener('decision', (e) => {
      const d = parse<Decision>(e as MessageEvent);
      if (d) ref.current.onDecision(d);
    });
    source.addEventListener('status', (e) => {
      const s = parse<{ status: ReviewStatus }>(e as MessageEvent);
      if (s) ref.current.onStatus(s.status);
    });
    source.onopen = () => {
      if (opened) ref.current.onReconnect?.();
      opened = true;
    };

    return () => source.close();
  }, [reviewId]);
}
