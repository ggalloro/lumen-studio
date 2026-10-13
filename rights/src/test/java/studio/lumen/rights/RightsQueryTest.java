package studio.lumen.rights;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.Test;

public class RightsQueryTest extends AbstractApiTest {

    @Test
    public void listIsFilteredToTheCallersWorkspace() throws Exception {
        seed(12, 1, "2026-01-01", null, false, false, "all");
        seed(3, 1, "2026-01-01", "2026-12-31", true, true, "story", "web_banner");
        seed(8, 2, "2026-01-01", null, false, false, "all");

        mockMvc.perform(get("/rights").header("Authorization", bearer(designerToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[*].asset_id", contains(3, 12)));

        mockMvc.perform(get("/rights").header("Authorization", bearer(otherWorkspaceToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].asset_id", contains(8)));
    }

    @Test
    public void internalCallerSeesEveryWorkspace() throws Exception {
        seed(12, 1, "2026-01-01", null, false, false, "all");
        seed(8, 2, "2026-01-01", null, false, false, "all");

        mockMvc.perform(get("/rights").header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].asset_id", contains(8, 12)));
    }

    @Test
    public void emptyListIsAnEmptyArray() throws Exception {
        mockMvc.perform(get("/rights").header("Authorization", bearer(designerToken())))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"items\":[]}", true));
    }

    @Test
    public void listCanFilterByAssetId() throws Exception {
        seed(12, 1, "2026-01-01", null, false, false, "all");
        seed(3, 1, "2026-01-01", null, false, false, "story");

        mockMvc.perform(get("/rights").param("asset_id", "3").header("Authorization", bearer(designerToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].asset_id", contains(3)));

        mockMvc.perform(get("/rights").param("asset_id", "99").header("Authorization", bearer(designerToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)));
    }

    @Test
    public void assetIdFilterStillAppliesTheWorkspace() throws Exception {
        seed(8, 2, "2026-01-01", null, false, false, "all");

        mockMvc.perform(get("/rights").param("asset_id", "8").header("Authorization", bearer(designerToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)));

        mockMvc.perform(get("/rights").param("asset_id", "8").header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)));
    }

    @Test
    public void invalidAssetIdFilterIs400() throws Exception {
        mockMvc.perform(get("/rights").param("asset_id", "seven").header("Authorization", bearer(designerToken())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("asset_id must be a positive integer")));
    }

    @Test
    public void getReturnsTheRecord() throws Exception {
        seed(3, 1, "2026-01-01", "2026-12-31", true, false, "story", "web_banner");

        mockMvc.perform(get("/rights/3").header("Authorization", bearer(reviewerToken())))
                .andExpect(status().isOk())
                .andExpect(content().json("{"
                        + "\"asset_id\":3,\"workspace_id\":1,\"license_type\":\"licensed\","
                        + "\"licensor\":\"Synthetic Licensor 3\",\"channels\":[\"story\",\"web_banner\"],"
                        + "\"valid_from\":\"2026-01-01\",\"expires_on\":\"2026-12-31\","
                        + "\"model_release_required\":true,\"model_release_on_file\":false,"
                        + "\"notes\":\"\",\"updated_by\":5,\"updated_at\":\"2026-10-01T08:00:00Z\"}", true));
    }

    @Test
    public void getMissingRecordIs404() throws Exception {
        mockMvc.perform(get("/rights/3").header("Authorization", bearer(designerToken())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("No usage rights on file for asset 3")));
    }

    @Test
    public void getRecordFromAnotherWorkspaceIs404() throws Exception {
        seed(8, 2, "2026-01-01", null, false, false, "all");
        mockMvc.perform(get("/rights/8").header("Authorization", bearer(designerToken())))
                .andExpect(status().isNotFound());
    }
}
