package studio.lumen.assets.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import studio.lumen.assets.api.Dtos.AssetDto;
import studio.lumen.assets.api.Dtos.AssetList;
import studio.lumen.assets.api.Dtos.VersionDto;
import studio.lumen.assets.auth.Access;
import studio.lumen.assets.auth.Access.Mode;
import studio.lumen.assets.auth.Caller;
import studio.lumen.assets.service.AssetService;

@RestController
public class AssetController {

    private final AssetService assets;

    public AssetController(AssetService assets) {
        this.assets = assets;
    }

    @GetMapping("/assets")
    @Access(Mode.USER_OR_INTERNAL)
    public AssetList list(Caller caller,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String tag,
            @RequestParam(name = "owner_id", required = false) Long ownerId) {
        return new AssetList(assets.list(caller, q, tag, ownerId));
    }

    @PostMapping(path = "/assets", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Access(Mode.USER)
    public AssetDto create(Caller caller,
            @RequestPart(name = "file", required = false) MultipartFile file,
            @RequestParam(required = false) String title,
            @RequestParam(required = false) String description,
            @RequestParam(required = false) String tags,
            @RequestParam(name = "alt_text", required = false) String altText) {
        return assets.create(caller, file, title, description, tags, altText);
    }

    @GetMapping("/assets/{id}")
    @Access(Mode.USER_OR_INTERNAL)
    public AssetDto get(Caller caller, @PathVariable long id) {
        return assets.get(caller, id);
    }

    @PostMapping(path = "/assets/{id}/versions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Access(Mode.USER)
    public VersionDto addVersion(Caller caller, @PathVariable long id,
            @RequestPart(name = "file", required = false) MultipartFile file,
            @RequestParam(name = "alt_text", required = false) String altText) {
        return assets.addVersion(caller, id, file, altText);
    }

    @GetMapping("/assets/{id}/versions/{version}")
    @Access(Mode.USER_OR_INTERNAL)
    public VersionDto getVersion(Caller caller, @PathVariable long id, @PathVariable int version) {
        return assets.getVersion(caller, id, version);
    }
}
