package studio.lumen.assets.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

final class Timestamps {

    private Timestamps() {
    }

    /** Current time as an ISO 8601 UTC string with second precision, e.g. 2026-10-13T09:30:00Z. */
    static String now() {
        return Instant.now().truncatedTo(ChronoUnit.SECONDS).toString();
    }
}
