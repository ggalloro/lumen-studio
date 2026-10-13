package main

import (
	"bytes"
	"context"
	"encoding/json"
	"image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

const testToken = "test-internal-token"

func newTestService(t *testing.T, assetsURL string) *httptest.Server {
	t.Helper()
	cfg := Config{Port: "0", InternalToken: testToken, AssetsURL: assetsURL, Workers: 1}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	ctx, cancel := context.WithCancel(context.Background())
	jobs := NewJobManager(cfg, log)
	jobs.Start(ctx)
	srv := httptest.NewServer(NewServer(cfg, jobs, log))
	t.Cleanup(func() {
		srv.Close()
		cancel()
		jobs.Wait()
	})
	return srv
}

func doJSON(t *testing.T, method, url, token string, body any) (*http.Response, map[string]any) {
	t.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, url, r)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("X-Internal-Token", token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp, out
}

func TestHealth(t *testing.T) {
	srv := newTestService(t, "http://unused")
	resp, body := doJSON(t, http.MethodGet, srv.URL+"/health", "", nil)
	if resp.StatusCode != http.StatusOK || body["status"] != "ok" || body["service"] != "renditions" {
		t.Fatalf("unexpected health response: %d %v", resp.StatusCode, body)
	}
}

func TestPresetsEndpoint(t *testing.T) {
	srv := newTestService(t, "http://unused")
	resp, err := http.Get(srv.URL + "/presets")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	var body struct {
		Items []Preset `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	want := map[string][2]int{
		"instagram_square": {1080, 1080},
		"story":            {1080, 1920},
		"web_banner":       {1200, 628},
		"email_header":     {600, 200},
		"thumbnail":        {320, 320},
	}
	if len(body.Items) != len(want) {
		t.Fatalf("got %d presets, want %d", len(body.Items), len(want))
	}
	for _, p := range body.Items {
		size, ok := want[p.ID]
		if !ok {
			t.Fatalf("unexpected preset %q", p.ID)
		}
		if p.Width != size[0] || p.Height != size[1] || p.Mode != ModeFill || p.Label == "" || p.Anchor == "" {
			t.Fatalf("preset %q has unexpected fields: %+v", p.ID, p)
		}
	}
}

func TestInternalRoutesRequireToken(t *testing.T) {
	srv := newTestService(t, "http://unused")
	body := map[string]any{"asset_id": 1, "version": 1, "blob_url": "http://x/blobs/abc"}
	for _, tok := range []string{"", "wrong-token"} {
		resp, out := doJSON(t, http.MethodPost, srv.URL+"/internal/jobs", tok, body)
		if resp.StatusCode != http.StatusUnauthorized || out["error"] == nil {
			t.Fatalf("token %q: got %d %v", tok, resp.StatusCode, out)
		}
		resp, _ = doJSON(t, http.MethodGet, srv.URL+"/internal/jobs/whatever", tok, nil)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("token %q: GET job got %d", tok, resp.StatusCode)
		}
	}
}

func TestCreateJobValidation(t *testing.T) {
	srv := newTestService(t, "http://unused")
	for _, body := range []map[string]any{
		{"version": 1, "blob_url": "http://x"},
		{"asset_id": 1, "blob_url": "http://x"},
		{"asset_id": 1, "version": 1},
	} {
		resp, _ := doJSON(t, http.MethodPost, srv.URL+"/internal/jobs", testToken, body)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("body %v: got %d", body, resp.StatusCode)
		}
	}
	resp, _ := doJSON(t, http.MethodGet, srv.URL+"/internal/jobs/missing", testToken, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("missing job: got %d", resp.StatusCode)
	}
}

type upload struct {
	assetID, version, preset string
	width, height            int
	fileW, fileH             int
	contentType              string
}

func fakeAssets(t *testing.T) (*httptest.Server, *[]upload, *sync.Mutex) {
	t.Helper()
	var mu sync.Mutex
	uploads := []upload{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/internal/renditions" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("X-Internal-Token") != testToken {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		f, hdr, err := r.FormFile("file")
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		defer f.Close()
		cfg, err := jpeg.DecodeConfig(f)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		width, _ := strconv.Atoi(r.FormValue("width"))
		height, _ := strconv.Atoi(r.FormValue("height"))
		mu.Lock()
		uploads = append(uploads, upload{
			assetID: r.FormValue("asset_id"), version: r.FormValue("version"),
			preset: r.FormValue("preset"), width: width, height: height,
			fileW: cfg.Width, fileH: cfg.Height, contentType: hdr.Header.Get("Content-Type"),
		})
		mu.Unlock()
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(srv.Close)
	return srv, &uploads, &mu
}

func fakeBlobs(t *testing.T) *httptest.Server {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, solidImage(1600, 900)); err != nil {
		t.Fatal(err)
	}
	data := buf.Bytes()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/blobs/abc123" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(data)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func waitForJob(t *testing.T, base, id string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		resp, body := doJSON(t, http.MethodGet, base+"/internal/jobs/"+id, testToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("get job: %d", resp.StatusCode)
		}
		if s := body["status"]; s == StatusDone || s == StatusFailed {
			return body
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("job did not finish in time")
	return nil
}

func TestJobFlowEndToEnd(t *testing.T) {
	assets, uploads, mu := fakeAssets(t)
	blobs := fakeBlobs(t)
	srv := newTestService(t, assets.URL)

	resp, body := doJSON(t, http.MethodPost, srv.URL+"/internal/jobs", testToken,
		map[string]any{"asset_id": 7, "version": 2, "blob_url": blobs.URL + "/blobs/abc123"})
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("create job: %d %v", resp.StatusCode, body)
	}
	if body["status"] != StatusQueued || body["job_id"] == "" {
		t.Fatalf("unexpected create response: %v", body)
	}

	job := waitForJob(t, srv.URL, body["job_id"].(string))
	if job["status"] != StatusDone {
		t.Fatalf("job failed: %v", job)
	}
	if job["asset_id"].(float64) != 7 || job["version"].(float64) != 2 || job["error"] != "" {
		t.Fatalf("unexpected job fields: %v", job)
	}
	done := job["presets_done"].([]any)
	if len(done) != len(Presets) {
		t.Fatalf("presets_done = %v", done)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(*uploads) != len(Presets) {
		t.Fatalf("got %d uploads, want %d", len(*uploads), len(Presets))
	}
	for _, u := range *uploads {
		p := presetByID(t, u.preset)
		if u.assetID != "7" || u.version != "2" {
			t.Fatalf("upload has wrong ids: %+v", u)
		}
		if u.width != p.Width || u.height != p.Height || u.fileW != p.Width || u.fileH != p.Height {
			t.Fatalf("upload %s has wrong size: %+v", u.preset, u)
		}
		if u.contentType != "image/jpeg" {
			t.Fatalf("upload %s content type %q", u.preset, u.contentType)
		}
	}
}

func TestJobFailsWhenSourceMissing(t *testing.T) {
	assets, uploads, mu := fakeAssets(t)
	blobs := fakeBlobs(t)
	srv := newTestService(t, assets.URL)

	_, body := doJSON(t, http.MethodPost, srv.URL+"/internal/jobs", testToken,
		map[string]any{"asset_id": 7, "version": 3, "blob_url": blobs.URL + "/blobs/missing"})
	job := waitForJob(t, srv.URL, body["job_id"].(string))
	if job["status"] != StatusFailed || !strings.Contains(job["error"].(string), "404") {
		t.Fatalf("expected failed job with 404 error, got %v", job)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(*uploads) != 0 {
		t.Fatalf("expected no uploads, got %d", len(*uploads))
	}
}

func TestJobResolvesRelativeBlobURL(t *testing.T) {
	// A relative blob_url is resolved against ASSETS_URL, so serve both from one server.
	var blob bytes.Buffer
	_ = png.Encode(&blob, solidImage(400, 400))
	var count int
	var mu sync.Mutex
	assets := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/blobs/rel":
			_, _ = w.Write(blob.Bytes())
		case r.Method == http.MethodPost && r.URL.Path == "/internal/renditions":
			mu.Lock()
			count++
			mu.Unlock()
			w.WriteHeader(http.StatusCreated)
		default:
			http.NotFound(w, r)
		}
	}))
	defer assets.Close()
	srv := newTestService(t, assets.URL)

	_, body := doJSON(t, http.MethodPost, srv.URL+"/internal/jobs", testToken,
		map[string]any{"asset_id": 1, "version": 1, "blob_url": "/blobs/rel"})
	job := waitForJob(t, srv.URL, body["job_id"].(string))
	if job["status"] != StatusDone {
		t.Fatalf("job failed: %v", job)
	}
	mu.Lock()
	defer mu.Unlock()
	if count != len(Presets) {
		t.Fatalf("got %d uploads", count)
	}
}
