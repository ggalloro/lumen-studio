package studio.lumen.assets.storage;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.Optional;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

/** Identifies supported image formats by magic bytes and reads their dimensions. */
public final class ImageInspector {

    public enum ImageType {
        PNG("image/png", "png"),
        JPEG("image/jpeg", "jpg");

        private final String contentType;
        private final String extension;

        ImageType(String contentType, String extension) {
            this.contentType = contentType;
            this.extension = extension;
        }

        public String contentType() {
            return contentType;
        }

        public String extension() {
            return extension;
        }
    }

    public record Dimensions(int width, int height) {
    }

    private static final byte[] PNG_MAGIC = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};
    private static final byte[] JPEG_MAGIC = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};

    private ImageInspector() {
    }

    public static Optional<ImageType> detect(byte[] data) {
        if (startsWith(data, PNG_MAGIC)) {
            return Optional.of(ImageType.PNG);
        }
        if (startsWith(data, JPEG_MAGIC)) {
            return Optional.of(ImageType.JPEG);
        }
        return Optional.empty();
    }

    /** Maps a declared multipart content type to a supported type, ignoring parameters and case. */
    public static Optional<ImageType> fromContentType(String contentType) {
        if (contentType == null) {
            return Optional.empty();
        }
        String base = contentType.split(";", 2)[0].trim().toLowerCase();
        return switch (base) {
            case "image/png" -> Optional.of(ImageType.PNG);
            case "image/jpeg", "image/jpg", "image/pjpeg" -> Optional.of(ImageType.JPEG);
            default -> Optional.empty();
        };
    }

    /**
     * Reads width and height from the image header without decoding the pixel data.
     * Returns empty when no reader understands the bytes.
     */
    public static Optional<Dimensions> dimensions(byte[] data) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
            if (in == null) {
                return Optional.empty();
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                return Optional.empty();
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                return Optional.of(new Dimensions(reader.getWidth(0), reader.getHeight(0)));
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            return Optional.empty();
        }
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        if (data == null || data.length < prefix.length) {
            return false;
        }
        for (int i = 0; i < prefix.length; i++) {
            if (data[i] != prefix[i]) {
                return false;
            }
        }
        return true;
    }
}
