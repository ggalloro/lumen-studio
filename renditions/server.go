package main

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
)

// Server wires HTTP routes to the job manager.
type Server struct {
	cfg  Config
	jobs *JobManager
	log  *slog.Logger
}

// NewServer builds the HTTP handler for the service.
func NewServer(cfg Config, jobs *JobManager, log *slog.Logger) http.Handler {
	s := &Server{cfg: cfg, jobs: jobs, log: log}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /presets", s.handlePresets)
	mux.Handle("POST /internal/jobs", s.internalOnly(http.HandlerFunc(s.handleCreateJob)))
	mux.Handle("GET /internal/jobs/{job_id}", s.internalOnly(http.HandlerFunc(s.handleGetJob)))
	return s.logRequests(mux)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *Server) internalOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got := r.Header.Get("X-Internal-Token")
		if got == "" || subtle.ConstantTimeCompare([]byte(got), []byte(s.cfg.InternalToken)) != 1 {
			writeError(w, http.StatusUnauthorized, "missing or invalid internal token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			s.log.Info("request", "method", r.Method, "path", r.URL.Path)
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "renditions"})
}

func (s *Server) handlePresets(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"items": Presets})
}

type createJobRequest struct {
	AssetID int64  `json:"asset_id"`
	Version int64  `json:"version"`
	BlobURL string `json:"blob_url"`
}

func (s *Server) handleCreateJob(w http.ResponseWriter, r *http.Request) {
	var req createJobRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	switch {
	case req.AssetID <= 0:
		writeError(w, http.StatusBadRequest, "asset_id must be a positive integer")
		return
	case req.Version <= 0:
		writeError(w, http.StatusBadRequest, "version must be a positive integer")
		return
	case strings.TrimSpace(req.BlobURL) == "":
		writeError(w, http.StatusBadRequest, "blob_url is required")
		return
	}

	job, err := s.jobs.Submit(req.AssetID, req.Version, req.BlobURL)
	if errors.Is(err, ErrQueueFull) {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not queue job")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"job_id": job.JobID, "status": job.Status})
}

func (s *Server) handleGetJob(w http.ResponseWriter, r *http.Request) {
	job, ok := s.jobs.Get(r.PathValue("job_id"))
	if !ok {
		writeError(w, http.StatusNotFound, "job not found")
		return
	}
	writeJSON(w, http.StatusOK, job)
}
