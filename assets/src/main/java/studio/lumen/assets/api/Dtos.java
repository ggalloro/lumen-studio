package studio.lumen.assets.api;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

/** JSON shapes from docs/api.md. Property names are snake_cased by the global Jackson config. */
public final class Dtos {

    private Dtos() {
    }

    public record RenditionDto(
            String preset,
            int width,
            int height,
            String sha256,
            String blobUrl,
            String createdAt) {
    }

    public record VersionDto(
            long assetId,
            int version,
            String filename,
            String contentType,
            long sizeBytes,
            int width,
            int height,
            String sha256,
            String blobUrl,
            String altText,
            long createdBy,
            String createdAt,
            List<RenditionDto> renditions) {
    }

    public record AssetDto(
            long id,
            long workspaceId,
            String title,
            String description,
            long ownerId,
            List<String> tags,
            String createdAt,
            String updatedAt,
            VersionDto latestVersion,
            // Only present on GET /assets/{id} and on create.
            @JsonInclude(JsonInclude.Include.NON_NULL) List<VersionDto> versions) {
    }

    public record AssetList(List<AssetDto> items) {
    }

    public record Health(String status, String service) {
    }
}
