package studio.lumen.rights.model;

import java.io.Serializable;

/**
 * The user behind a request, as read from the identity JWT.
 */
public class Caller implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String ROLE_DESIGNER = "designer";
    public static final String ROLE_REVIEWER = "reviewer";
    public static final String ROLE_BRAND_ADMIN = "brand_admin";

    private Long userId;
    private Long workspaceId;
    private String role;
    private String name;

    public Caller() {
    }

    public Caller(Long userId, Long workspaceId, String role, String name) {
        this.userId = userId;
        this.workspaceId = workspaceId;
        this.role = role;
        this.name = name;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getWorkspaceId() {
        return workspaceId;
    }

    public void setWorkspaceId(Long workspaceId) {
        this.workspaceId = workspaceId;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public boolean canEditRights() {
        return ROLE_DESIGNER.equals(role) || ROLE_BRAND_ADMIN.equals(role);
    }

    @Override
    public String toString() {
        return "Caller{userId=" + userId + ", workspaceId=" + workspaceId + ", role=" + role + "}";
    }
}
