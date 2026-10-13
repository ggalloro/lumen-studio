package studio.lumen.rights.service;

import org.joda.time.LocalDate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.google.common.base.Preconditions;

import studio.lumen.rights.model.ClearanceResult;
import studio.lumen.rights.model.RightsRecord;
import studio.lumen.rights.util.DateUtils;

/**
 * Decides whether an asset may be used on a channel on a given date.
 */
@Service
public class ClearanceService {

    public static final String NO_RIGHTS = "No usage rights on file";
    public static final String STARTS_ON = "Rights start on %s";
    public static final String EXPIRED_ON = "License expired on %s";
    public static final String NOT_LICENSED_FOR = "Not licensed for %s";
    public static final String MODEL_RELEASE_MISSING = "Model release missing";

    @Autowired
    private RightsService rightsService;

    /**
     * @param workspaceId the caller's workspace, or null for internal callers
     */
    public ClearanceResult check(Long assetId, String channel, LocalDate date, Long workspaceId) {
        RightsRecord record = rightsService.find(assetId, workspaceId);
        return evaluate(assetId, record, channel, date);
    }

    public ClearanceResult evaluate(Long assetId, RightsRecord record, String channel, LocalDate date) {
        Preconditions.checkNotNull(channel, "channel");
        Preconditions.checkNotNull(date, "date");

        ClearanceResult result = new ClearanceResult();
        result.setAssetId(assetId);
        result.setChannel(channel);
        result.setDate(DateUtils.formatDate(date));

        if (record == null) {
            result.addReason(NO_RIGHTS);
            return result;
        }

        LocalDate validFrom = DateUtils.parseDate(record.getValidFrom());
        if (validFrom != null && date.isBefore(validFrom)) {
            result.addReason(String.format(STARTS_ON, DateUtils.formatDate(validFrom)));
        }

        LocalDate expiresOn = DateUtils.parseDate(record.getExpiresOn());
        if (expiresOn != null && date.isAfter(expiresOn)) {
            result.addReason(String.format(EXPIRED_ON, DateUtils.formatDate(expiresOn)));
        }

        if (!coversChannel(record, channel)) {
            result.addReason(String.format(NOT_LICENSED_FOR, channel));
        }

        if (record.isModelReleaseRequired() && !record.isModelReleaseOnFile()) {
            result.addReason(MODEL_RELEASE_MISSING);
        }
        return result;
    }

    private boolean coversChannel(RightsRecord record, String channel) {
        if (record.getChannels() == null) {
            return false;
        }
        if (record.getChannels().size() == 1 && RightsValidator.ALL_CHANNELS.equals(record.getChannels().get(0))) {
            return true;
        }
        return record.getChannels().contains(channel);
    }
}
