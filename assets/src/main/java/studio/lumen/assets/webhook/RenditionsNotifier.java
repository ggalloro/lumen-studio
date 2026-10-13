package studio.lumen.assets.webhook;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import studio.lumen.assets.config.LumenProperties;

/**
 * Asks the renditions service to render a newly stored version. Runs off the request thread
 * and never propagates failures to the upload.
 */
@Component
public class RenditionsNotifier {

    private static final Logger log = LoggerFactory.getLogger(RenditionsNotifier.class);

    static final int MAX_ATTEMPTS = 3;
    private static final Duration INITIAL_BACKOFF = Duration.ofSeconds(1);

    private final RestClient client;
    private final LumenProperties props;
    private final ObjectMapper mapper;

    public RenditionsNotifier(LumenProperties props, ObjectMapper mapper) {
        this.props = props;
        this.mapper = mapper;
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.client = RestClient.builder().requestFactory(factory).build();
    }

    @Async
    public void versionStored(long assetId, int version, String sha256) {
        String url = stripTrailingSlash(props.renditionsUrl()) + "/internal/jobs";
        byte[] body;
        try {
            // Serialized up front so the request carries a Content-Length instead of a chunked body.
            body = mapper.writeValueAsBytes(Map.of(
                    "asset_id", assetId,
                    "version", version,
                    "blob_url", stripTrailingSlash(props.selfUrl()) + "/blobs/" + sha256));
        } catch (JsonProcessingException e) {
            log.error("Cannot serialize renditions webhook body", e);
            return;
        }

        Duration backoff = INITIAL_BACKOFF;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                client.post()
                        .uri(url)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Internal-Token", props.internalToken())
                        .body(body)
                        .retrieve()
                        .toBodilessEntity();
                log.info("Queued renditions for asset {} version {}", assetId, version);
                return;
            } catch (Exception e) {
                log.warn("Renditions webhook attempt {}/{} for asset {} version {} failed: {}",
                        attempt, MAX_ATTEMPTS, assetId, version, e.getMessage());
            }
            if (attempt < MAX_ATTEMPTS) {
                try {
                    Thread.sleep(backoff);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
                backoff = backoff.multipliedBy(2);
            }
        }
        log.error("Giving up on renditions webhook for asset {} version {}", assetId, version);
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
