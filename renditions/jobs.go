package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Job statuses.
const (
	StatusQueued  = "queued"
	StatusRunning = "running"
	StatusDone    = "done"
	StatusFailed  = "failed"
)

// maxSourceBytes caps the download size. Assets accepts uploads up to 25 MB.
const maxSourceBytes = 50 << 20

// ErrQueueFull is returned when the job queue cannot accept more work.
var ErrQueueFull = errors.New("job queue is full")

// Job is the externally visible state of a rendition job.
type Job struct {
	JobID       string   `json:"job_id"`
	AssetID     int64    `json:"asset_id"`
	Version     int64    `json:"version"`
	Status      string   `json:"status"`
	Error       string   `json:"error"`
	PresetsDone []string `json:"presets_done"`

	blobURL string
}

// JobManager tracks jobs in memory and runs them on a fixed pool of workers.
type JobManager struct {
	cfg    Config
	client *http.Client
	log    *slog.Logger

	mu    sync.Mutex
	jobs  map[string]*Job
	queue chan string
	wg    sync.WaitGroup
}

// NewJobManager creates a manager. Call Start to launch workers.
func NewJobManager(cfg Config, log *slog.Logger) *JobManager {
	return &JobManager{
		cfg:    cfg,
		client: &http.Client{Timeout: 60 * time.Second},
		log:    log,
		jobs:   make(map[string]*Job),
		queue:  make(chan string, 256),
	}
}

// Start launches the worker goroutines. They exit when ctx is cancelled.
func (m *JobManager) Start(ctx context.Context) {
	n := m.cfg.Workers
	if n < 1 {
		n = 1
	}
	for i := 0; i < n; i++ {
		m.wg.Add(1)
		go func() {
			defer m.wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case id := <-m.queue:
					m.run(ctx, id)
				}
			}
		}()
	}
}

// Wait blocks until all workers have exited.
func (m *JobManager) Wait() { m.wg.Wait() }

// Submit registers a new job and queues it.
func (m *JobManager) Submit(assetID, version int64, blobURL string) (Job, error) {
	job := &Job{
		JobID:       newJobID(),
		AssetID:     assetID,
		Version:     version,
		Status:      StatusQueued,
		PresetsDone: []string{},
		blobURL:     blobURL,
	}
	m.mu.Lock()
	m.jobs[job.JobID] = job
	snapshot := job.snapshot()
	m.mu.Unlock()

	select {
	case m.queue <- job.JobID:
		return snapshot, nil
	default:
		m.mu.Lock()
		delete(m.jobs, job.JobID)
		m.mu.Unlock()
		return Job{}, ErrQueueFull
	}
}

// Get returns a copy of the job state.
func (m *JobManager) Get(id string) (Job, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	job, ok := m.jobs[id]
	if !ok {
		return Job{}, false
	}
	return job.snapshot(), true
}

func (j *Job) snapshot() Job {
	c := *j
	c.PresetsDone = append([]string{}, j.PresetsDone...)
	return c
}

func (m *JobManager) update(id string, fn func(j *Job)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j, ok := m.jobs[id]; ok {
		fn(j)
	}
}

func (m *JobManager) run(ctx context.Context, id string) {
	var job Job
	m.update(id, func(j *Job) {
		j.Status = StatusRunning
		job = j.snapshot()
	})
	log := m.log.With("job_id", id, "asset_id", job.AssetID, "version", job.Version)
	log.Info("job started")

	fail := func(err error) {
		log.Error("job failed", "error", err)
		m.update(id, func(j *Job) {
			j.Status = StatusFailed
			j.Error = err.Error()
		})
	}

	src, err := m.download(ctx, job.blobURL)
	if err != nil {
		fail(err)
		return
	}
	img, err := Decode(bytes.NewReader(src))
	if err != nil {
		fail(err)
		return
	}

	// Render every preset even if one fails, so a single bad upload does not
	// block the remaining channels.
	var errs []string
	for _, p := range Presets {
		if err := m.renderAndUpload(ctx, job, img, p); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", p.ID, err))
			continue
		}
		m.update(id, func(j *Job) { j.PresetsDone = append(j.PresetsDone, p.ID) })
	}
	if len(errs) > 0 {
		fail(errors.New(strings.Join(errs, "; ")))
		return
	}
	m.update(id, func(j *Job) { j.Status = StatusDone })
	log.Info("job done")
}

// resolveURL accepts an absolute blob URL or a path relative to ASSETS_URL.
func (m *JobManager) resolveURL(u string) string {
	if strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://") {
		return u
	}
	return m.cfg.AssetsURL + "/" + strings.TrimLeft(u, "/")
}

func (m *JobManager) download(ctx context.Context, blobURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, m.resolveURL(blobURL), nil)
	if err != nil {
		return nil, fmt.Errorf("build download request: %w", err)
	}
	resp, err := m.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download source: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download source: unexpected status %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxSourceBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read source: %w", err)
	}
	if len(data) > maxSourceBytes {
		return nil, fmt.Errorf("source exceeds %d bytes", maxSourceBytes)
	}
	return data, nil
}

func (m *JobManager) renderAndUpload(ctx context.Context, job Job, img image.Image, p Preset) error {
	out := Render(img, p)
	data, err := EncodeJPEG(out)
	if err != nil {
		return err
	}
	b := out.Bounds()
	return m.upload(ctx, job, p.ID, b.Dx(), b.Dy(), data)
}

func (m *JobManager) upload(ctx context.Context, job Job, preset string, width, height int, data []byte) error {
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	fields := [][2]string{
		{"asset_id", strconv.FormatInt(job.AssetID, 10)},
		{"version", strconv.FormatInt(job.Version, 10)},
		{"preset", preset},
		{"width", strconv.Itoa(width)},
		{"height", strconv.Itoa(height)},
	}
	for _, f := range fields {
		if err := w.WriteField(f[0], f[1]); err != nil {
			return err
		}
	}
	filename := fmt.Sprintf("%d_v%d_%s.jpg", job.AssetID, job.Version, preset)
	part, err := createImagePart(w, filename)
	if err != nil {
		return err
	}
	if _, err := part.Write(data); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.cfg.AssetsURL+"/internal/renditions", &body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("X-Internal-Token", m.cfg.InternalToken)
	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("upload rendition: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("upload rendition: status %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	return nil
}

func newJobID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return hex.EncodeToString(b[:])
}

// createImagePart adds a "file" part with an image/jpeg content type.
// multipart.Writer.CreateFormFile always uses application/octet-stream.
func createImagePart(w *multipart.Writer, filename string) (io.Writer, error) {
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename=%q`, filename))
	h.Set("Content-Type", "image/jpeg")
	return w.CreatePart(h)
}
