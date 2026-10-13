package studio.lumen.rights;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.Test;
import org.springframework.http.MediaType;

public class HealthAndAuthTest extends AbstractApiTest {

    private static final String BODY = "{\"license_type\":\"owned\",\"channels\":[\"all\"],"
            + "\"valid_from\":\"2026-01-01\",\"expires_on\":null}";

    @Test
    public void healthNeedsNoAuth() throws Exception {
        mockMvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"ok\",\"service\":\"rights\"}", true));
    }

    @Test
    public void listWithoutTokenIs401() throws Exception {
        mockMvc.perform(get("/rights"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error", is("Missing or invalid token")));
    }

    @Test
    public void getWithoutTokenIs401() throws Exception {
        mockMvc.perform(get("/rights/7"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").isString());
    }

    @Test
    public void clearanceWithoutTokenIs401() throws Exception {
        mockMvc.perform(get("/rights/7/clearance").param("channel", "story"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").isString());
    }

    @Test
    public void putWithoutTokenIs401() throws Exception {
        mockMvc.perform(put("/rights/7").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").isString());
        verify(assetsClient, never()).findAsset(any(Long.class));
    }

    @Test
    public void putWithOnlyInternalTokenIs401() throws Exception {
        mockMvc.perform(put("/rights/7").header("X-Internal-Token", INTERNAL_TOKEN)
                .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error", is("Missing or invalid bearer token")));
    }

    @Test
    public void tokenSignedWithAnotherSecretIs401() throws Exception {
        String forged = token(1, 1, "designer", "Leo Park", "some-other-secret", 3600);
        mockMvc.perform(get("/rights").header("Authorization", bearer(forged)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void expiredTokenIs401() throws Exception {
        String expired = token(1, 1, "designer", "Leo Park", TOKEN_SECRET, -60);
        mockMvc.perform(get("/rights").header("Authorization", bearer(expired)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void garbageTokenIs401() throws Exception {
        mockMvc.perform(get("/rights").header("Authorization", "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void wrongInternalTokenIs401() throws Exception {
        mockMvc.perform(get("/rights").header("X-Internal-Token", "wrong"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void internalTokenWorksOnList() throws Exception {
        seed(7, 1, "2026-01-01", null, false, false, "all");
        mockMvc.perform(get("/rights").header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)));
    }

    @Test
    public void internalTokenWorksOnGet() throws Exception {
        seed(7, 1, "2026-01-01", null, false, false, "all");
        mockMvc.perform(get("/rights/7").header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.asset_id", is(7)));
    }

    @Test
    public void internalTokenWorksOnClearance() throws Exception {
        seed(7, 1, "2026-01-01", null, false, false, "all");
        mockMvc.perform(get("/rights/7/clearance").param("channel", "story")
                .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cleared", is(true)));
    }

    @Test
    public void unknownRouteIs404Json() throws Exception {
        mockMvc.perform(get("/nothing-here"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("Not found")));
    }

    @Test
    public void unsupportedMethodIs405Json() throws Exception {
        mockMvc.perform(delete("/rights/7")
                .header("Authorization", bearer(designerToken())))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.error").isString());
    }
}
