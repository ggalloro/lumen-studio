package studio.lumen.assets.auth;

import java.util.Optional;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import studio.lumen.assets.api.ApiException;

/**
 * Enforces {@link Access} on handler methods and stores the resolved {@link Caller}
 * as a request attribute.
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    static final String INTERNAL_HEADER = "X-Internal-Token";

    private final TokenVerifier verifier;

    public AuthInterceptor(TokenVerifier verifier) {
        this.verifier = verifier;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod method)) {
            return true;
        }
        Access access = method.getMethodAnnotation(Access.class);
        if (access == null) {
            return true;
        }

        Caller caller = switch (access.value()) {
            case USER -> userCaller(request)
                    .orElseThrow(() -> unauthorized("Missing or invalid bearer token"));
            case INTERNAL -> internalCaller(request)
                    .orElseThrow(() -> unauthorized("Missing or invalid internal token"));
            case USER_OR_INTERNAL -> internalCaller(request)
                    .or(() -> userCaller(request))
                    .orElseThrow(() -> unauthorized("Missing or invalid token"));
        };
        request.setAttribute(Caller.REQUEST_ATTRIBUTE, caller);
        return true;
    }

    private Optional<Caller> internalCaller(HttpServletRequest request) {
        return verifier.isInternalToken(request.getHeader(INTERNAL_HEADER))
                ? Optional.of(Caller.internalService())
                : Optional.empty();
    }

    private Optional<Caller> userCaller(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return Optional.empty();
        }
        return verifier.verifyJwt(header.substring(7).trim());
    }

    private static ApiException unauthorized(String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, message);
    }
}
