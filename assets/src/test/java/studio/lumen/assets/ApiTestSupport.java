package studio.lumen.assets;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.fasterxml.jackson.databind.ObjectMapper;

import studio.lumen.assets.webhook.RenditionsNotifier;

/**
 * Shared setup: a temporary DATA_DIR, a mocked renditions webhook and helpers for tokens and images.
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class ApiTestSupport {

    protected static final String SECRET = "dev-secret-change-me";
    protected static final String INTERNAL_TOKEN = "dev-internal-token";

    private static final Path DATA_DIR = createDataDir();

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("lumen.data-dir", DATA_DIR::toString);
        registry.add("lumen.token-secret", () -> SECRET);
        registry.add("lumen.internal-token", () -> INTERNAL_TOKEN);
    }

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @Autowired
    protected JdbcTemplate jdbc;

    @MockitoBean
    protected RenditionsNotifier notifier;

    @BeforeEach
    void cleanDatabase() {
        jdbc.update("DELETE FROM renditions");
        jdbc.update("DELETE FROM versions");
        jdbc.update("DELETE FROM asset_tags");
        jdbc.update("DELETE FROM assets");
        jdbc.update("DELETE FROM blobs");
    }

    protected static String bearer(int userId, int workspaceId, String role) {
        return "Bearer " + token(userId, workspaceId, role, SECRET);
    }

    protected static String token(int userId, int workspaceId, String role, String secret) {
        return JWT.create()
                .withClaim("user_id", userId)
                .withClaim("workspace_id", workspaceId)
                .withClaim("role", role)
                .withClaim("name", "Test User " + userId)
                .withExpiresAt(Instant.now().plus(12, ChronoUnit.HOURS))
                .sign(Algorithm.HMAC256(secret));
    }

    protected static byte[] image(String format, int width, int height, Color color) {
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, width, height);
        g.dispose();
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, format, out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    protected static byte[] png(int width, int height) {
        return image("png", width, height, Color.ORANGE);
    }

    protected static byte[] jpeg(int width, int height) {
        return image("jpg", width, height, Color.BLUE);
    }

    private static Path createDataDir() {
        try {
            Path dir = Files.createTempDirectory("assets-test-");
            dir.toFile().deleteOnExit();
            return dir;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
