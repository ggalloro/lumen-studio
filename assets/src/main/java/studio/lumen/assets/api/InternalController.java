package studio.lumen.assets.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import studio.lumen.assets.api.Dtos.RenditionDto;
import studio.lumen.assets.auth.Access;
import studio.lumen.assets.auth.Access.Mode;
import studio.lumen.assets.service.AssetService;

/** Routes called by other services with the internal token. */
@RestController
public class InternalController {

    private final AssetService assets;

    public InternalController(AssetService assets) {
        this.assets = assets;
    }

    @PostMapping(path = "/internal/renditions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Access(Mode.INTERNAL)
    public RenditionDto registerRendition(
            @RequestParam(name = "asset_id") long assetId,
            @RequestParam int version,
            @RequestParam String preset,
            @RequestParam int width,
            @RequestParam int height,
            @RequestPart(name = "file", required = false) MultipartFile file) {
        return assets.registerRendition(assetId, version, preset, width, height, file);
    }
}
