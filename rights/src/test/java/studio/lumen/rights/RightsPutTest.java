package studio.lumen.rights;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;
import org.junit.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.google.common.base.Joiner;

import studio.lumen.rights.exception.UpstreamException;
import studio.lumen.rights.model.RightsRecord;

public class RightsPutTest extends AbstractApiTest {

    private static final String FULL_BODY = "{"
            + "\"license_type\":\"licensed\","
            + "\"licensor\":\"Synthetic Stock Co\","
            + "\"channels\":[\"instagram_square\",\"story\"],"
            + "\"valid_from\":\"2026-01-01\","
            + "\"expires_on\":\"2027-06-30\","
            + "\"model_release_required\":true,"
            + "\"model_release_on_file\":true,"
            + "\"notes\":\"Two-year license\"}";

    private ResultActions putRights(long assetId, String token, String body) throws Exception {
        return mockMvc.perform(put("/rights/" + assetId)
                .header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    @Test
    public void createReturnsTheFullRecord() throws Exception {
        givenAsset(7, 1);
        putRights(7, designerToken(), FULL_BODY)
                .andExpect(status().isOk())
                .andExpect(content().json("{"
                        + "\"asset_id\":7,\"workspace_id\":1,\"license_type\":\"licensed\","
                        + "\"licensor\":\"Synthetic Stock Co\",\"channels\":[\"instagram_square\",\"story\"],"
                        + "\"valid_from\":\"2026-01-01\",\"expires_on\":\"2027-06-30\","
                        + "\"model_release_required\":true,\"model_release_on_file\":true,"
                        + "\"notes\":\"Two-year license\",\"updated_by\":1,"
                        + "\"updated_at\":\"2026-10-13T09:30:00Z\"}", true));

        RightsRecord stored = rightsDao.findByAssetId(Long.valueOf(7));
        assertNotNull(stored);
        assertEquals("instagram_square,story", Joiner.on(',').join(stored.getChannels()));
    }

    @Test
    public void putReplacesTheExistingRecord() throws Exception {
        givenAsset(7, 1);
        putRights(7, designerToken(), FULL_BODY).andExpect(status().isOk());

        when(dateProvider.now()).thenReturn(new DateTime(2026, 10, 14, 7, 5, 9, DateTimeZone.UTC));
        putRights(7, brandAdminToken(), "{\"license_type\":\"owned\",\"channels\":[\"all\"],"
                + "\"valid_from\":\"2026-02-01\",\"expires_on\":null}")
                .andExpect(status().isOk())
                .andExpect(content().json("{"
                        + "\"asset_id\":7,\"workspace_id\":1,\"license_type\":\"owned\","
                        + "\"licensor\":\"\",\"channels\":[\"all\"],"
                        + "\"valid_from\":\"2026-02-01\",\"expires_on\":null,"
                        + "\"model_release_required\":false,\"model_release_on_file\":false,"
                        + "\"notes\":\"\",\"updated_by\":5,"
                        + "\"updated_at\":\"2026-10-14T07:05:09Z\"}", true));

        assertEquals(1, rightsDao.findAll().size());
    }

    @Test
    public void workspaceComesFromTheAssetAndServerFieldsAreIgnored() throws Exception {
        givenAsset(9, 1);
        putRights(9, designerToken(), "{\"asset_id\":99,\"workspace_id\":42,\"updated_by\":77,"
                + "\"updated_at\":\"2000-01-01T00:00:00Z\",\"license_type\":\"ugc\","
                + "\"channels\":[\"story\"],\"valid_from\":\"2026-01-01\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.asset_id", is(9)))
                .andExpect(jsonPath("$.workspace_id", is(1)))
                .andExpect(jsonPath("$.updated_by", is(1)))
                .andExpect(jsonPath("$.updated_at", is("2026-10-13T09:30:00Z")))
                .andExpect(jsonPath("$.expires_on", nullValue()));
    }

    @Test
    public void channelsAreTrimmedAndDeduplicated() throws Exception {
        givenAsset(7, 1);
        putRights(7, designerToken(), "{\"license_type\":\"owned\","
                + "\"channels\":[\" story \",\"web_banner\",\"story\"],\"valid_from\":\"2026-01-01\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.channels", contains("story", "web_banner")));
    }

    @Test
    public void expiresOnSameDayAsValidFromIsAccepted() throws Exception {
        givenAsset(7, 1);
        putRights(7, designerToken(), "{\"license_type\":\"owned\",\"channels\":[\"all\"],"
                + "\"valid_from\":\"2026-05-01\",\"expires_on\":\"2026-05-01\"}")
                .andExpect(status().isOk());
    }

    @Test
    public void reviewerGets403() throws Exception {
        givenAsset(7, 1);
        putRights(7, reviewerToken(), FULL_BODY)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error", is("Only designers and brand admins can edit usage rights")));
        verify(assetsClient, never()).findAsset(any(Long.class));
    }

