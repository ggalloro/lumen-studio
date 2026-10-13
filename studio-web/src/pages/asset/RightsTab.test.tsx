import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/render';
import { RightsTab } from './RightsTab';

const PRESETS = [
  { id: 'story', label: 'Story 9:16', width: 1080, height: 1920, mode: 'fill', anchor: 'top' },
  { id: 'web_banner', label: 'Web banner', width: 1200, height: 628, mode: 'fill', anchor: 'center' },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

/** Answers the presets, rights and clearance calls the tab makes. */
function stubApi(rights: unknown, reasons: Record<string, string[]>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost');
      if (url.pathname === '/api/renditions/presets') return json({ items: PRESETS });
      if (url.pathname.endsWith('/clearance')) {
        const channel = url.searchParams.get('channel') ?? '';
        const r = reasons[channel] ?? [];
        return json({ asset_id: 7, channel, date: '2026-10-13', cleared: r.length === 0, reasons: r });
      }
      if (url.pathname === '/api/rights/rights/7') {
        return rights ? json(rights) : json({ error: 'not found' }, 404);
      }
      return json({ error: 'not found' }, 404);
    }),
  );
}

describe('RightsTab', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says when no usage rights are on file', async () => {
    stubApi(null, { story: ['No usage rights on file'], web_banner: ['No usage rights on file'] });
    renderWithProviders(<RightsTab assetId={7} />);

    expect(await screen.findByTestId('rights-none')).toHaveTextContent('No usage rights on file');
    const rows = await screen.findAllByTestId('clearance-row');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.dataset.cleared).toBe('false');
      expect(within(row).getByText('No usage rights on file')).toBeInTheDocument();
    }
  });

  it('lists the reasons for a channel that is not cleared', async () => {
    stubApi(
      {
        asset_id: 7, workspace_id: 1, license_type: 'licensed', licensor: 'Example Photo Agency',
        channels: ['story'], valid_from: '2026-01-01', expires_on: null,
        model_release_required: true, model_release_on_file: true, notes: '',
        updated_by: 5, updated_at: '2026-10-01T09:00:00Z',
      },
      { web_banner: ['Not licensed for web_banner'] },
    );
    renderWithProviders(<RightsTab assetId={7} />);

    expect(await screen.findByText('Perpetual')).toBeInTheDocument();
    expect(screen.getByText('Example Photo Agency')).toBeInTheDocument();

    const rows = await screen.findAllByTestId('clearance-row');
    const story = rows.find((r) => r.dataset.channel === 'story')!;
    const banner = rows.find((r) => r.dataset.channel === 'web_banner')!;
    expect(story.dataset.cleared).toBe('true');
    expect(within(story).getByText(/Cleared/)).toBeInTheDocument();
    expect(banner.dataset.cleared).toBe('false');
    expect(within(banner).getByText('Not licensed for web_banner')).toBeInTheDocument();
  });
});
