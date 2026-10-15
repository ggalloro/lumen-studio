import { Button, Flex, Form, Heading, Text, TextField, View } from '@adobe/react-spectrum';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ROLE_LABELS } from '../api/identity';
import { useAuth } from '../auth/AuthContext';
import { AppTile } from '../components/AppTile';
import { ErrorMessage } from '../components/ErrorMessage';
import { UserAvatar } from '../components/UserAvatar';
import { SEED_PASSWORD, SEED_USERS } from '../lib/seedUsers';

function safeRedirect(from: string | null): string {
  // Only allow same-origin paths.
  if (from && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/login')) return from;
  return '/library';
}

export function LoginPage() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const target = safeRedirect(params.get('from'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (token) return <Navigate to={target} replace />;

  const signIn = async (e: string, p: string) => {
    setBusy(true);
    setError(null);
    try {
      await login(e, p);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex justifyContent="center" alignItems="start" minHeight="100vh" UNSAFE_className="login-page">
      <View
        width="100%"
        maxWidth="size-6000"
        marginTop="size-1000"
        padding="size-400"
        backgroundColor="gray-75"
        borderRadius="large"
        borderWidth="thin"
        borderColor="gray-300"
      >
        <Flex direction="column" gap="size-300">
          <Flex alignItems="center" gap="size-150">
            <AppTile size={44} />
            <Heading level={1} margin={0}>
              Lumen Studio
            </Heading>
          </Flex>

          <View>
            <Heading level={2} marginTop={0} marginBottom="size-100">
              Sign in as
            </Heading>
            <ul className="seed-users" aria-label="Sample users">
              {SEED_USERS.map((u) => (
                <li key={u.email}>
                  <button
                    type="button"
                    className="seed-user-button"
                    disabled={busy}
                    data-testid="seed-user"
                    onClick={() => {
                      setEmail(u.email);
                      setPassword(SEED_PASSWORD);
                      void signIn(u.email, SEED_PASSWORD);
                    }}
                  >
                    <UserAvatar name={u.name} color={u.avatar_color} size={32} />
                    <span className="seed-user-text">
                      <span className="seed-user-name">{u.name}</span>
                      <span className="seed-user-meta">
                        {ROLE_LABELS[u.role]} · {u.email}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </View>

          <Form
            aria-label="Sign in with email"
            onSubmit={(e) => {
              e.preventDefault();
              void signIn(email.trim(), password);
            }}
          >
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="username"
              data-testid="email"
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              data-testid="password"
              description={`Sample users share the password ${SEED_PASSWORD}`}
            />
            <ErrorMessage error={error} title="Sign in failed" />
            <Button type="submit" variant="accent" isDisabled={busy || !email || !password} data-testid="login-submit">
              Sign in
            </Button>
          </Form>
          <Text UNSAFE_className="muted">All data in this workspace is synthetic.</Text>
        </Flex>
      </View>
    </Flex>
  );
}
