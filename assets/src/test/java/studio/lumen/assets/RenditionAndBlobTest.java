package studio.lumen.assets;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.awt.Color;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.fasterxml.jackson.databind.JsonNode;

import studio.lumen.assets.storage.BlobStore;

class RenditionAndBlobTest extends ApiTestSupport {

    private static final String LEO = bearer(1, 1, "designer");

    private final byte[] original = png(40, 30);
    private long assetId;

    @BeforeEach
    void createAsset() throws Exception {
        String body = mvc.perform(multipart("/assets")
                        .file(new MockMultipartFile("file", "ridge-jacket-hero.png", "image/png", original))
                        .param("title", "Ridge Jacket hero")
                        .header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode node = json.readTree(body);
        assetId = node.get("id").asLong();
    }

    @Test
    void registersRendition() throws Exception {
        byte[] story = image("jpg", 9, 16, Color.GREEN);
        String sha = BlobStore.sha256(story);

        mvc.perform(rendition(assetId, 1, "story", story).header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.preset").value("story"))
                .andExpect(jsonPath("$.width").value(1080))
                .andExpect(jsonPath("$.height").value(1920))
                .andExpect(jsonPath("$.sha256").value(sha))
                .andExpect(jsonPath("$.blob_url").value("/blobs/" + sha))
                .andExpect(jsonPath("$.created_at").isString());

        mvc.perform(get("/assets/" + assetId + "/versions/1").header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(jsonPath("$.renditions.length()").value(1))
                .andExpect(jsonPath("$.renditions[0].preset").value("story"));

        mvc.perform(get("/blobs/" + sha).param("download", "1"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/jpeg"))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"ridge-jacket-hero_story.jpg\"; "
                                + "filename*=UTF-8''ridge-jacket-hero_story.jpg"))
                .andExpect(content().bytes(story));
    }

    @Test
    void replacesRenditionWithSamePreset() throws Exception {
        byte[] first = image("jpg", 10, 10, Color.GREEN);
        byte[] second = image("jpg", 10, 10, Color.MAGENTA);

        mvc.perform(rendition(assetId, 1, "thumbnail", first).header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isCreated());
        mvc.perform(rendition(assetId, 1, "story", first).header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isCreated());
        mvc.perform(rendition(assetId, 1, "thumbnail", second).header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sha256").value(BlobStore.sha256(second)));

        mvc.perform(get("/assets/" + assetId).header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(jsonPath("$.latest_version.renditions.length()").value(2))
                .andExpect(jsonPath("$.latest_version.renditions[?(@.preset == 'thumbnail')].sha256")
                        .value(BlobStore.sha256(second)));
    }

    @Test
    void renditionRequiresInternalToken() throws Exception {
        byte[] data = image("jpg", 4, 4, Color.GREEN);
        mvc.perform(rendition(assetId, 1, "story", data))
                .andExpect(status().isUnauthorized());
        mvc.perform(rendition(assetId, 1, "story", data).header(HttpHeaders.AUTHORIZATION, LEO))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void renditionForUnknownVersionIs404() throws Exception {
        byte[] data = image("jpg", 4, 4, Color.GREEN);
        mvc.perform(rendition(assetId, 7, "story", data).header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").isString());
    }

    @Test
    void servesOriginalInlineByDefault() throws Exception {
        String sha = BlobStore.sha256(original);

        mvc.perform(get("/blobs/" + sha))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/png"))
                .andExpect(header().longValue(HttpHeaders.CONTENT_LENGTH, original.length))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"ridge-jacket-hero.png\"; filename*=UTF-8''ridge-jacket-hero.png"))
                .andExpect(content().bytes(original));
    }

    @Test
    void downloadParameterSetsAttachment() throws Exception {
        mvc.perform(get("/blobs/" + BlobStore.sha256(original)).param("download", "1"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"ridge-jacket-hero.png\"; filename*=UTF-8''ridge-jacket-hero.png"));
    }

    @Test
    void unknownBlobIs404() throws Exception {
        mvc.perform(get("/blobs/" + "0".repeat(64)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").isString());
        mvc.perform(get("/blobs/not-a-hash"))
                .andExpect(status().isNotFound());
    }

    private static MockHttpServletRequestBuilder rendition(long assetId, int version, String preset,
            byte[] data) {
        int width = "story".equals(preset) ? 1080 : 320;
        int height = "story".equals(preset) ? 1920 : 320;
        return multipart("/internal/renditions")
                .file(new MockMultipartFile("file", preset + ".jpg", "image/jpeg", data))
                .param("asset_id", String.valueOf(assetId))
                .param("version", String.valueOf(version))
                .param("preset", preset)
                .param("width", String.valueOf(width))
                .param("height", String.valueOf(height));
    }
}
