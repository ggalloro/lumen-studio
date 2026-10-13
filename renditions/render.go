package main

import (
	"bytes"
	"fmt"
	"image"
	_ "image/png" // register PNG decoder
	"io"

	"github.com/disintegration/imaging"
)

const jpegQuality = 85

// Decode reads a PNG or JPEG image, applying EXIF orientation when present.
func Decode(r io.Reader) (image.Image, error) {
	img, err := imaging.Decode(r, imaging.AutoOrientation(true))
	if err != nil {
		return nil, fmt.Errorf("decode image: %w", err)
	}
	return img, nil
}

// Render produces the output image for a preset.
func Render(src image.Image, p Preset) image.Image {
	switch p.Mode {
	case ModeFit:
		return imaging.Fit(src, p.Width, p.Height, imaging.Lanczos)
	default:
		return imaging.Fill(src, p.Width, p.Height, imagingAnchor(p.Anchor), imaging.Lanczos)
	}
}

// EncodeJPEG encodes an image as JPEG at the service quality setting.
func EncodeJPEG(img image.Image) ([]byte, error) {
	var buf bytes.Buffer
	if err := imaging.Encode(&buf, img, imaging.JPEG, imaging.JPEGQuality(jpegQuality)); err != nil {
		return nil, fmt.Errorf("encode jpeg: %w", err)
	}
	return buf.Bytes(), nil
}
