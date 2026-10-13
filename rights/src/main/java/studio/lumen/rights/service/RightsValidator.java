package studio.lumen.rights.service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.joda.time.LocalDate;
import org.springframework.stereotype.Component;

import com.google.common.base.Joiner;
import com.google.common.base.Strings;

import studio.lumen.rights.exception.BadRequestException;
import studio.lumen.rights.model.LicenseType;
import studio.lumen.rights.model.RightsRequest;
import studio.lumen.rights.util.DateUtils;

/**
 * Checks a PUT body and throws {@link BadRequestException} with the first problem found.
 */
@Component
public class RightsValidator {

    public static final String ALL_CHANNELS = "all";

    public void validate(RightsRequest request) {
        if (request == null) {
            throw new BadRequestException("Request body must be a JSON object");
        }

        if (Strings.isNullOrEmpty(request.getLicenseType())) {
            throw new BadRequestException("license_type is required");
        }
        if (LicenseType.fromCode(request.getLicenseType()) == null) {
            throw new BadRequestException("license_type must be one of "
                    + Joiner.on(", ").join(LicenseType.codes()));
        }

        List<String> channels = request.getChannels();
        if (channels == null || channels.isEmpty()) {
            throw new BadRequestException("channels must not be empty");
        }
        for (String channel : channels) {
            if (channel == null || channel.trim().isEmpty()) {
                throw new BadRequestException("channels must not contain empty values");
            }
            if (channel.indexOf(',') >= 0) {
                throw new BadRequestException("channels must not contain commas");
            }
        }
        List<String> normalized = normalizeChannels(channels);
        if (normalized.contains(ALL_CHANNELS) && normalized.size() > 1) {
            throw new BadRequestException("channels must be [\"all\"] or a list of preset ids, not both");
        }

        if (Strings.isNullOrEmpty(request.getValidFrom())) {
            throw new BadRequestException("valid_from is required");
        }
        LocalDate validFrom = DateUtils.parseDate(request.getValidFrom());
        if (validFrom == null) {
            throw new BadRequestException("valid_from must be a valid date in YYYY-MM-DD format");
        }

        if (request.getExpiresOn() != null) {
            LocalDate expiresOn = DateUtils.parseDate(request.getExpiresOn());
            if (expiresOn == null) {
                throw new BadRequestException("expires_on must be a valid date in YYYY-MM-DD format or null");
            }
            if (expiresOn.isBefore(validFrom)) {
                throw new BadRequestException("expires_on must not be before valid_from");
            }
        }

        boolean required = Boolean.TRUE.equals(request.getModelReleaseRequired());
        boolean onFile = Boolean.TRUE.equals(request.getModelReleaseOnFile());
        if (onFile && !required) {
            throw new BadRequestException(
                    "model_release_on_file cannot be true when model_release_required is false");
        }
    }

    /**
     * Trims channel ids and drops duplicates, keeping the original order.
     */
    public List<String> normalizeChannels(List<String> channels) {
        Set<String> unique = new LinkedHashSet<String>();
        for (String channel : channels) {
            unique.add(channel.trim());
        }
        return new ArrayList<String>(unique);
    }
}
