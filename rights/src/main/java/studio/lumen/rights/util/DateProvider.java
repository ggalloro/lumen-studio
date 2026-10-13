package studio.lumen.rights.util;

import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;
import org.joda.time.LocalDate;
import org.springframework.stereotype.Component;

/**
 * Source of the current date and time, in UTC. Kept as a bean so tests can
 * pin "today".
 */
@Component
public class DateProvider {

    public LocalDate today() {
        return new LocalDate(DateTimeZone.UTC);
    }

    public DateTime now() {
        return new DateTime(DateTimeZone.UTC);
    }
}
