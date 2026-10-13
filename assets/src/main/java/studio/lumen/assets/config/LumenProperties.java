package studio.lumen.assets.config;

import java.nio.file.Path;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Service settings, bound from the environment variables listed in docs/api.md
 * (see application.properties for the mapping).
 */
@ConfigurationProperties(prefix = "lumen")
public record LumenProperties(
        Path dataDir,
        String tokenSecret,
        String internalToken,
        String renditionsUrl,
        String selfUrl) {

    public Path blobDir() {
        return dataDir.resolve("blobs");
    }

    public Path databaseFile() {
        return dataDir.resolve("assets.db");
    }
}
