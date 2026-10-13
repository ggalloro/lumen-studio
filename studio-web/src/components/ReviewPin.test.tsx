import { fireEvent, render, screen } from '@testing-library/react';
import { pointToPercent, ReviewPin } from './ReviewPin';

describe('ReviewPin', () => {
  it('positions itself with CSS percentages', () => {
    render(<ReviewPin number={3} xPct={25.5} yPct={80} />);
    const pin = screen.getByTestId('review-pin');
    expect(pin).toHaveTextContent('3');
    expect(pin.style.left).toBe('25.5%');
    expect(pin.style.top).toBe('80%');
  });

  it('does not let clicks reach the canvas underneath', () => {
    const onCanvasClick = vi.fn();
    const onSelect = vi.fn();
    render(
      <div onClick={onCanvasClick}>
        <ReviewPin number={1} xPct={10} yPct={10} onSelect={onSelect} />
      </div>,
    );
    fireEvent.click(screen.getByTestId('review-pin'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onCanvasClick).not.toHaveBeenCalled();
  });

  it('reports hover so the thread can highlight it', () => {
    const onHover = vi.fn();
    render(<ReviewPin number={1} xPct={10} yPct={10} onHover={onHover} />);
    fireEvent.mouseEnter(screen.getByTestId('review-pin'));
    fireEvent.mouseLeave(screen.getByTestId('review-pin'));
    expect(onHover.mock.calls).toEqual([[true], [false]]);
  });
});

describe('pointToPercent', () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };

  it('converts a point inside the box to percentages', () => {
    expect(pointToPercent(200, 100, rect)).toEqual({ x: 25, y: 25 });
  });

  it('is independent of the rendered size', () => {
    const small = pointToPercent(150, 75, { left: 100, top: 50, width: 200, height: 100 });
    expect(small).toEqual(pointToPercent(200, 100, rect));
  });

  it('clamps to the image bounds and rounds to two decimals', () => {
    expect(pointToPercent(0, 1000, rect)).toEqual({ x: 0, y: 100 });
    expect(pointToPercent(101, 51, { left: 100, top: 50, width: 300, height: 300 })).toEqual({
      x: 0.33,
      y: 0.33,
    });
  });
});