    @Test
    public void unknownAssetGets404() throws Exception {
        when(assetsClient.findAsset(Long.valueOf(404))).thenReturn(null);
        putRights(404, designerToken(), FULL_BODY)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Asset 404 not found")));
        assertEquals(0, rightsDao.findAll().size());
    }

    @Test
    public void assetInAnotherWorkspaceGets404() throws Exception {
        givenAsset(7, 1);
        putRights(7, otherWorkspaceToken(), FULL_BODY)
                .andExpect(status().isNotFound());
        assertEquals(0, rightsDao.findAll().size());
    }

    @Test
    public void assetsServiceDownGets502() throws Exception {
        when(assetsClient.findAsset(Long.valueOf(7))).thenThrow(new UpstreamException("Assets service unavailable"));
        putRights(7, designerToken(), FULL_BODY)
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.error", is("Assets service unavailable")));
    }

    private void expect400(String body, String message) throws Exception {
        givenAsset(7, 1);
        putRights(7, designerToken(), body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is(message)));
        assertEquals(0, rightsDao.findAll().size());
    }

    @Test
    public void missingLicenseTypeIs400() throws Exception {
        expect400("{\"channels\":[\"all\"],\"valid_from\":\"2026-01-01\"}", "license_type is required");
    }

    @Test
    public void unknownLicenseTypeIs400() throws Exception {
        expect400("{\"license_type\":\"borrowed\",\"channels\":[\"all\"],\"valid_from\":\"2026-01-01\"}",
                "license_type must be one of owned, licensed, ugc");
    }

    @Test
    public void emptyChannelsIs400() throws Exception {
        expect400("{\"license_type\":\"owned\",\"channels\":[],\"valid_from\":\"2026-01-01\"}",
                "channels must not be empty");
    }

    @Test
    public void missingChannelsIs400() throws Exception {
        expect400("{\"license_type\":\"owned\",\"valid_from\":\"2026-01-01\"}", "channels must not be empty");
    }

    @Test
    public void blankChannelIs400() throws Exception {
        expect400("{\"license_type\":\"owned\",\"channels\":[\" \"],\"valid_from\":\"2026-01-01\"}",
                "channels must not contain empty values");
    }

    @Test
    public void allMixedWithPresetsIs400() throws Exception {
        expect400("{\"license_type\":\"owned\",\"channels\":[\"all\",\"story\"],\"valid_from\":\"2026-01-01\"}",
                "channels must be [\"all\"] or a list of preset ids, not both");
    }

    @Test
    public void missingValidFromIs400() throws Exception {
        expect400("{\"license_type\":\"owned\",\"channels\":[\"all\"]}", "valid_from is required");
    }

    @Test
    public void malformedValidFromIs400() throws Exception {
        expect400("{\"license_type\":\"owned\",\"channels\":[\"all\"],\"valid_from\":\"01/02/2026\"}",
                "valid_from must be a valid date in YYYY-MM-DD format");
    }

    @Test
    public void impossibleValidFromIs400() throws Exception {
        expect400("{\"license_type\":\"owned\",\"channels\":[\"all\"],\"valid_from\":\"2026-02-30\"}",
                "valid_from must be a valid date in YYYY-MM-DD format");
    }

    @Test
    public void invalidExpiresOnIs400() throws Exception {
        expect400("{\"license_type\":\"owned\",\"channels\":[\"all\"],\"valid_from\":\"2026-01-01\","
                + "\"expires_on\":\"2026-13-01\"}",
                "expires_on must be a valid date in YYYY-MM-DD format or null");
    }

    @Test
    public void expiresBeforeValidFromIs400() throws Exception {
        expect400("{\"license_type\":\"owned\",\"channels\":[\"all\"],\"valid_from\":\"2026-06-01\","
                + "\"expires_on\":\"2026-05-31\"}",
                "expires_on must not be before valid_from");
    }

    @Test
    public void releaseOnFileWithoutRequirementIs400() throws Exception {
        expect400("{\"license_type\":\"owned\",\"channels\":[\"all\"],\"valid_from\":\"2026-01-01\","
                + "\"model_release_required\":false,\"model_release_on_file\":true}",
                "model_release_on_file cannot be true when model_release_required is false");
    }

    @Test
    public void malformedJsonIs400() throws Exception {
        expect400("{\"license_type\":", "Request body must be a valid JSON object");
    }

    @Test
    public void emptyBodyIs400() throws Exception {
        expect400("", "Request body must be a JSON object");
    }

    @Test
    public void validationRunsBeforeTheAssetsLookup() throws Exception {
        putRights(7, designerToken(), "{\"license_type\":\"borrowed\",\"channels\":[\"all\"],"
                + "\"valid_from\":\"2026-01-01\"}")
                .andExpect(status().isBadRequest());
        verify(assetsClient, never()).findAsset(any(Long.class));
    }

    @Test
    public void nonNumericAssetIdIs400() throws Exception {
        putRights(0, designerToken(), FULL_BODY).andExpect(status().isBadRequest());
        mockMvc.perform(put("/rights/abc")
                .header("Authorization", bearer(designerToken()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(FULL_BODY))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("asset_id must be a positive integer")));
    }
}
