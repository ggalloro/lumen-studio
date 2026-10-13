import { defaultTheme, Provider } from '@adobe/react-spectrum';
import { render, screen } from '@testing-library/react';
import { BrandStatusChip, ReadinessChip, ReviewStatusChip } from '../components/StatusChip';
import { brandStatusAppearance, reviewStatusAppearance } from './status';

describe('status mapping', () => {
  it.each([
    ['approved', 'Approved', 'positive'],
    ['in_review', 'In review', 'info'],
    ['changes_requested', 'Changes requested', 'notice'],
    ['none', 'No review', 'neutral'],
  ] as const)('maps review status %s', (status, label, variant) => {
    expect(reviewStatusAppearance(status)).toEqual({ label, variant });
  });

  it('treats a missing review as "No review"', () => {
    expect(reviewStatusAppearance(undefined).label).toBe('No review');
    expect(reviewStatusAppearance(null).label).toBe('No review');
  });

  it.each([
    ['pass', 'positive'],
    ['warn', 'notice'],
    ['fail', 'negative'],
    ['none', 'neutral'],
  ] as const)('maps brand status %s', (status, variant) => {
    expect(brandStatusAppearance(status).variant).toBe(variant);
  });
});

describe('status chips', () => {
  it('render their labels', () => {
    render(
      <Provider theme={defaultTheme}>
        <ReviewStatusChip status="changes_requested" />
        <BrandStatusChip status="fail" />
        <ReadinessChip ready={false} />
      </Provider>,
    );
    expect(screen.getByTestId('review-status')).toHaveTextContent('Changes requested');
    expect(screen.getByTestId('review-status')).toHaveAttribute('data-status', 'changes_requested');
    expect(screen.getByTestId('brand-status')).toHaveTextContent('Fail');
    expect(screen.getByTestId('readiness-status')).toHaveTextContent('Blocked');
  });
});
