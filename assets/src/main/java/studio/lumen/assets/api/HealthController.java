package studio.lumen.assets.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import studio.lumen.assets.api.Dtos.Health;

@RestController
public class HealthController {

    @GetMapping("/health")
    public Health health() {
        return new Health("ok", "assets");
    }
}
