package studio.lumen.rights.service;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.google.common.base.Preconditions;
import com.google.common.base.Predicate;
import com.google.common.base.Strings;
import com.google.common.collect.Iterables;
import com.google.common.collect.Lists;

import studio.lumen.rights.client.AssetsClient;
import studio.lumen.rights.dao.RightsDao;
import studio.lumen.rights.exception.NotFoundException;
import studio.lumen.rights.model.AssetInfo;
import studio.lumen.rights.model.Caller;
import studio.lumen.rights.model.RightsRecord;
import studio.lumen.rights.model.RightsRequest;
import studio.lumen.rights.util.DateProvider;
import studio.lumen.rights.util.DateUtils;

@Service
public class RightsService {

    private static final Logger LOG = LoggerFactory.getLogger(RightsService.class);

    @Autowired
    private RightsDao rightsDao;

    @Autowired
    private AssetsClient assetsClient;

    @Autowired
    private RightsValidator rightsValidator;

    @Autowired
    private DateProvider dateProvider;

    /**
     * Lists records visible to the caller.
     *
     * @param workspaceId the caller's workspace, or null to list every workspace
     * @param assetId optional asset filter
     */
    public List<RightsRecord> list(final Long workspaceId, Long assetId) {
        List<RightsRecord> records;
        if (assetId != null) {
            RightsRecord record = rightsDao.findByAssetId(assetId);
            records = record == null ? Lists.<RightsRecord>newArrayList() : Lists.newArrayList(record);
        } else if (workspaceId != null) {
            return rightsDao.findByWorkspace(workspaceId);
        } else {
            return rightsDao.findAll();
        }

        if (workspaceId == null) {
            return records;
        }
        return Lists.newArrayList(Iterables.filter(records, new Predicate<RightsRecord>() {
            @Override
            public boolean apply(RightsRecord input) {
                return workspaceId.equals(input.getWorkspaceId());
            }
        }));
    }

    /**
     * @param workspaceId the caller's workspace, or null to skip the workspace check
     * @return the record, or null if there is none visible to the caller
     */
    public RightsRecord find(Long assetId, Long workspaceId) {
        RightsRecord record = rightsDao.findByAssetId(assetId);
        if (record == null) {
            return null;
        }
        if (workspaceId != null && !workspaceId.equals(record.getWorkspaceId())) {
            return null;
        }
        return record;
    }

    public RightsRecord save(Long assetId, RightsRequest request, Caller caller) {
        Preconditions.checkNotNull(assetId, "assetId");
        Preconditions.checkNotNull(caller, "caller");

        rightsValidator.validate(request);

        AssetInfo asset = assetsClient.findAsset(assetId);
        if (asset == null) {
            throw new NotFoundException("Asset " + assetId + " not found");
        }
        if (!asset.getWorkspaceId().equals(caller.getWorkspaceId())) {
            LOG.info("User {} tried to edit rights for asset {} in workspace {}",
                    caller.getUserId(), assetId, asset.getWorkspaceId());
            throw new NotFoundException("Asset " + assetId + " not found");
        }

        RightsRecord record = new RightsRecord();
        record.setAssetId(assetId);
        record.setWorkspaceId(asset.getWorkspaceId());
        record.setLicenseType(request.getLicenseType());
        record.setLicensor(Strings.nullToEmpty(request.getLicensor()));
        record.setChannels(rightsValidator.normalizeChannels(request.getChannels()));
        record.setValidFrom(request.getValidFrom());
        record.setExpiresOn(request.getExpiresOn());
        record.setModelReleaseRequired(Boolean.TRUE.equals(request.getModelReleaseRequired()));
        record.setModelReleaseOnFile(Boolean.TRUE.equals(request.getModelReleaseOnFile()));
        record.setNotes(Strings.nullToEmpty(request.getNotes()));
        record.setUpdatedBy(caller.getUserId());
        record.setUpdatedAt(DateUtils.formatTimestamp(dateProvider.now()));

        rightsDao.save(record);
        LOG.info("Saved rights for asset {} (workspace {}) by user {}",
                assetId, record.getWorkspaceId(), caller.getUserId());
        return rightsDao.findByAssetId(assetId);
    }
}
