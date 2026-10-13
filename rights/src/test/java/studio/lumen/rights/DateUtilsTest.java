package studio.lumen.rights;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;
import org.joda.time.LocalDate;
import org.junit.Test;

import studio.lumen.rights.util.DateUtils;

public class DateUtilsTest {

    @Test
    public void parsesStrictIsoDates() {
        assertEquals(new LocalDate(2026, 10, 13), DateUtils.parseDate("2026-10-13"));
        assertEquals(new LocalDate(2028, 2, 29), DateUtils.parseDate("2028-02-29"));
    }

    @Test
    public void rejectsAnythingElse() {
        assertNull(DateUtils.parseDate(null));
        assertNull(DateUtils.parseDate(""));
        assertNull(DateUtils.parseDate("2026-1-5"));
        assertNull(DateUtils.parseDate("2026-02-30"));
        assertNull(DateUtils.parseDate("2027-02-29"));
        assertNull(DateUtils.parseDate("13/10/2026"));
        assertNull(DateUtils.parseDate("2026-10-13T00:00:00Z"));
    }

    @Test
    public void formatsTimestampsInUtc() {
        DateTime rome = new DateTime(2026, 10, 13, 11, 30, 0, DateTimeZone.forID("Europe/Rome"));
        assertEquals("2026-10-13T09:30:00Z", DateUtils.formatTimestamp(rome));
    }
}
