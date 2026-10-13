package studio.lumen.assets.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import studio.lumen.assets.api.ApiException;
import studio.lumen.assets.api.Dtos.AssetDto;
import studio.lumen.assets.api.Dtos.RenditionDto;
import studio.lumen.assets.api.Dtos.VersionDto;
import studio.lumen.assets.auth.Caller;
import studio.lumen.assets.storage.AssetRepository;
import studio.lumen.assets.storage.AssetRepository.AssetFilter;
import studio.lumen.assets.storage.AssetRepository.AssetRow;
import studio.lumen.assets.storage.AssetRepository.BlobRow;
import studio.lumen.assets.storage.AssetRepository.RenditionRow;
import studio.lumen.assets.storage.AssetRepository.VersionRow;
import studio.lumen.assets.storage.BlobStore;
import studio.lumen.assets.storage.ImageInspector;
import studio.lumen.assets.storage.ImageInspector.Dimensions;
import studio.lumen.assets.storage.ImageInspector.ImageType;
import studio.lumen.assets.webhook.RenditionsNotifier;

@Service
public class AssetService {

    public static final long MAX_UPLOAD_BYTES = 25L * 1024 * 1024;

    private static final Pattern PRESET = Pattern.compile("[a-z0-9_]{1,64}");
    private static final int MAX_FILENAME_LENGTH = 255;

    private final AssetRepository repo;
    private final BlobStore blobs;
    private final RenditionsNotifier notifier;

    public AssetService(AssetRepository repo, BlobStore blobs, RenditionsNotifier notifier) {
        this.repo = repo;
        this.blobs = blobs;
        this.notifier = notifier;
    }

    /** A validated image upload, already read into memory (uploads are capped at 25 MB). */
    private record Upload(byte[] data, String filename, ImageType type, Dimensions dimensions) {
    }

    // Queries

    @Transactional(readOnly = true)
    public List<AssetDto> list(Caller caller, String query, String tag, Long ownerId) {
        Long workspace = caller.internal() ? null : caller.workspaceId().longValue();
        AssetFilter filter = new AssetFilter(workspace, blankToNull(query), normalizeTag(tag), ownerId);
        return repo.listAssets(filter).stream().map(a -> toAsset(a, false)).toList();
    }

    @Transactional(readOnly = true)
    public AssetDto get(Caller caller, long assetId) {
        return toAsset(visibleAsset(caller, assetId), true);
    }

    @Transactional(readOnly = true)
    public VersionDto getVersion(Caller caller, long assetId, int version) {
        visibleAsset(caller, assetId);
        return repo.findVersion(assetId, version)
                .map(this::toVersion)
                .orElseThrow(() -> ApiException.notFound("Version not found"));
    }

    @Transactional(readOnly = true)
    public BlobRow blob(String sha256) {
        if (!BlobStore.isValidHash(sha256)) {
            throw ApiException.notFound("Blob not found");
        }
        return repo.findBlob(sha256).orElseThrow(() -> ApiException.notFound("Blob not found"));
    }

    // Commands

    @Transactional
    public AssetDto create(Caller caller, MultipartFile file, String title, String description, String tags,
            String altText) {
        String cleanTitle = title == null ? "" : title.trim();
        if (cleanTitle.isEmpty()) {
            throw ApiException.badRequest("title is required");
        }
        Upload upload = validateUpload(file);

        String now = Timestamps.now();
        long assetId = repo.insertAsset(caller.workspaceId(), cleanTitle, nullToEmpty(description).trim(),
                caller.userId(), now);
        repo.insertTags(assetId, parseTags(tags));
        storeVersion(assetId, 1, upload, altText, caller.userId(), now);

        return toAsset(repo.findAsset(assetId).orElseThrow(), true);
    }

    @Transactional
    public VersionDto addVersion(Caller caller, long assetId, MultipartFile file, String altText) {
        visibleAsset(caller, assetId);
        Upload upload = validateUpload(file);

        String now = Timestamps.now();
        int version = repo.nextVersionNumber(assetId);
        storeVersion(assetId, version, upload, altText, caller.userId(), now);
        repo.touchAsset(assetId, now);

        return toVersion(repo.findVersion(assetId, version).orElseThrow());
    }

    @Transactional
    public RenditionDto registerRendition(long assetId, int version, String preset, int width, int height,
            MultipartFile file) {
        if (preset == null || !PRESET.matcher(preset).matches()) {
            throw ApiException.badRequest("preset is invalid");
        }
        if (width <= 0 || height <= 0) {
            throw ApiException.badRequest("width and height must be positive");
        }
        VersionRow source = repo.findVersion(assetId, version)
                .orElseThrow(() -> ApiException.notFound("Version not found"));
        byte[] data = readNonEmpty(file);
        ImageType type = ImageInspector.detect(data)
                .orElseThrow(() -> ApiException.badRequest("Rendition must be a JPEG or PNG image"));

        String now = Timestamps.now();
        String sha = blobs.put(data);
        String filename = stem(source.filename()) + "_" + preset + ".jpg";
        repo.insertBlobIfAbsent(new BlobRow(sha, filename, type.contentType(), data.length), now);
        RenditionRow row = new RenditionRow(assetId, version, preset, width, height, sha, now);
        repo.upsertRendition(row);
        return toRendition(row);
    }

