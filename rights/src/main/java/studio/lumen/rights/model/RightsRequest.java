package studio.lumen.rights.model;

import java.util.List;

/**
 * Body of PUT /rights/{asset_id}. Server-owned fields (asset_id, workspace_id,
 * updated_by, updated_at) are ignored if a client sends them.
 */
public class RightsRequest {

    private String licenseType;
    private String licensor;
    private List<String> channels;
    private String validFrom;
    private String expiresOn;
    private Boolean modelReleaseRequired;
    private Boolean modelReleaseOnFile;
    private String notes;

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

    public Boolean getModelReleaseRequired() {
        return modelReleaseRequired;
    }

    public void setModelReleaseRequired(Boolean modelReleaseRequired) {
        this.modelReleaseRequired = modelReleaseRequired;
    }

    public Boolean getModelReleaseOnFile() {
        return modelReleaseOnFile;
    }

    public void setModelReleaseOnFile(Boolean modelReleaseOnFile) {
        this.modelReleaseOnFile = modelReleaseOnFile;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }
}
