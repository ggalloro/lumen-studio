// Command renditions produces channel-specific image renditions for asset
// versions and registers them with the assets service.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))
	cfg := LoadConfig()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	jobs := NewJobManager(cfg, log)
	jobs.Start(ctx)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           NewServer(cfg, jobs, log),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Info("renditions listening", "port", cfg.Port, "assets_url", cfg.AssetsURL)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	jobs.Wait()
	log.Info("renditions stopped")
}
