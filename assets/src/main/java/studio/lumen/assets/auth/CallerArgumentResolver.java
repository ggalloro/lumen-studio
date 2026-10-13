package studio.lumen.assets.auth;

import org.springframework.core.MethodParameter;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/** Supplies the {@link Caller} resolved by {@link AuthInterceptor} into handler parameters. */
public class CallerArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return Caller.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        Object caller = webRequest.getAttribute(Caller.REQUEST_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
        if (caller == null) {
            throw new IllegalStateException("Handler takes a Caller but has no @Access annotation");
        }
        return caller;
    }
}
