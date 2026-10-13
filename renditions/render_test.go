package main

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

func solidImage(w, h int) image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.NRGBA{R: 200, G: 16, B: 46, A: 255})
		}
	}
	return img
}

func presetByID(t *testing.T, id string) Preset {
	t.Helper()
	for _, p := range Presets {
		if p.ID == id {
			return p
		}
	}
	t.Fatalf("preset %q not found", id)
	return Preset{}
}

func TestRenderFillProducesExactPresetSize(t *testing.T) {
	cases := []struct {
		name   string
		preset string
		srcW   int
		srcH   int
	}{
		{"landscape to square", "instagram_square", 2048, 1365},
		{"portrait to square", "thumbnail", 900, 1600},
		{"square to banner", "web_banner", 1000, 1000},
		{"landscape to wide header", "email_header", 2048, 1365},
		{"small source upscales", "web_banner", 300, 200},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := presetByID(t, tc.preset)
			if p.Anchor != "center" {
				t.Fatalf("expected a center-anchored preset, got %q", p.Anchor)
			}
			out := Render(solidImage(tc.srcW, tc.srcH), p)
			b := out.Bounds()
			if b.Dx() != p.Width || b.Dy() != p.Height {
				t.Fatalf("got %dx%d, want %dx%d", b.Dx(), b.Dy(), p.Width, p.Height)
			}
		})
	}
}

func TestRenderFitKeepsAspectRatioInsideBox(t *testing.T) {
	box := Preset{ID: "fit_test", Width: 600, Height: 600, Mode: ModeFit, Anchor: "center"}
	cases := []struct {
		name         string
		srcW, srcH   int
		wantW, wantH int
	}{
		{"landscape", 2000, 1000, 600, 300},
		{"portrait", 1000, 2000, 300, 600},
		{"square", 1200, 1200, 600, 600},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			b := Render(solidImage(tc.srcW, tc.srcH), box).Bounds()
			if b.Dx() != tc.wantW || b.Dy() != tc.wantH {
				t.Fatalf("got %dx%d, want %dx%d", b.Dx(), b.Dy(), tc.wantW, tc.wantH)
			}
		})
	}
}

func TestEncodeJPEGIsDecodable(t *testing.T) {
	data, err := EncodeJPEG(solidImage(64, 32))
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("output is not a JPEG: %v", err)
	}
	if cfg.Width != 64 || cfg.Height != 32 {
		t.Fatalf("got %dx%d", cfg.Width, cfg.Height)
	}
}
