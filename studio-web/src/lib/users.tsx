import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { identityApi, type User, type Workspace } from '../api/identity';
import { useAuth } from '../auth/AuthContext';
import { useAsync } from './useAsync';

interface DirectoryState {
  users: User[];
  byId: Map<number, User>;
  workspace: Workspace | undefined;
}

const DirectoryContext = createContext<DirectoryState>({
  users: [],
  byId: new Map(),
  workspace: undefined,
});

/** Loads the workspace's users and name once for the signed-in session. */
export function DirectoryProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const workspaceId = user?.workspace_id;

  const users = useAsync(
    () => (token ? identityApi.listUsers().then((r) => r.items) : Promise.resolve([])),
    [token],
  );
  const workspace = useAsync(
    () => (token && workspaceId ? identityApi.getWorkspace(workspaceId) : Promise.resolve(undefined)),
    [token, workspaceId],
  );

  const value = useMemo(() => {
    const list = users.data ?? [];
    return { users: list, byId: new Map(list.map((u) => [u.id, u])), workspace: workspace.data };
  }, [users.data, workspace.data]);

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

export function useDirectory(): DirectoryState {
  return useContext(DirectoryContext);
}

export function useUserName(id: number | undefined): string {
  const { byId } = useDirectory();
  if (id === undefined) return '';
  return byId.get(id)?.name ?? `User ${id}`;
}
