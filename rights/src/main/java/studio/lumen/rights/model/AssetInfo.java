package studio.lumen.rights.model;

/**
 * The parts of an assets-service asset this service needs.
 */
public class AssetInfo {

    private Long id;
    private Long workspaceId;
    private String title;

    public AssetInfo() {
    }

    public AssetInfo(Long id, Long workspaceId, String title) {
        this.id = id;
        this.workspaceId = workspaceId;
        this.title = title;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getWorkspaceId() {
        return workspaceId;
    }

    public void setWorkspaceId(Long workspaceId) {
        this.workspaceId = workspaceId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }
}
