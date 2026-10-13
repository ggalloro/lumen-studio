package studio.lumen.rights.web;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.servlet.http.HttpServletRequest;

import org.joda.time.LocalDate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.google.common.base.Strings;

import studio.lumen.rights.exception.BadRequestException;
import studio.lumen.rights.exception.ForbiddenException;
import studio.lumen.rights.exception.NotFoundException;
import studio.lumen.rights.exception.UnauthorizedException;
import studio.lumen.rights.model.Caller;
import studio.lumen.rights.model.ClearanceResult;
import studio.lumen.rights.model.RightsRecord;
import studio.lumen.rights.model.RightsRequest;
import studio.lumen.rights.service.ClearanceService;
import studio.lumen.rights.service.RightsService;
import studio.lumen.rights.util.DateProvider;
import studio.lumen.rights.util.DateUtils;

@RestController
@RequestMapping("/rights")
public class RightsController {

    @Autowired
    private RightsService rightsService;

    @Autowired
    private ClearanceService clearanceService;

    @Autowired
    private DateProvider dateProvider;

    @RequestMapping(method = RequestMethod.GET, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> list(
            @RequestParam(value = "asset_id", required = false) String assetIdParam,
            HttpServletRequest request) {
        Long assetId = null;
        if (!Strings.isNullOrEmpty(assetIdParam)) {
            assetId = parseId(assetIdParam, "asset_id");
        }
        List<RightsRecord> items = rightsService.list(workspaceFilter(request), assetId);

        Map<String, Object> body = new HashMap<String, Object>();
        body.put("items", items);
        return ResponseEntity.ok(body);
    }

    @RequestMapping(value = "/{assetId}", method = RequestMethod.GET, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<RightsRecord> get(@PathVariable("assetId") String assetIdParam,
            HttpServletRequest request) {
        Long assetId = parseId(assetIdParam, "asset_id");
        RightsRecord record = rightsService.find(assetId, workspaceFilter(request));
        if (record == null) {
            throw new NotFoundException("No usage rights on file for asset " + assetId);
        }
        return ResponseEntity.ok(record);
    }

    @RequestMapping(value = "/{assetId}", method = RequestMethod.PUT,
            consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<RightsRecord> put(@PathVariable("assetId") String assetIdParam,
            @RequestBody(required = false) RightsRequest body,
            HttpServletRequest request) {
        Caller caller = (Caller) request.getAttribute(AuthInterceptor.CALLER_ATTRIBUTE);
        if (caller == null) {
            throw new UnauthorizedException("Missing or invalid bearer token");
        }
        if (!caller.canEditRights()) {
            throw new ForbiddenException("Only designers and brand admins can edit usage rights");
        }
        Long assetId = parseId(assetIdParam, "asset_id");
        RightsRecord saved = rightsService.save(assetId, body, caller);
        return ResponseEntity.ok(saved);
    }

    @RequestMapping(value = "/{assetId}/clearance", method = RequestMethod.GET,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ClearanceResult> clearance(@PathVariable("assetId") String assetIdParam,
            @RequestParam(value = "channel", required = false) String channel,
            @RequestParam(value = "date", required = false) String dateParam,
            HttpServletRequest request) {
        Long assetId = parseId(assetIdParam, "asset_id");
        if (channel == null || channel.trim().isEmpty()) {
            throw new BadRequestException("channel is required");
        }
        LocalDate date;
        if (Strings.isNullOrEmpty(dateParam)) {
            date = dateProvider.today();
        } else {
            date = DateUtils.parseDate(dateParam);
            if (date == null) {
                throw new BadRequestException("date must be a valid date in YYYY-MM-DD format");
            }
        }
        ClearanceResult result = clearanceService.check(assetId, channel.trim(), date, workspaceFilter(request));
        return ResponseEntity.ok(result);
    }

    /**
     * Internal callers see every workspace; JWT callers see only their own.
     */
    private Long workspaceFilter(HttpServletRequest request) {
        if (Boolean.TRUE.equals(request.getAttribute(AuthInterceptor.INTERNAL_ATTRIBUTE))) {
            return null;
        }
        Caller caller = (Caller) request.getAttribute(AuthInterceptor.CALLER_ATTRIBUTE);
        if (caller == null) {
            throw new UnauthorizedException("Missing or invalid token");
        }
        return caller.getWorkspaceId();
    }

    private Long parseId(String value, String name) {
        try {
            long id = Long.parseLong(value.trim());
            if (id <= 0) {
                throw new BadRequestException(name + " must be a positive integer");
            }
            return Long.valueOf(id);
        } catch (NumberFormatException e) {
            throw new BadRequestException(name + " must be a positive integer");
        }
    }
}
