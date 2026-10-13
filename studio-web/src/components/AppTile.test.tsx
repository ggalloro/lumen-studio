import { render, screen } from '@testing-library/react';
import { AppTile } from './AppTile';

describe('AppTile', () => {
  it('renders the Ls mark on a gradient tile', () => {
    render(<AppTile size={48} />);
    const tile = screen.getByRole('img', { name: 'Lumen Studio' });
    expect(tile).toHaveAttribute('width', '48');
    expect(tile).toHaveTextContent('Ls');

    const stops = tile.querySelectorAll('stop');
    expect([...stops].map((s) => s.getAttribute('stop-color'))).toEqual(['#B30B00', '#FA0F00']);
    const rect = tile.querySelector('rect');
    expect(rect?.getAttribute('fill')).toMatch(/^url\(#app-tile-/);
  });

  it('is hidden from assistive tech when decorative', () => {
    render(<AppTile title="" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByTestId('app-tile')).toHaveAttribute('aria-hidden', 'true');
  });

  it('gives each instance its own gradient id', () => {
    render(
      <>
        <AppTile title="a" />
        <AppTile title="b" />
      </>,
    );
    const ids = [...document.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });
});
