package studio.lumen.rights.client;

import java.io.IOException;

import org.apache.http.HttpStatus;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.util.EntityUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import studio.lumen.rights.exception.UpstreamException;
import studio.lumen.rights.model.AssetInfo;

/**
 * Reads assets from the assets service with the internal token.
 */
@Component
public class AssetsClient {

    private static final Logger LOG = LoggerFactory.getLogger(AssetsClient.class);

    public static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";

    @Autowired
    private CloseableHttpClient httpClient;

    @Autowired
    private ObjectMapper objectMapper;

    @Value("${lumen.assets-url}")
    private String assetsUrl;

    @Value("${lumen.internal-token}")
    private String internalToken;

    /**
     * Looks up an asset by id.
     *
     * @return the asset, or null if the assets service answers 404
     * @throws UpstreamException if the assets service cannot be reached or answers with an error
     */
    public AssetInfo findAsset(Long assetId) {
        String url = baseUrl() + "/assets/" + assetId;
        HttpGet request = new HttpGet(url);
        request.setHeader(INTERNAL_TOKEN_HEADER, internalToken);
        request.setHeader("Accept", "application/json");

        CloseableHttpResponse response = null;
        try {
            response = httpClient.execute(request);
            int status = response.getStatusLine().getStatusCode();
            if (status == HttpStatus.SC_NOT_FOUND) {
                EntityUtils.consumeQuietly(response.getEntity());
                return null;
            }
            if (status != HttpStatus.SC_OK) {
                EntityUtils.consumeQuietly(response.getEntity());
                LOG.warn("GET {} returned HTTP {}", url, status);
                throw new UpstreamException("Assets service returned HTTP " + status);
            }
            String body = EntityUtils.toString(response.getEntity(), "UTF-8");
            return parseAsset(body);
        } catch (IOException e) {
            LOG.warn("GET {} failed: {}", url, e.getMessage());
            throw new UpstreamException("Assets service unavailable", e);
        } finally {
            if (response != null) {
                try {
                    response.close();
                } catch (IOException e) {
                    LOG.debug("Error closing response", e);
                }
            }
        }
    }

    private AssetInfo parseAsset(String body) throws IOException {
        JsonNode root = objectMapper.readTree(body);
        if (root == null || !root.isObject()) {
            throw new UpstreamException("Assets service returned an unexpected response");
        }
        JsonNode id = root.get("id");
        JsonNode workspaceId = root.get("workspace_id");
        if (id == null || !id.canConvertToLong() || workspaceId == null || !workspaceId.canConvertToLong()) {
            throw new UpstreamException("Assets service returned an asset without id or workspace_id");
        }
        AssetInfo asset = new AssetInfo();
        asset.setId(id.asLong());
        asset.setWorkspaceId(workspaceId.asLong());
        JsonNode title = root.get("title");
        if (title != null && !title.isNull()) {
            asset.setTitle(title.asText());
        }
        return asset;
    }

    private String baseUrl() {
        String url = assetsUrl;
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        return url;
    }
}
