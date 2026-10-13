package studio.lumen.rights.security;

import java.io.UnsupportedEncodingException;
import java.security.MessageDigest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import studio.lumen.rights.model.Caller;

/**
 * Validates identity-issued HS256 JWTs and the shared internal token.
 */
@Service
public class TokenService {

    private static final Logger LOG = LoggerFactory.getLogger(TokenService.class);

    private static final String UTF8 = "UTF-8";

    @Value("${lumen.token-secret}")
    private String tokenSecret;

    @Value("${lumen.internal-token}")
    private String internalToken;

    /**
     * @return the caller described by the token, or null if the token is invalid or expired
     */
    public Caller parseJwt(String token) {
        if (token == null || token.trim().isEmpty()) {
            return null;
        }
        Claims claims;
        try {
            claims = Jwts.parser()
                    .setSigningKey(tokenSecret.getBytes(UTF8))
                    .parseClaimsJws(token.trim())
                    .getBody();
        } catch (JwtException e) {
            LOG.debug("Rejected JWT: {}", e.getMessage());
            return null;
        } catch (IllegalArgumentException e) {
            LOG.debug("Rejected JWT: {}", e.getMessage());
            return null;
        } catch (UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }

        Long userId = toLong(claims.get("user_id"));
        Long workspaceId = toLong(claims.get("workspace_id"));
        if (userId == null || workspaceId == null) {
            return null;
        }
        Object role = claims.get("role");
        Object name = claims.get("name");
        return new Caller(userId, workspaceId,
                role == null ? null : role.toString(),
                name == null ? null : name.toString());
    }

    public boolean isInternalToken(String token) {
        if (token == null) {
            return false;
        }
        try {
            return MessageDigest.isEqual(internalToken.getBytes(UTF8), token.getBytes(UTF8));
        } catch (UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Long toLong(Object value) {
        if (value instanceof Number) {
            return Long.valueOf(((Number) value).longValue());
        }
        return null;
    }
}
