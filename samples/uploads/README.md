# Sample uploads

Images for trying uploads by hand on a seeded stack. They are not loaded by `seed.py`. They were
generated with a Gemini image model from [catalog.json](catalog.json):

```bash
python tools/generate_seed_images.py --catalog samples/uploads/catalog.json --out samples/uploads
```

The suggested title, tags and alt text for each file are in `catalog.json`. The brand check
results below are with the seeded Northwind Outdoor brand kit.

## New assets (Library, Upload)

| File | Brand check | Use it to see |
|---|---|---|
| `summit-rain-shell.jpg` | pass | A clean on-brand upload and its renditions. |
| `canyon-panorama.jpg` | pass | How a very wide image (21:9) is cropped for square, Story and thumbnail renditions. |
| `climber-portrait.jpg` | pass | How a tall image (9:16) is cropped for the web banner and email header. |
| `family-snow-trail.jpg` | pass | Usage rights with people in the photo: set a model release as required and not on file, and every channel is blocked. |
| `neon-festival-tee.jpg` | palette fail, copy style warn | An off-brand image. Use the suggested description ("BRIGHT and LOUD!!!") to trigger the copy style warning. |
| `pastel-picnic.jpg` | pass | Pastel colours that still fall within the palette tolerance. Lower the tolerance in the brand kit and run the check again to make it fail. |
| `compass-mark-on-photo.jpg` | palette fail | The compass mark placed on a busy photo, against the logo rules in the brand kit. |

## New versions of seeded assets (asset page, Versions, Upload new version)

| File | Upload as a new version of | Use it to see |
|---|---|---|
| `ridge-jacket-hero-v3.jpg` | Ridge Jacket hero | Version 3 with the face lit, as asked in the review comments. Upload it after a reviewer requests changes, then submit it for review (README, Flow step 6). Brand check warns on palette. |
| `basecamp-tent-dawn.jpg` | Basecamp tent at dusk | A new version of an approved asset: renditions and brand check run again for version 2. |
| `beacon-headlamp-closeup.jpg` | Beacon headlamp | A closer product shot, then add usage rights so the headlamp stops blocking the Night Trails teaser. |
