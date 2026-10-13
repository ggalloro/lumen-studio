import { useRef, type MouseEvent } from 'react';
import type { Annotation } from '../api/review';
import { pointToPercent, ReviewPin } from './ReviewPin';

interface ReviewCanvasProps {
  src: string;
  alt: string;
  annotations: Annotation[];
  pending: { x: number; y: number } | null;
  activeId: number | null;
  canAnnotate: boolean;
  onPlace: (point: { x: number; y: number }) => void;
  onHover: (id: number | null) => void;
}

/**
 * Image with annotation pins. The wrapper shrink-wraps the rendered image
 * (never wider than its column, aspect ratio preserved), so percentage
 * offsets inside it map directly onto image coordinates.
 */
export function ReviewCanvas({
  src,
  alt,
  annotations,
  pending,
  activeId,
  canAnnotate,
  onPlace,
  onHover,
}: ReviewCanvasProps) {
  const wrapper = useRef<HTMLDivElement>(null);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!canAnnotate || !wrapper.current) return;
    onPlace(pointToPercent(e.clientX, e.clientY, wrapper.current.getBoundingClientRect()));
  };

  return (
    <div
      ref={wrapper}
      className={`review-canvas${canAnnotate ? ' can-annotate' : ''}`}
      data-testid="review-canvas"
      onClick={handleClick}
    >
      <img src={src} alt={alt} draggable={false} data-testid="review-image" />
      {annotations.map((a) => (
        <ReviewPin
          key={a.id}
          number={a.number}
          xPct={a.x_pct}
          yPct={a.y_pct}
          active={activeId === a.id}
          onHover={(h) => onHover(h ? a.id : null)}
        />
      ))}
      {pending && <ReviewPin number={0} xPct={pending.x} yPct={pending.y} pending />}
    </div>
  );
}
