package studio.lumen.assets.api;

import java.nio.charset.StandardCharsets;

/**
 * Builds Content-Disposition values with an ASCII {@code filename} fallback and an
 * RFC 5987 {@code filename*} parameter carrying the exact UTF-8 name (RFC 6266).
 */
final class ContentDispositions {

    private static final char[] HEX = "0123456789ABCDEF".toCharArray();

    private ContentDispositions() {
    }

    static String build(String type, String filename) {
        return type + "; filename=\"" + asciiFallback(filename) + "\"; filename*=UTF-8''" + encode(filename);
    }

    /** Replaces anything outside printable ASCII, plus quote and backslash, with an underscore. */
    static String asciiFallback(String filename) {
        StringBuilder sb = new StringBuilder(filename.length());
        for (int i = 0; i < filename.length(); ) {
            int cp = filename.codePointAt(i);
            i += Character.charCount(cp);
            boolean safe = cp >= 0x20 && cp < 0x7F && cp != '"' && cp != '\\';
            sb.append(safe ? (char) cp : '_');
        }
        return sb.toString();
    }

    /** Percent-encodes everything except RFC 5987 attr-char. */
    static String encode(String filename) {
        StringBuilder sb = new StringBuilder();
        for (byte b : filename.getBytes(StandardCharsets.UTF_8)) {
            char c = (char) (b & 0xFF);
            if (isAttrChar(c)) {
                sb.append(c);
            } else {
                sb.append('%').append(HEX[(b >> 4) & 0x0F]).append(HEX[b & 0x0F]);
            }
        }
        return sb.toString();
    }

    private static boolean isAttrChar(char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
                || "!#$&+-.^_`|~".indexOf(c) >= 0;
    }
}
