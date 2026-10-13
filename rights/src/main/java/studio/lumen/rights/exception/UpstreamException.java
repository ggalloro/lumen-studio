package studio.lumen.rights.exception;

import org.springframework.http.HttpStatus;

public class UpstreamException extends ApiException {

    private static final long serialVersionUID = 1L;

    public UpstreamException(String message) {
        super(HttpStatus.BAD_GATEWAY, message);
    }

    public UpstreamException(String message, Throwable cause) {
        super(HttpStatus.BAD_GATEWAY, message, cause);
    }
}
