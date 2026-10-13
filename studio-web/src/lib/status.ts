import type { ReviewStatus } from '../api/review';
import type { CheckStatus } from '../api/brand';

/** Variants shared by Spectrum Badge and StatusLight. */
export type StatusVariant = 'positive' | 'negative' | 'notice' | 'info' | 'neutral';

export interface StatusAppearance {
  label: string;
  variant: StatusVariant;
}

export type ReviewChipStatus = ReviewStatus | 'none';
export type BrandChipStatus = CheckStatus | 'none';

const REVIEW: Record<ReviewChipStatus, StatusAppearance> = {
  approved: { label: 'Approved', variant: 'positive' },
  in_review: { label: 'In review', variant: 'info' },
  changes_requested: { label: 'Changes requested', variant: 'notice' },
  none: { label: 'No review', variant: 'neutral' },
};

const BRAND: Record<BrandChipStatus, StatusAppearance> = {
  pass: { label: 'Pass', variant: 'positive' },
  warn: { label: 'Warning', variant: 'notice' },
  fail: { label: 'Fail', variant: 'negative' },
  none: { label: 'Not checked', variant: 'neutral' },
};

export function reviewStatusAppearance(status: ReviewChipStatus | null | undefined): StatusAppearance {
  return REVIEW[status ?? 'none'] ?? REVIEW.none;
}

export function brandStatusAppearance(status: BrandChipStatus | null | undefined): StatusAppearance {
  return BRAND[status ?? 'none'] ?? BRAND.none;
}

export function readinessAppearance(ready: boolean): StatusAppearance {
  return ready ? { label: 'Ready', variant: 'positive' } : { label: 'Blocked', variant: 'negative' };
}

export function campaignStatusAppearance(status: 'draft' | 'published'): StatusAppearance {
  return status === 'published'
    ? { label: 'Published', variant: 'positive' }
    : { label: 'Draft', variant: 'neutral' };
}
