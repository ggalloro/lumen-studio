package studio.lumen.assets.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTVerifier;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.JWTVerificationException;
import com.auth0.jwt.interfaces.Claim;
import com.auth0.jwt.interfaces.DecodedJWT;

import studio.lumen.assets.config.LumenProperties;

/**
 * Validates identity-issued HS256 JWTs and the shared internal token.
 */
@Component
public class TokenVerifier {

    private final JWTVerifier jwtVerifier;
    private final byte[] internalToken;

    public TokenVerifier(LumenProperties props) {
        // HMAC256 accepts secrets of any length, matching what PyJWT allows on the issuing side.
        this.jwtVerifier = JWT.require(Algorithm.HMAC256(props.tokenSecret())).build();
        this.internalToken = props.internalToken().getBytes(StandardCharsets.UTF_8);
    }

    public Optional<Caller> verifyJwt(String token) {
        try {
            DecodedJWT jwt = jwtVerifier.verify(token);
            Integer userId = intClaim(jwt.getClaim("user_id"));
            Integer workspaceId = intClaim(jwt.getClaim("workspace_id"));
            if (userId == null || workspaceId == null) {
                return Optional.empty();
            }
            return Optional.of(Caller.user(userId, workspaceId,
                    jwt.getClaim("role").asString(), jwt.getClaim("name").asString()));
        } catch (JWTVerificationException e) {
            return Optional.empty();
        }
    }

    public boolean isInternalToken(String token) {
        return token != null
                && MessageDigest.isEqual(internalToken, token.getBytes(StandardCharsets.UTF_8));
    }

    private static Integer intClaim(Claim claim) {
        if (claim == null || claim.isMissing() || claim.isNull()) {
            return null;
        }
        return claim.asInt();
    }
}
