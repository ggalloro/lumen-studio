package main

import "github.com/disintegration/imaging"

// Mode controls how a source image is mapped onto the preset box.
type Mode string

const (
	// ModeFill scales the image to cover the box, then crops at the anchor.
	ModeFill Mode = "fill"
	// ModeFit scales the image to fit inside the box, preserving aspect ratio.
	ModeFit Mode = "fit"
)

// Preset describes one channel output.
type Preset struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Mode   Mode   `json:"mode"`
	Anchor string `json:"anchor"`
}

// Presets is the single source of truth for channel outputs. Campaign
// deliverables reference these ids as their channel.
var Presets = []Preset{
	{ID: "instagram_square", Label: "Instagram square", Width: 1080, Height: 1080, Mode: ModeFill, Anchor: "center"},
	{ID: "story", Label: "Story 9:16", Width: 1080, Height: 1920, Mode: ModeFill, Anchor: "top"},
	{ID: "web_banner", Label: "Web banner", Width: 1200, Height: 628, Mode: ModeFill, Anchor: "center"},
	{ID: "email_header", Label: "Email header", Width: 600, Height: 200, Mode: ModeFill, Anchor: "center"},
	{ID: "thumbnail", Label: "Thumbnail", Width: 320, Height: 320, Mode: ModeFill, Anchor: "center"},
}

var anchors = map[string]imaging.Anchor{
	"center":       imaging.Center,
	"top":          imaging.Top,
	"bottom":       imaging.Bottom,
	"left":         imaging.Left,
	"right":        imaging.Right,
	"top_left":     imaging.TopLeft,
	"top_right":    imaging.TopRight,
	"bottom_left":  imaging.BottomLeft,
	"bottom_right": imaging.BottomRight,
}

// imagingAnchor maps a preset anchor name to the imaging package constant.
// Unknown names fall back to center.
func imagingAnchor(name string) imaging.Anchor {
	if a, ok := anchors[name]; ok {
		return a
	}
	return imaging.Center
}
