package studio.lumen.rights.model;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;

/**
 * One usage-rights record. Dates are kept as YYYY-MM-DD strings and the
 * timestamp as an ISO 8601 UTC string, exactly as they are stored and sent.
 */
@JsonPropertyOrder({"asset_id", "workspace_id", "license_type", "licensor", "channels",
        "valid_from", "expires_on", "model_release_required", "model_release_on_file",
        "notes", "updated_by", "updated_at"})
public class RightsRecord {

    private Long assetId;
    private Long workspaceId;
    private String licenseType;
    private String licensor;
    private List<String> channels = new ArrayList<String>();
    private String validFrom;
    private String expiresOn;
    private boolean modelReleaseRequired;
    private boolean modelReleaseOnFile;
    private String notes;
    private Long updatedBy;
    private String updatedAt;

    public Long getAssetId() {
        return assetId;
    }

    public void setAssetId(Long assetId) {
        this.assetId = assetId;
    }

    public Long getWorkspaceId() {
        return workspaceId;
    }

    public void setWorkspaceId(Long workspaceId) {
        this.workspaceId = workspaceId;
    }

    public String getLicenseType() {
        return licenseType;
    }

    public void setLicenseType(String licenseType) {
        this.licenseType = licenseType;
    }

    public String getLicensor() {
        return licensor;
    }

    public void setLicensor(String licensor) {
        this.licensor = licensor;
    }

    public List<String> getChannels() {
        return channels;
    }

    public void setChannels(List<String> channels) {
        this.channels = channels;
    }

    public String getValidFrom() {
        return validFrom;
    }

    public void setValidFrom(String validFrom) {
        this.validFrom = validFrom;
    }

    public String getExpiresOn() {
        return expiresOn;
    }

    public void setExpiresOn(String expiresOn) {
        this.expiresOn = expiresOn;
    }

    public boolean isModelReleaseRequired() {
        return modelReleaseRequired;
    }

    public void setModelReleaseRequired(boolean modelReleaseRequired) {
        this.modelReleaseRequired = modelReleaseRequired;
    }

    public boolean isModelReleaseOnFile() {
        return modelReleaseOnFile;
    }

    public void setModelReleaseOnFile(boolean modelReleaseOnFile) {
        this.modelReleaseOnFile = modelReleaseOnFile;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Long getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(Long updatedBy) {
        this.updatedBy = updatedBy;
    }

    public String getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(String updatedAt) {
        this.updatedAt = updatedAt;
    }

    @Override
    public String toString() {
        return "RightsRecord{assetId=" + assetId + ", workspaceId=" + workspaceId
                + ", licenseType=" + licenseType + ", channels=" + channels + "}";
    }
}
