package studio.lumen.rights;

import static org.mockito.Mockito.when;

import java.io.File;
import java.io.UnsupportedEncodingException;
import java.util.Date;
import java.util.List;

import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;
import org.joda.time.LocalDate;
import org.junit.Before;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.util.FileSystemUtils;

import com.google.common.collect.Lists;
import com.google.common.io.Files;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import studio.lumen.rights.client.AssetsClient;
import studio.lumen.rights.dao.RightsDao;
import studio.lumen.rights.model.AssetInfo;
import studio.lumen.rights.model.RightsRecord;
import studio.lumen.rights.util.DateProvider;

/**
 * Boots the full application against a throwaway data directory, with the
 * assets client and the clock replaced by mocks.
 */
@RunWith(SpringRunner.class)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "lumen.token-secret=" + AbstractApiTest.TOKEN_SECRET,
        "lumen.internal-token=" + AbstractApiTest.INTERNAL_TOKEN,
        "spring.main.banner-mode=off",
        "logging.level.root=WARN",
        "logging.level.studio.lumen.rights=ERROR",
        "logging.level.org.springframework.web.servlet.PageNotFound=ERROR"
})
public abstract class AbstractApiTest {

    public static final String TOKEN_SECRET = "test-secret-change-me";
    public static final String INTERNAL_TOKEN = "test-internal-token";

    public static final LocalDate TODAY = new LocalDate(2026, 10, 13);
    public static final DateTime NOW = new DateTime(2026, 10, 13, 9, 30, 0, DateTimeZone.UTC);

    protected static final File DATA_DIR;

    static {
        DATA_DIR = Files.createTempDir();
        System.setProperty("DATA_DIR", DATA_DIR.getAbsolutePath());
        Runtime.getRuntime().addShutdownHook(new Thread() {
            @Override
            public void run() {
                FileSystemUtils.deleteRecursively(DATA_DIR);
            }
        });
    }

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected RightsDao rightsDao;

    @MockBean
    protected AssetsClient assetsClient;

    @MockBean
    protected DateProvider dateProvider;

    @Before
    public void resetState() {
        rightsDao.deleteAll();
        when(dateProvider.today()).thenReturn(TODAY);
        when(dateProvider.now()).thenReturn(NOW);
    }

    protected void givenAsset(long assetId, long workspaceId) {
        when(assetsClient.findAsset(Long.valueOf(assetId)))
                .thenReturn(new AssetInfo(Long.valueOf(assetId), Long.valueOf(workspaceId), "Asset " + assetId));
    }

    protected static String bearer(String token) {
        return "Bearer " + token;
    }

    protected static String designerToken() {
        return token(1, 1, "designer", "Leo Park", TOKEN_SECRET, 3600);
    }

    protected static String brandAdminToken() {
        return token(5, 1, "brand_admin", "Priya Natarajan", TOKEN_SECRET, 3600);
    }

    protected static String reviewerToken() {
        return token(3, 1, "reviewer", "Maya Okafor", TOKEN_SECRET, 3600);
    }

    protected static String otherWorkspaceToken() {
        return token(21, 2, "designer", "Other Designer", TOKEN_SECRET, 3600);
    }

    protected static String token(long userId, long workspaceId, String role, String name,
            String secret, int expiresInSeconds) {
        try {
            return Jwts.builder()
                    .claim("user_id", Long.valueOf(userId))
                    .claim("workspace_id", Long.valueOf(workspaceId))
                    .claim("role", role)
                    .claim("name", name)
                    .setExpiration(new Date(System.currentTimeMillis() + expiresInSeconds * 1000L))
                    .signWith(SignatureAlgorithm.HS256, secret.getBytes("UTF-8"))
                    .compact();
        } catch (UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    protected RightsRecord seed(long assetId, long workspaceId, String validFrom, String expiresOn,
            boolean releaseRequired, boolean releaseOnFile, String... channels) {
        RightsRecord record = new RightsRecord();
        record.setAssetId(Long.valueOf(assetId));
        record.setWorkspaceId(Long.valueOf(workspaceId));
        record.setLicenseType("licensed");
        record.setLicensor("Synthetic Licensor " + assetId);
        List<String> list = Lists.newArrayList(channels);
        record.setChannels(list);
        record.setValidFrom(validFrom);
        record.setExpiresOn(expiresOn);
        record.setModelReleaseRequired(releaseRequired);
        record.setModelReleaseOnFile(releaseOnFile);
        record.setNotes("");
        record.setUpdatedBy(Long.valueOf(5));
        record.setUpdatedAt("2026-10-01T08:00:00Z");
        rightsDao.save(record);
        return record;
    }
}
