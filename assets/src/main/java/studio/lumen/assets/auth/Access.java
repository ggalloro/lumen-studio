package studio.lumen.assets.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Declares which credentials a handler accepts. Handlers without this annotation are public.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Access {

    Mode value();

    enum Mode {
        /** End-user bearer JWT only. */
        USER,
        /** Bearer JWT or the X-Internal-Token header. */
        USER_OR_INTERNAL,
        /** X-Internal-Token header only. */
        INTERNAL
    }
}
