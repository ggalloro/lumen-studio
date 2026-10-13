package studio.lumen.assets.api;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import studio.lumen.assets.service.AssetService;
import studio.lumen.assets.storage.AssetRepository.BlobRow;
import studio.lumen.assets.storage.BlobStore;

/** Serves stored files. Public: knowing the content hash is the capability. */
@RestController
public class BlobController {

    private final AssetService assets;
    private final BlobStore blobs;

    public BlobController(AssetService assets, BlobStore blobs) {
        this.assets = assets;
        this.blobs = blobs;
    }

    @GetMapping("/blobs/{sha256}")
    public ResponseEntity<Resource> get(@PathVariable String sha256,
            @RequestParam(required = false) String download) {
        BlobRow blob = assets.blob(sha256);
        Path path = blobs.path(blob.sha256());
        if (!Files.isRegularFile(path)) {
            throw ApiException.notFound("Blob not found");
        }
        boolean attachment = "1".equals(download) || "true".equalsIgnoreCase(download);

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(blob.contentType()))
                .contentLength(blob.sizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDispositions.build(attachment ? "attachment" : "inline", blob.filename()))
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .body(new FileSystemResource(path));
    }
}
