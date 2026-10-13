package studio.lumen.rights.dao;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import com.google.common.base.Joiner;
import com.google.common.base.Splitter;
import com.google.common.collect.Lists;

import studio.lumen.rights.model.RightsRecord;

@Repository
public class RightsDao {

    private static final String TABLE = "rights";

    private static final String COLUMNS = "asset_id, workspace_id, license_type, licensor, channels, "
            + "valid_from, expires_on, model_release_required, model_release_on_file, notes, "
            + "updated_by, updated_at";

    private static final Joiner CHANNEL_JOINER = Joiner.on(',');

    private static final Splitter CHANNEL_SPLITTER = Splitter.on(',').trimResults().omitEmptyStrings();

    private static final RowMapper<RightsRecord> ROW_MAPPER = new RowMapper<RightsRecord>() {
        @Override
        public RightsRecord mapRow(ResultSet rs, int rowNum) throws SQLException {
            RightsRecord record = new RightsRecord();
            record.setAssetId(rs.getLong("asset_id"));
            record.setWorkspaceId(rs.getLong("workspace_id"));
            record.setLicenseType(rs.getString("license_type"));
            record.setLicensor(rs.getString("licensor"));
            record.setChannels(splitChannels(rs.getString("channels")));
            record.setValidFrom(rs.getString("valid_from"));
            record.setExpiresOn(rs.getString("expires_on"));
            record.setModelReleaseRequired(rs.getInt("model_release_required") == 1);
            record.setModelReleaseOnFile(rs.getInt("model_release_on_file") == 1);
            record.setNotes(rs.getString("notes"));
            record.setUpdatedBy(rs.getLong("updated_by"));
            record.setUpdatedAt(rs.getString("updated_at"));
            return record;
        }
    };

    @Autowired
    private JdbcTemplate jdbcTemplate;

    public RightsRecord findByAssetId(Long assetId) {
        String sql = "SELECT " + COLUMNS + " FROM " + TABLE + " WHERE asset_id = ?";
        List<RightsRecord> results = jdbcTemplate.query(sql, new Object[] {assetId}, ROW_MAPPER);
        if (results.isEmpty()) {
            return null;
        }
        return results.get(0);
    }

    public List<RightsRecord> findAll() {
        String sql = "SELECT " + COLUMNS + " FROM " + TABLE + " ORDER BY asset_id";
        return jdbcTemplate.query(sql, ROW_MAPPER);
    }

    public List<RightsRecord> findByWorkspace(Long workspaceId) {
        String sql = "SELECT " + COLUMNS + " FROM " + TABLE + " WHERE workspace_id = ? ORDER BY asset_id";
        return jdbcTemplate.query(sql, new Object[] {workspaceId}, ROW_MAPPER);
    }

    /**
     * Inserts the record, or replaces the existing one for the same asset.
     */
    public void save(RightsRecord record) {
        String sql = "INSERT OR REPLACE INTO " + TABLE + " (" + COLUMNS + ") "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        jdbcTemplate.update(sql,
                record.getAssetId(),
                record.getWorkspaceId(),
                record.getLicenseType(),
                record.getLicensor(),
                joinChannels(record.getChannels()),
                record.getValidFrom(),
                record.getExpiresOn(),
                record.isModelReleaseRequired() ? 1 : 0,
                record.isModelReleaseOnFile() ? 1 : 0,
                record.getNotes(),
                record.getUpdatedBy(),
                record.getUpdatedAt());
    }

    public int deleteAll() {
        return jdbcTemplate.update("DELETE FROM " + TABLE);
    }

    static String joinChannels(List<String> channels) {
        return CHANNEL_JOINER.join(channels);
    }

    static List<String> splitChannels(String value) {
        if (value == null) {
            return Lists.newArrayList();
        }
        return Lists.newArrayList(CHANNEL_SPLITTER.split(value));
    }
}
