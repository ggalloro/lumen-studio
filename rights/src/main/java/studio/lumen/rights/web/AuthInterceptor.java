package studio.lumen.rights.web;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.handler.HandlerInterceptorAdapter;

import com.fasterxml.jackson.databind.ObjectMapper;

import studio.lumen.rights.client.AssetsClient;
import studio.lumen.rights.model.Caller;
import studio.lumen.rights.security.TokenService;

/**
 * Authenticates every /rights request. A request passes if it carries a valid
 * bearer JWT, a valid internal token, or both. The JWT caller (if any) and the
 * internal flag are stored as request attributes for the controllers.
 */
@Component
public class AuthInterceptor extends HandlerInterceptorAdapter {

    public static final String CALLER_ATTRIBUTE = "studio.lumen.rights.caller";
    public static final String INTERNAL_ATTRIBUTE = "studio.lumen.rights.internal";

    private static final String BEARER_PREFIX = "Bearer ";

    @Autowired
    private TokenService tokenService;

    @Autowired
    private ObjectMapper objectMapper;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        boolean internal = tokenService.isInternalToken(request.getHeader(AssetsClient.INTERNAL_TOKEN_HEADER));
        Caller caller = null;

        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authorization != null && authorization.regionMatches(true, 0, BEARER_PREFIX, 0, BEARER_PREFIX.length())) {
            caller = tokenService.parseJwt(authorization.substring(BEARER_PREFIX.length()));
        }

        if (!internal && caller == null) {
            writeUnauthorized(response, "Missing or invalid token");
            return false;
        }

        request.setAttribute(INTERNAL_ATTRIBUTE, Boolean.valueOf(internal));
        if (caller != null) {
            request.setAttribute(CALLER_ATTRIBUTE, caller);
        }
        return true;
    }

    private void writeUnauthorized(HttpServletResponse response, String message) throws IOException {
        Map<String, Object> body = new HashMap<String, Object>();
        body.put("error", message);
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getWriter(), body);
    }
}
