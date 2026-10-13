package studio.lumen.assets.auth;

/**
 * The authenticated party for a request: either an end user (from the JWT) or another
 * service (internal token). Internal callers see every workspace.
 */
public record Caller(boolean internal, Integer userId, Integer workspaceId, String role, String name) {

    public static final String REQUEST_ATTRIBUTE = Caller.class.getName();

    public static Caller internalService() {
        return new Caller(true, null, null, null, null);
    }

    public static Caller user(int userId, int workspaceId, String role, String name) {
        return new Caller(false, userId, workspaceId, role, name);
    }

    /** True when this caller may see data belonging to the given workspace. */
    public boolean canAccessWorkspace(long workspaceId) {
        return internal || (this.workspaceId != null && this.workspaceId == workspaceId);
    }
}
