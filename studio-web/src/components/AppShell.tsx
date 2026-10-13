import { ActionButton, Flex, Item, Menu, MenuTrigger, Section, Text, View } from '@adobe/react-spectrum';
import Light from '@spectrum-icons/workflow/Light';
import Moon from '@spectrum-icons/workflow/Moon';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '../api/identity';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../lib/theme';
import { useDirectory } from '../lib/users';
import { AppTile } from './AppTile';
import { UserAvatar } from './UserAvatar';

const NAV = [
  { to: '/library', label: 'Library' },
  { to: '/campaigns', label: 'Campaigns' },
  { to: '/brand', label: 'Brand Kit' },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const { workspace } = useDirectory();
  const { colorScheme, toggle } = useTheme();
  const navigate = useNavigate();

  const signOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <Flex direction="column" minHeight="100vh">
      <View
        elementType="header"
        backgroundColor="gray-75"
        borderBottomWidth="thin"
        borderBottomColor="gray-300"
        paddingX="size-300"
        paddingY="size-100"
      >
        <Flex alignItems="center" gap="size-200" wrap>
          <NavLink to="/library" className="brand-link" aria-label="Lumen Studio home">
            <AppTile size={32} title="" />
            <Text UNSAFE_className="brand-name">Lumen Studio</Text>
          </NavLink>
          {workspace && (
            <Text UNSAFE_className="workspace-name" data-testid="workspace-name">
              {workspace.name}
            </Text>
          )}
          <nav className="main-nav" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className="main-nav-link">
                {item.label}
              </NavLink>
            ))}
          </nav>
          <View flexGrow={1} />
          <ActionButton
            isQuiet
            onPress={toggle}
            aria-label={colorScheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            data-testid="theme-toggle"
          >
            {colorScheme === 'dark' ? <Light /> : <Moon />}
          </ActionButton>
          {user && (
            <MenuTrigger align="end">
              <ActionButton isQuiet aria-label={`Account: ${user.name}`} data-testid="user-menu">
                <UserAvatar name={user.name} color={user.avatar_color} />
              </ActionButton>
              <Menu onAction={(key) => key === 'signout' && signOut()}>
                <Section title={`${user.name} (${ROLE_LABELS[user.role] ?? user.role})`}>
                  <Item key="signout">Sign out</Item>
                </Section>
              </Menu>
            </MenuTrigger>
          )}
        </Flex>
      </View>
      <View elementType="main" flexGrow={1} paddingX="size-300" paddingY="size-300">
        <Outlet />
      </View>
    </Flex>
  );
}
