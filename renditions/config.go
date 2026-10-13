package main

import (
	"os"
	"strings"
)

// Config holds runtime settings read from the environment.
type Config struct {
	Port          string
	InternalToken string
	AssetsURL     string
	Workers       int
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// LoadConfig reads configuration from environment variables with contract defaults.
func LoadConfig() Config {
	return Config{
		Port:          getenv("PORT", "8083"),
		InternalToken: getenv("INTERNAL_TOKEN", "dev-internal-token"),
		AssetsURL:     strings.TrimRight(getenv("ASSETS_URL", "http://localhost:8082"), "/"),
		Workers:       2,
	}
}
