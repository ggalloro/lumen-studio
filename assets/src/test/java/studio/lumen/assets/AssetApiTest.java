package studio.lumen.assets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import com.fasterxml.jackson.databind.JsonNode;

import studio.lumen.assets.storage.BlobStore;

class AssetApiTest extends ApiTestSupport {

    private static final String LEO = bearer(1, 1, "designer");
    private static final String ANA = bearer(2, 1, "designer");
    private static final String OTHER_WORKSPACE = bearer(9, 2, "designer");

    @Test
    void healthIsPublic() throws Exception {
        mvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.service").value("assets"));
    }

    @Test
    void uploadCreatesAssetWithFirstVersion() throws Exception {
        byte[] png = png(64, 48);

        mvc.perform(upload("/assets", "ridge-jacket-hero.png", "image/png", png)
                        .param("title", "  Ridge Jacket hero ")
                        .param("description", "Hero shot")
                        .param("tags", "Jacket, fall ,jacket,, FALL")
                        .param("alt_text", "A red jacket")
                        .header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.workspace_id").value(1))
                .andExpect(jsonPath("$.title").value("Ridge Jacket hero"))
                .andExpect(jsonPath("$.description").value("Hero shot"))
                .andExpect(jsonPath("$.owner_id").value(1))
                .andExpect(jsonPath("$.tags", Matchers.contains("jacket", "fall")))
                .andExpect(jsonPath("$.created_at", Matchers.matchesPattern("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z")))
                .andExpect(jsonPath("$.versions.length()").value(1))
                .andExpect(jsonPath("$.latest_version.version").value(1))
                .andExpect(jsonPath("$.latest_version.filename").value("ridge-jacket-hero.png"))
                .andExpect(jsonPath("$.latest_version.content_type").value("image/png"))
                .andExpect(jsonPath("$.latest_version.size_bytes").value(png.length))
                .andExpect(jsonPath("$.latest_version.width").value(64))
                .andExpect(jsonPath("$.latest_version.height").value(48))
                .andExpect(jsonPath("$.latest_version.sha256").value(BlobStore.sha256(png)))
                .andExpect(jsonPath("$.latest_version.blob_url").value("/blobs/" + BlobStore.sha256(png)))
                .andExpect(jsonPath("$.latest_version.alt_text").value("A red jacket"))
                .andExpect(jsonPath("$.latest_version.created_by").value(1))
                .andExpect(jsonPath("$.latest_version.renditions").isEmpty());

        long id = jdbc.queryForObject("SELECT id FROM assets", Long.class);
        verify(notifier).versionStored(id, 1, BlobStore.sha256(png));
    }

    @Test
    void addingVersionsKeepsHistory() throws Exception {
        long id = createAsset(LEO, "Trail boots", "boots", "boots.png");
        byte[] jpeg = jpeg(30, 20);

        mvc.perform(upload("/assets/" + id + "/versions", "boots-v2.jpg", "image/jpeg", jpeg)
                        .param("alt_text", "Boots on a rock")
                        .header(HttpHeaders.AUTHORIZATION, ANA))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.asset_id").value(id))
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.content_type").value("image/jpeg"))
                .andExpect(jsonPath("$.width").value(30))
                .andExpect(jsonPath("$.height").value(20))
                .andExpect(jsonPath("$.created_by").value(2));

        verify(notifier).versionStored(id, 2, BlobStore.sha256(jpeg));

        mvc.perform(get("/assets/" + id).header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.versions[*].version", Matchers.contains(1, 2)))
                .andExpect(jsonPath("$.latest_version.version").value(2));

        mvc.perform(get("/assets/" + id + "/versions/1").header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.filename").value("boots.png"));

        mvc.perform(get("/assets/" + id + "/versions/3").header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").isString());
    }

    @Test
    void titleIsRequired() throws Exception {
        mvc.perform(upload("/assets", "a.png", "image/png", png(4, 4))
                        .param("title", "   ")
                        .header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("title is required"));
    }

    @Test
    void rejectsUnsupportedTypes() throws Exception {
        mvc.perform(upload("/assets", "notes.txt", "text/plain", "hello".getBytes())
                        .param("title", "Notes")
                        .header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").isString());

        byte[] gif = image("gif", 4, 4, java.awt.Color.RED);
        mvc.perform(upload("/assets", "anim.gif", "image/gif", gif)
                        .param("title", "Gif")
                        .header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isBadRequest());

        // Declared type must match the magic bytes.
        mvc.perform(upload("/assets", "fake.png", "image/png", jpeg(4, 4))
                        .param("title", "Mismatch")
                        .header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isBadRequest());

        mvc.perform(upload("/assets", "fake.png", "image/png", "plain text, not an image".getBytes())
                        .param("title", "Text")
                        .header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isBadRequest());

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM assets", Integer.class)).isZero();
        verify(notifier, never()).versionStored(anyLong(), anyInt(), anyString());
    }

    @Test
    void rejectsFilesOver25Megabytes() throws Exception {
        byte[] big = new byte[25 * 1024 * 1024 + 1];
        System.arraycopy(png(2, 2), 0, big, 0, 8);

        mvc.perform(upload("/assets", "huge.png", "image/png", big)
                        .param("title", "Huge")
                        .header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.error").value("File exceeds the 25 MB limit"));
    }

    @Test
    void missingFileIsRejected() throws Exception {
        mvc.perform(multipart("/assets").param("title", "No file").header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("file is required"));
    }

    @Test
    void requiresAuthentication() throws Exception {
        long id = createAsset(LEO, "Ridge Jacket", "jacket", "ridge.png");

        mvc.perform(get("/assets"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").isString());
        mvc.perform(get("/assets/" + id)).andExpect(status().isUnauthorized());
        mvc.perform(upload("/assets", "a.png", "image/png", png(4, 4)).param("title", "x"))
                .andExpect(status().isUnauthorized());

        mvc.perform(get("/assets").header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/assets").header(HttpHeaders.AUTHORIZATION,
                        "Bearer " + token(1, 1, "designer", "some-other-secret")))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/assets").header("X-Internal-Token", "wrong"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void internalTokenIsAcceptedOnReadsAcrossWorkspaces() throws Exception {
        long id = createAsset(OTHER_WORKSPACE, "Other brand asset", "", "other.png");

        mvc.perform(get("/assets").header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1));
        mvc.perform(get("/assets/" + id).header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.workspace_id").value(2));
        mvc.perform(get("/assets/" + id + "/versions/1").header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk());

        // Uploads need a user identity.
        mvc.perform(upload("/assets", "a.png", "image/png", png(4, 4))
                        .param("title", "x")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void usersOnlySeeTheirWorkspace() throws Exception {
        long other = createAsset(OTHER_WORKSPACE, "Other brand asset", "", "other.png");
        createAsset(LEO, "Mine", "", "mine.png");

        mvc.perform(get("/assets").header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(jsonPath("$.items[*].title", Matchers.contains("Mine")));
        mvc.perform(get("/assets/" + other).header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isNotFound());
        mvc.perform(upload("/assets/" + other + "/versions", "v2.png", "image/png", png(4, 4))
                        .header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isNotFound());
    }

    @Test
    void listSupportsFiltersAndSortsByUpdatedAt() throws Exception {
        long jacket = createAsset(LEO, "Ridge Jacket hero", "jacket,fall", "ridge.png");
        long boots = createAsset(ANA, "Trail boots", "boots,fall", "boots.png");
        long tent = createAsset(ANA, "Basecamp tent", "tent", "tent.png");
        jdbc.update("UPDATE assets SET description = 'Lightweight RIDGE line' WHERE id = ?", tent);
        jdbc.update("UPDATE assets SET updated_at = '2026-01-01T00:00:00Z' WHERE id = ?", jacket);
        jdbc.update("UPDATE assets SET updated_at = '2026-01-03T00:00:00Z' WHERE id = ?", boots);
        jdbc.update("UPDATE assets SET updated_at = '2026-01-02T00:00:00Z' WHERE id = ?", tent);

        mvc.perform(get("/assets").header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].id", Matchers.contains((int) boots, (int) tent, (int) jacket)))
                .andExpect(jsonPath("$.items[0].latest_version.version").value(1))
                .andExpect(jsonPath("$.items[0].versions").doesNotExist());

        mvc.perform(get("/assets").param("q", "ridge").header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(jsonPath("$.items[*].id", Matchers.contains((int) tent, (int) jacket)));

        mvc.perform(get("/assets").param("tag", "FALL").header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(jsonPath("$.items[*].id", Matchers.contains((int) boots, (int) jacket)));

        mvc.perform(get("/assets").param("owner_id", "2").header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(jsonPath("$.items[*].id", Matchers.contains((int) boots, (int) tent)));

        mvc.perform(get("/assets").param("owner_id", "2").param("tag", "fall").param("q", "TRAIL")
                        .header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(jsonPath("$.items[*].id", Matchers.contains((int) boots)));

        mvc.perform(get("/assets").param("q", "100%").header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(jsonPath("$.items").isEmpty());

        mvc.perform(get("/assets").param("owner_id", "abc").header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isBadRequest());
    }

    @Test
    void newVersionMovesAssetToTopOfList() throws Exception {
        long first = createAsset(LEO, "First", "", "first.png");
        long second = createAsset(LEO, "Second", "", "second.png");
        jdbc.update("UPDATE assets SET updated_at = '2026-01-01T00:00:00Z' WHERE id = ?", first);
        jdbc.update("UPDATE assets SET updated_at = '2026-01-02T00:00:00Z' WHERE id = ?", second);

        mvc.perform(upload("/assets/" + first + "/versions", "first-v2.png", "image/png", png(8, 8))
                        .header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isCreated());

        mvc.perform(get("/assets").header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(jsonPath("$.items[*].id", Matchers.contains((int) first, (int) second)));
    }

    protected long createAsset(String auth, String title, String tags, String filename) throws Exception {
        String body = mvc.perform(upload("/assets", filename, "image/png", png(16, 9))
                        .param("title", title)
                        .param("tags", tags)
                        .header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode node = json.readTree(body);
        return node.get("id").asLong();
    }

    private static MockMultipartHttpServletRequestBuilder upload(String path, String filename, String type,
            byte[] data) {
        return multipart(path).file(new MockMultipartFile("file", filename, type, data));
    }
}
