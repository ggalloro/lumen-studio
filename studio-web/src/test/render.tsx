import { defaultTheme, Provider } from '@adobe/react-spectrum';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';

/** Renders inside the same providers the app uses, at the given route. */
export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Provider theme={defaultTheme} colorScheme="dark">
          {ui}
        </Provider>
      </AuthProvider>
    </MemoryRouter>,
  );
}
