import { fireEvent, screen, waitFor } from '@testing-library/react';
import { SEED_USERS } from '../lib/seedUsers';
import { renderWithProviders } from '../test/render';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the seeded users as quick picks', () => {
    renderWithProviders(<LoginPage />, { route: '/login' });
    const buttons = screen.getAllByTestId('seed-user');
    expect(buttons).toHaveLength(5);
    for (const u of SEED_USERS) {
      expect(screen.getByText(u.name)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(u.email))).toBeInTheDocument();
    }
    expect(screen.getByText(/Brand admin/)).toBeInTheDocument();
  });

  it('shows the shared password hint and an email form', () => {
    renderWithProviders(<LoginPage />, { route: '/login' });
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByText(/lumen-demo/)).toBeInTheDocument();
  });

  it('signs in with the picked user and stores the token', async () => {
    const user = { ...SEED_USERS[2], id: 3, workspace_id: 1 };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'h.e30.s', user }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<LoginPage />, { route: '/login' });
    fireEvent.click(screen.getAllByTestId('seed-user')[2]);

    await waitFor(() => expect(localStorage.getItem('lumen.token')).toBe('h.e30.s'));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/identity/login');
    expect(JSON.parse(init.body)).toEqual({ email: 'maya@northwind.example', password: 'lumen-demo' });
  });

  it('shows the backend error on bad credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 })),
    );
    renderWithProviders(<LoginPage />, { route: '/login' });
    fireEvent.click(screen.getAllByTestId('seed-user')[0]);
    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
  });
});
