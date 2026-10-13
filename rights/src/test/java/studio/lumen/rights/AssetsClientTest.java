package studio.lumen.rights;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.fail;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.concurrent.atomic.AtomicReference;

import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import studio.lumen.rights.client.AssetsClient;
import studio.lumen.rights.exception.UpstreamException;
import studio.lumen.rights.model.AssetInfo;

/**
 * Runs the assets client against a small in-process HTTP server.
 */
public class AssetsClientTest {

    private HttpServer server;
    private CloseableHttpClient httpClient;
    private AssetsClient client;
    private final AtomicReference<String> lastToken = new AtomicReference<String>();
    private final AtomicReference<String> lastPath = new AtomicReference<String>();

    @Before
    public void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/assets/", new HttpHandler() {
            @Override
            public void handle(HttpExchange exchange) throws IOException {
                lastToken.set(exchange.getRequestHeaders().getFirst("X-Internal-Token"));
                lastPath.set(exchange.getRequestURI().getPath());
                String path = exchange.getRequestURI().getPath();
                if (path.endsWith("/7")) {
                    respond(exchange, 200, "{\"id\":7,\"workspace_id\":3,\"title\":\"Ridge Jacket hero\","
                            + "\"tags\":[\"jacket\"],\"versions\":[]}");
                } else if (path.endsWith("/500")) {
                    respond(exchange, 500, "{\"error\":\"Internal server error\"}");
                } else {
                    respond(exchange, 404, "{\"error\":\"Asset not found\"}");
                }
            }
        });
        server.start();

        httpClient = HttpClients.createDefault();
        client = new AssetsClient();
        ReflectionTestUtils.setField(client, "httpClient", httpClient);
        ReflectionTestUtils.setField(client, "objectMapper", new ObjectMapper());
        ReflectionTestUtils.setField(client, "assetsUrl", "http://127.0.0.1:" + server.getAddress().getPort() + "/");
        ReflectionTestUtils.setField(client, "internalToken", "secret-internal");
    }

    @After
    public void stopServer() throws IOException {
        httpClient.close();
        server.stop(0);
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes("UTF-8");
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        OutputStream out = exchange.getResponseBody();
        try {
            out.write(bytes);
        } finally {
            out.close();
        }
    }

    @Test
    public void readsWorkspaceAndSendsTheInternalToken() {
        AssetInfo asset = client.findAsset(Long.valueOf(7));
        assertEquals(Long.valueOf(7), asset.getId());
        assertEquals(Long.valueOf(3), asset.getWorkspaceId());
        assertEquals("Ridge Jacket hero", asset.getTitle());
        assertEquals("secret-internal", lastToken.get());
        assertEquals("/assets/7", lastPath.get());
    }

    @Test
    public void notFoundIsNull() {
        assertNull(client.findAsset(Long.valueOf(8)));
    }

    @Test
    public void serverErrorIsUpstreamException() {
        try {
            client.findAsset(Long.valueOf(500));
            fail("expected UpstreamException");
        } catch (UpstreamException e) {
            assertEquals("Assets service returned HTTP 500", e.getMessage());
        }
    }

    @Test
    public void unreachableIsUpstreamException() {
        ReflectionTestUtils.setField(client, "assetsUrl", "http://127.0.0.1:1");
        try {
            client.findAsset(Long.valueOf(7));
            fail("expected UpstreamException");
        } catch (UpstreamException e) {
            assertEquals("Assets service unavailable", e.getMessage());
        }
    }
}