    // Helpers

    private void storeVersion(long assetId, int version, Upload upload, String altText, long userId, String now) {
        String sha = blobs.put(upload.data());
        repo.insertBlobIfAbsent(new BlobRow(sha, upload.filename(), upload.type().contentType(),
                upload.data().length), now);
        repo.insertVersion(new VersionRow(assetId, version, upload.filename(), upload.type().contentType(),
                upload.data().length, upload.dimensions().width(), upload.dimensions().height(), sha,
                nullToEmpty(altText).trim(), userId, now));

        // Only ask for renditions once the version is committed and readable by other services.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                notifier.versionStored(assetId, version, sha);
            }
        });
    }

    private Upload validateUpload(MultipartFile file) {
        if (file != null && file.getSize() > MAX_UPLOAD_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "File exceeds the 25 MB limit");
        }
        byte[] data = readNonEmpty(file);
        ImageType declared = ImageInspector.fromContentType(file.getContentType())
                .orElseThrow(() -> ApiException.badRequest("Only PNG and JPEG images are accepted"));
        ImageType actual = ImageInspector.detect(data)
                .orElseThrow(() -> ApiException.badRequest("Only PNG and JPEG images are accepted"));
        if (declared != actual) {
            throw ApiException.badRequest("File content does not match its content type");
        }
        Dimensions dims = ImageInspector.dimensions(data)
                .filter(d -> d.width() > 0 && d.height() > 0)
                .orElseThrow(() -> ApiException.badRequest("Image could not be read"));
        return new Upload(data, cleanFilename(file.getOriginalFilename(), actual), actual, dims);
    }

    private static byte[] readNonEmpty(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("file is required");
        }
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read upload", e);
        }
    }

    private AssetRow visibleAsset(Caller caller, long assetId) {
        return repo.findAsset(assetId)
                .filter(a -> caller.canAccessWorkspace(a.workspaceId()))
                .orElseThrow(() -> ApiException.notFound("Asset not found"));
    }

    private AssetDto toAsset(AssetRow a, boolean withVersions) {
        VersionDto latest = repo.latestVersion(a.id()).map(this::toVersion).orElse(null);
        List<VersionDto> versions = withVersions
                ? repo.versionsFor(a.id()).stream().map(this::toVersion).toList()
                : null;
        return new AssetDto(a.id(), a.workspaceId(), a.title(), a.description(), a.ownerId(),
                repo.tagsFor(a.id()), a.createdAt(), a.updatedAt(), latest, versions);
    }

    private VersionDto toVersion(VersionRow v) {
        List<RenditionDto> renditions = repo.renditionsFor(v.assetId(), v.version()).stream()
                .map(AssetService::toRendition)
                .toList();
        return new VersionDto(v.assetId(), v.version(), v.filename(), v.contentType(), v.sizeBytes(), v.width(),
                v.height(), v.sha256(), blobUrl(v.sha256()), v.altText(), v.createdBy(), v.createdAt(),
                renditions);
    }

    private static RenditionDto toRendition(RenditionRow r) {
        return new RenditionDto(r.preset(), r.width(), r.height(), r.sha256(), blobUrl(r.sha256()), r.createdAt());
    }

    private static String blobUrl(String sha256) {
        return "/blobs/" + sha256;
    }

    /** Splits a comma separated tag list into trimmed, lowercased, de-duplicated tags. */
    static Set<String> parseTags(String raw) {
        Set<String> tags = new LinkedHashSet<>();
        if (raw == null) {
            return tags;
        }
        Arrays.stream(raw.split(","))
                .map(AssetService::normalizeTag)
                .filter(t -> t != null)
                .forEach(tags::add);
        return tags;
    }

    private static String normalizeTag(String tag) {
        if (tag == null) {
            return null;
        }
        String t = tag.trim().toLowerCase();
        return t.isEmpty() ? null : t;
    }

    /** Keeps only the final path segment of a client-supplied filename. */
    static String cleanFilename(String original, ImageType type) {
        String name = original == null ? "" : original;
        name = name.substring(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
        name = name.replaceAll("\\p{Cntrl}", "").trim();
        if (name.isEmpty() || name.equals(".") || name.equals("..")) {
            name = "upload." + type.extension();
        }
        if (name.length() > MAX_FILENAME_LENGTH) {
            name = name.substring(name.length() - MAX_FILENAME_LENGTH);
        }
        return name;
    }

    static String stem(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.substring(0, dot) : filename;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}
