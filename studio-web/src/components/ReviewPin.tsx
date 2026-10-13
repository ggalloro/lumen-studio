interface ReviewPinProps {
  number: number;
  /** 0 to 100 from the left edge of the image. */
  xPct: number;
  /** 0 to 100 from the top edge of the image. */
  yPct: number;
  active?: boolean;
  pending?: boolean;
  onHover?: (hovering: boolean) => void;
  onSelect?: () => void;
}

/**
 * A numbered marker on the review canvas. Position is expressed as CSS
 * percentages of the wrapper that matches the rendered image box, so pins
 * stay in place at any window size without measuring the image.
 */
export function ReviewPin({ number, xPct, yPct, active, pending, onHover, onSelect }: ReviewPinProps) {
  const classes = ['review-pin'];
  if (active) classes.push('is-active');
  if (pending) classes.push('is-pending');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-testid={pending ? 'review-pin-pending' : 'review-pin'}
      data-number={number}
      aria-label={pending ? 'New comment location' : `Comment ${number}`}
      style={{ left: `${xPct}%`, top: `${yPct}%` }}
      onClick={(e) => {
        // A click on a pin must not place another pin underneath it.
        e.stopPropagation();
        onSelect?.();
      }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
    >
      {pending ? '+' : number}
    </button>
  );
}

/** Converts a pointer position into image percentages, clamped to 0..100 with two decimals. */
export function pointToPercent(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    x: round(clamp(((clientX - rect.left) / rect.width) * 100)),
    y: round(clamp(((clientY - rect.top) / rect.height) * 100)),
  };
}
