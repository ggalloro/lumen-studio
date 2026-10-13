package studio.lumen.assets.storage;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import studio.lumen.assets.config.LumenProperties;

/** Content-addressed file storage under {@code $DATA_DIR/blobs/<sha256>}. */
@Component
public class BlobStore {

    private static final Pattern SHA256_HEX = Pattern.compile("[0-9a-f]{64}");

    private final Path dir;

    public BlobStore(LumenProperties props) {
        this.dir = props.blobDir();
    }

    public static String sha256(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static boolean isValidHash(String sha256) {
        return sha256 != null && SHA256_HEX.matcher(sha256).matches();
    }

    /** Writes the bytes if not already stored and returns their hash. */
    public String put(byte[] data) {
        String sha = sha256(data);
        Path target = dir.resolve(sha);
        if (Files.exists(target)) {
            return sha;
        }
        try {
            Files.createDirectories(dir);
            Path tmp = Files.createTempFile(dir, ".upload-", ".tmp");
            try {
                Files.write(tmp, data);
                Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (FileAlreadyExistsException e) {
                // Stored concurrently by another request with identical content.
            } finally {
                Files.deleteIfExists(tmp);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to store blob " + sha, e);
        }
        return sha;
    }

    public Path path(String sha256) {
        if (!isValidHash(sha256)) {
            throw new IllegalArgumentException("Invalid blob hash");
        }
        return dir.resolve(sha256);
    }
}
