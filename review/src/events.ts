import { EventEmitter } from 'node:events';
import type { Annotation, Decision, ReviewStatus } from './types.js';

export type ReviewEvent =
  | { type: 'annotation'; data: Annotation }
  | { type: 'decision'; data: Decision }
  | { type: 'status'; data: { status: ReviewStatus } };

export type ReviewEventListener = (event: ReviewEvent) => void;

/** In-process pub/sub keyed by review id. Feeds the SSE endpoint. */
export class ReviewEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Each open SSE connection adds a listener; the default cap of 10 is too low.
    this.emitter.setMaxListeners(0);
  }

  publish(reviewId: number, event: ReviewEvent): void {
    this.emitter.emit(`review:${reviewId}`, event);
  }

  /** Subscribes to events for one review. Returns an unsubscribe function. */
  subscribe(reviewId: number, listener: ReviewEventListener): () => void {
    const key = `review:${reviewId}`;
    this.emitter.on(key, listener);
    return () => this.emitter.off(key, listener);
  }

  listenerCount(reviewId: number): number {
    return this.emitter.listenerCount(`review:${reviewId}`);
  }
}
