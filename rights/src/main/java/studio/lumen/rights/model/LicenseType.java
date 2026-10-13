package studio.lumen.rights.model;

import java.util.ArrayList;
import java.util.List;

public enum LicenseType {

    OWNED("owned"),
    LICENSED("licensed"),
    UGC("ugc");

    private final String code;

    LicenseType(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public static LicenseType fromCode(String code) {
        if (code == null) {
            return null;
        }
        for (LicenseType type : values()) {
            if (type.code.equals(code)) {
                return type;
            }
        }
        return null;
    }

    public static List<String> codes() {
        List<String> codes = new ArrayList<String>();
        for (LicenseType type : values()) {
            codes.add(type.code);
        }
        return codes;
    }
}
