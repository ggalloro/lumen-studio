import { StatusLight } from '@adobe/react-spectrum';
import {
  brandStatusAppearance,
  readinessAppearance,
  reviewStatusAppearance,
  type BrandChipStatus,
  type ReviewChipStatus,
  type StatusAppearance,
} from '../lib/status';

interface ChipProps {
  appearance: StatusAppearance;
  testId?: string;
  status?: string;
}

function Chip({ appearance, testId, status }: ChipProps) {
  return (
    <StatusLight variant={appearance.variant} data-testid={testId} data-status={status}>
      {appearance.label}
    </StatusLight>
  );
}

export function ReviewStatusChip({ status }: { status: ReviewChipStatus | null | undefined }) {
  return (
    <Chip
      appearance={reviewStatusAppearance(status)}
      testId="review-status"
      status={status ?? 'none'}
    />
  );
}

export function BrandStatusChip({ status }: { status: BrandChipStatus | null | undefined }) {
  return (
    <Chip appearance={brandStatusAppearance(status)} testId="brand-status" status={status ?? 'none'} />
  );
}

export function ReadinessChip({ ready }: { ready: boolean }) {
  return (
    <Chip
      appearance={readinessAppearance(ready)}
      testId="readiness-status"
      status={ready ? 'ready' : 'blocked'}
    />
  );
}
