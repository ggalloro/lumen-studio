package studio.lumen.rights.util;

import java.util.regex.Pattern;

import org.joda.time.DateTime;
import org.joda.time.LocalDate;
import org.joda.time.format.DateTimeFormat;
import org.joda.time.format.DateTimeFormatter;

/**
 * Date parsing and formatting shared by the API and the DAO.
 */
public final class DateUtils {

    public static final String DATE_PATTERN = "yyyy-MM-dd";

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormat.forPattern(DATE_PATTERN);

    private static final DateTimeFormatter TIMESTAMP_FORMAT =
            DateTimeFormat.forPattern("yyyy-MM-dd'T'HH:mm:ss'Z'").withZoneUTC();

    private static final Pattern DATE_SHAPE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    private DateUtils() {
    }

    /**
     * Parses a strict YYYY-MM-DD date.
     *
     * @return the date, or null if the value is not a valid calendar date in that format
     */
    public static LocalDate parseDate(String value) {
        if (value == null || !DATE_SHAPE.matcher(value).matches()) {
            return null;
        }
        try {
            return DATE_FORMAT.parseLocalDate(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    public static String formatDate(LocalDate date) {
        return date == null ? null : DATE_FORMAT.print(date);
    }

    public static String formatTimestamp(DateTime timestamp) {
        return timestamp == null ? null : TIMESTAMP_FORMAT.print(timestamp);
    }
}
