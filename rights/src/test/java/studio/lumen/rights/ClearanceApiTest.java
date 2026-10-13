package studio.lumen.rights;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.is;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.joda.time.LocalDate;
import org.junit.Test;
import org.springframework.test.web.servlet.ResultActions;

public class ClearanceApiTest extends AbstractApiTest {

    private ResultActions clearance(long assetId, String channel, String date) throws Exception {
        if (date == null) {
            return mockMvc.perform(get("/rights/" + assetId + "/clearance")
                    .param("channel", channel)
                    .header("Authorization", bearer(designerToken())));
        }
        return mockMvc.perform(get("/rights/" + assetId + "/clearance")
                .param("channel", channel)
                .param("date", date)
                .header("Authorization", bearer(designerToken())));
    }

    @Test
    public void noRecordIsTheOnlyReason() throws Exception {
        clearance(7, "story", "2026-10-13")
                .andExpect(status().isOk())
                .andExpect(content().json("{\"asset_id\":7,\"channel\":\"story\",\"date\":\"2026-10-13\","
                        + "\"cleared\":false,\"reasons\":[\"No usage rights on file\"]}", true));
    }

    @Test
    public void recordInAnotherWorkspaceCountsAsNoRecordForJwtCallers() throws Exception {
        seed(8, 2, "2026-01-01", null, false, false, "all");
        clearance(8, "story", "2026-10-13")
                .andExpect(jsonPath("$.reasons", contains("No usage rights on file")));
    }

    @Test
    public void clearedWhenEverythingChecksOut() throws Exception {
        seed(7, 1, "2026-01-01", "2027-06-30", true, true, "instagram_square", "story");
        clearance(7, "story", "2026-10-13")
                .andExpect(status().isOk())
                .andExpect(content().json("{\"asset_id\":7,\"channel\":\"story\",\"date\":\"2026-10-13\","
                        + "\"cleared\":true,\"reasons\":[]}", true));
    }

    @Test
    public void notYetStarted() throws Exception {
        seed(7, 1, "2026-11-01", null, false, false, "all");
        clearance(7, "story", "2026-10-31")
                .andExpect(jsonPath("$.cleared", is(false)))
                .andExpect(jsonPath("$.reasons", contains("Rights start on 2026-11-01")));
    }

    @Test
    public void startDateItselfIsCleared() throws Exception {
        seed(7, 1, "2026-11-01", null, false, false, "all");
        clearance(7, "story", "2026-11-01")
                .andExpect(jsonPath("$.cleared", is(true)));
    }

    @Test
    public void expired() throws Exception {
        seed(7, 1, "2025-01-01", "2026-06-30", false, false, "all");
        clearance(7, "story", "2026-07-01")
                .andExpect(jsonPath("$.cleared", is(false)))
                .andExpect(jsonPath("$.reasons", contains("License expired on 2026-06-30")));
    }

    @Test
    public void expiryDateItselfIsCleared() throws Exception {
        seed(7, 1, "2025-01-01", "2026-06-30", false, false, "all");
        clearance(7, "story", "2026-06-30")
                .andExpect(jsonPath("$.cleared", is(true)));
    }

    @Test
    public void perpetualRightsNeverExpire() throws Exception {
        seed(7, 1, "2020-01-01", null, false, false, "all");
        clearance(7, "story", "2099-12-31")
                .andExpect(jsonPath("$.cleared", is(true)));
    }

    @Test
    public void channelNotCovered() throws Exception {
        seed(7, 1, "2026-01-01", null, false, false, "instagram_square", "web_banner");
        clearance(7, "story", "2026-10-13")
                .andExpect(jsonPath("$.cleared", is(false)))
                .andExpect(jsonPath("$.reasons", contains("Not licensed for story")));
    }

    @Test
    public void allChannelsCoversAnyChannel() throws Exception {
        seed(7, 1, "2026-01-01", null, false, false, "all");
        clearance(7, "email_header", "2026-10-13")
                .andExpect(jsonPath("$.cleared", is(true)))
                .andExpect(jsonPath("$.reasons", empty()));
    }

    @Test
    public void modelReleaseMissing() throws Exception {
        seed(7, 1, "2026-01-01", null, true, false, "all");
        clearance(7, "story", "2026-10-13")
                .andExpect(jsonPath("$.cleared", is(false)))
                .andExpect(jsonPath("$.reasons", contains("Model release missing")));
    }

    @Test
    public void multipleReasonsComeInContractOrder() throws Exception {
        seed(7, 1, "2026-11-01", null, true, false, "web_banner");
        clearance(7, "story", "2026-10-13")
                .andExpect(jsonPath("$.cleared", is(false)))
                .andExpect(jsonPath("$.reasons", contains(
                        "Rights start on 2026-11-01",
                        "Not licensed for story",
                        "Model release missing")));
    }

    @Test
    public void expiredUncoveredAndUnreleasedTogether() throws Exception {
        seed(7, 1, "2025-01-01", "2025-12-31", true, false, "instagram_square");
        clearance(7, "story", "2026-10-13")
                .andExpect(jsonPath("$.reasons", contains(
                        "License expired on 2025-12-31",
                        "Not licensed for story",
                        "Model release missing")));
    }

    @Test
    public void dateDefaultsToToday() throws Exception {
        seed(7, 1, "2026-01-01", "2026-12-31", false, false, "all");
        when(dateProvider.today()).thenReturn(new LocalDate(2027, 1, 5));
        clearance(7, "story", null)
                .andExpect(jsonPath("$.date", is("2027-01-05")))
                .andExpect(jsonPath("$.reasons", contains("License expired on 2026-12-31")));
    }

    @Test
    public void explicitDateOverridesToday() throws Exception {
        seed(7, 1, "2026-01-01", "2026-12-31", false, false, "all");
        when(dateProvider.today()).thenReturn(new LocalDate(2027, 1, 5));
        clearance(7, "story", "2026-12-01")
                .andExpect(jsonPath("$.date", is("2026-12-01")))
                .andExpect(jsonPath("$.cleared", is(true)));
    }

    @Test
    public void missingChannelIs400() throws Exception {
        mockMvc.perform(get("/rights/7/clearance").header("Authorization", bearer(designerToken())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("channel is required")));
    }

    @Test
    public void invalidDateIs400() throws Exception {
        clearance(7, "story", "2026-02-30")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("date must be a valid date in YYYY-MM-DD format")));
    }
}
