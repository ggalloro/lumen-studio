package studio.lumen.assets.storage;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** JDBC access to the assets database. */
@Repository
public class AssetRepository {

    public record AssetRow(long id, long workspaceId, String title, String description, long ownerId,
            String createdAt, String updatedAt) {
    }

    public record VersionRow(long assetId, int version, String filename, String contentType, long sizeBytes,
            int width, int height, String sha256, String altText, long createdBy, String createdAt) {
    }

    public record RenditionRow(long assetId, int version, String preset, int width, int height, String sha256,
            String createdAt) {
    }

    public record BlobRow(String sha256, String filename, String contentType, long sizeBytes) {
    }

    /** Optional filters for {@link #listAssets}. Null fields are ignored. */
    public record AssetFilter(Long workspaceId, String query, String tag, Long ownerId) {
    }

    private static final RowMapper<AssetRow> ASSET = (rs, i) -> new AssetRow(
            rs.getLong("id"), rs.getLong("workspace_id"), rs.getString("title"), rs.getString("description"),
            rs.getLong("owner_id"), rs.getString("created_at"), rs.getString("updated_at"));

    private static final RowMapper<VersionRow> VERSION = (rs, i) -> new VersionRow(
            rs.getLong("asset_id"), rs.getInt("version"), rs.getString("filename"), rs.getString("content_type"),
            rs.getLong("size_bytes"), rs.getInt("width"), rs.getInt("height"), rs.getString("sha256"),
            rs.getString("alt_text"), rs.getLong("created_by"), rs.getString("created_at"));

    private static final RowMapper<RenditionRow> RENDITION = (rs, i) -> new RenditionRow(
            rs.getLong("asset_id"), rs.getInt("version"), rs.getString("preset"), rs.getInt("width"),
            rs.getInt("height"), rs.getString("sha256"), rs.getString("created_at"));

    private static final RowMapper<BlobRow> BLOB = (rs, i) -> new BlobRow(
            rs.getString("sha256"), rs.getString("filename"), rs.getString("content_type"),
            rs.getLong("size_bytes"));

    private final JdbcTemplate jdbc;

    public AssetRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // Assets

    public long insertAsset(long workspaceId, String title, String description, long ownerId, String now) {
        return jdbc.queryForObject("""
                INSERT INTO assets (workspace_id, title, description, owner_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, workspaceId, title, description, ownerId, now, now);
    }

    public void touchAsset(long id, String now) {
        jdbc.update("UPDATE assets SET updated_at = ? WHERE id = ?", now, id);
    }

    public Optional<AssetRow> findAsset(long id) {
        return jdbc.query("SELECT * FROM assets WHERE id = ?", ASSET, id).stream().findFirst();
    }

    public List<AssetRow> listAssets(AssetFilter filter) {
        StringBuilder sql = new StringBuilder("SELECT a.* FROM assets a WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        if (filter.workspaceId() != null) {
            sql.append(" AND a.workspace_id = ?");
            args.add(filter.workspaceId());
        }
        if (filter.query() != null) {
            String pattern = "%" + escapeLike(filter.query().toLowerCase()) + "%";
            sql.append(" AND (lower(a.title) LIKE ? ESCAPE '\\' OR lower(a.description) LIKE ? ESCAPE '\\')");
            args.add(pattern);
            args.add(pattern);
        }
        if (filter.tag() != null) {
            sql.append(" AND EXISTS (SELECT 1 FROM asset_tags t WHERE t.asset_id = a.id AND t.tag = ?)");
            args.add(filter.tag());
        }
        if (filter.ownerId() != null) {
            sql.append(" AND a.owner_id = ?");
            args.add(filter.ownerId());
        }
        sql.append(" ORDER BY a.updated_at DESC, a.id DESC");
        return jdbc.query(sql.toString(), ASSET, args.toArray());
    }

    // Tags

    public void insertTags(long assetId, Collection<String> tags) {
        for (String tag : tags) {
            jdbc.update("INSERT OR IGNORE INTO asset_tags (asset_id, tag) VALUES (?, ?)", assetId, tag);
        }
    }

    public List<String> tagsFor(long assetId) {
        return jdbc.queryForList("SELECT tag FROM asset_tags WHERE asset_id = ? ORDER BY rowid", String.class,
                assetId);
    }

    // Versions

    public int nextVersionNumber(long assetId) {
        Integer next = jdbc.queryForObject("SELECT COALESCE(MAX(version), 0) + 1 FROM versions WHERE asset_id = ?",
                Integer.class, assetId);
        return next == null ? 1 : next;
    }

    public void insertVersion(VersionRow v) {
        jdbc.update("""
                INSERT INTO versions (asset_id, version, filename, content_type, size_bytes, width, height,
                                      sha256, alt_text, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, v.assetId(), v.version(), v.filename(), v.contentType(), v.sizeBytes(), v.width(),
                v.height(), v.sha256(), v.altText(), v.createdBy(), v.createdAt());
    }

    public Optional<VersionRow> findVersion(long assetId, int version) {
        return jdbc.query("SELECT * FROM versions WHERE asset_id = ? AND version = ?", VERSION, assetId, version)
                .stream().findFirst();
    }

    public Optional<VersionRow> latestVersion(long assetId) {
        return jdbc.query("SELECT * FROM versions WHERE asset_id = ? ORDER BY version DESC LIMIT 1", VERSION,
                assetId).stream().findFirst();
    }

    public List<VersionRow> versionsFor(long assetId) {
        return jdbc.query("SELECT * FROM versions WHERE asset_id = ? ORDER BY version", VERSION, assetId);
    }

    // Renditions

    /** Inserts a rendition, replacing any existing one for the same asset, version and preset. */
    public void upsertRendition(RenditionRow r) {
        jdbc.update("""
                INSERT INTO renditions (asset_id, version, preset, width, height, sha256, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (asset_id, version, preset) DO UPDATE SET
                    width = excluded.width,
                    height = excluded.height,
                    sha256 = excluded.sha256,
                    created_at = excluded.created_at
                """, r.assetId(), r.version(), r.preset(), r.width(), r.height(), r.sha256(), r.createdAt());
    }

    public List<RenditionRow> renditionsFor(long assetId, int version) {
        return jdbc.query("SELECT * FROM renditions WHERE asset_id = ? AND version = ? ORDER BY preset",
                RENDITION, assetId, version);
    }

    // Blobs

    public void insertBlobIfAbsent(BlobRow b, String now) {
        jdbc.update("""
                INSERT OR IGNORE INTO blobs (sha256, filename, content_type, size_bytes, created_at)
                VALUES (?, ?, ?, ?, ?)
                """, b.sha256(), b.filename(), b.contentType(), b.sizeBytes(), now);
    }

    public Optional<BlobRow> findBlob(String sha256) {
        return jdbc.query("SELECT * FROM blobs WHERE sha256 = ?", BLOB, sha256).stream().findFirst();
    }

    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
