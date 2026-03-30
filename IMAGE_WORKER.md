# 🖼️ AI Image Generation Worker — neticharithra.com

This document explains the setup, environment variables, and operational details for the
**newsWorker** — a scheduled cron job that automatically generates editorial images for
published news articles that are missing one.

---

## File Structure

```
src/
├── services/
│   └── geminiService.js      ← Gemini API wrapper + R2 upload logic
└── workers/
    ├── newsWorker.js          ← Cron logic (every 5 min) + standalone runner
    └── cronScheduler.js       ← Updated: schedules newsWorker alongside other jobs
```

---

## How It Works

```
Every 5 minutes
      │
      ▼
┌─────────────────────────────────────────┐
│  Query News where:                      │
│    status = 'published'                 │
│    imageUrl = null / ''                 │
│  Sort: publishedAt DESC (latest first)  │
│  Limit: IMAGE_WORKER_BATCH_SIZE (20)    │
└───────────────┬─────────────────────────┘
                │
        ┌───────┴───────┐
        │               │
   Originals       Translations
(no parentNewsId)  (has parentNewsId)
        │               │
        ▼               ▼
  Call Gemini       Reuse parent's
  Flash Image       imageUrl (DB or
  Generation API    in-process cache)
        │
        ▼
  Upload PNG → Cloudflare R2
        │
        ▼
  updateMany: set imageUrl on
  original + ALL translations
  sharing same parentNewsId
```

### Deduplication Logic

| Scenario | Behaviour |
|---|---|
| Translation with a parent that already HAS an `imageUrl` in the DB | Skip API call — copy the parent's URL directly |
| Multiple translations of the same parent in the same batch | Generate once, cache in-process, reuse |
| Article with `parentNewsId = null` (original) | Always generates a new image |

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Your Google AI Studio API key (see below for how to get it) |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret key |
| `R2_ENDPOINT` | e.g. `https://<account_id>.r2.cloudflarestorage.com` |
| `R2_BUCKET_NAME` | Name of your R2 bucket |
| `R2_PUBLIC_URL` | Public base URL, e.g. `https://pub-<hash>.r2.dev` |

### Optional Tuning

| Variable | Default | Description |
|---|---|---|
| `IMAGE_WORKER_BATCH_SIZE` | `20` | Max articles processed per 5-min tick |
| `IMAGE_WORKER_DELAY_MS` | `4000` | Milliseconds to wait between Gemini API calls (rate-limit buffer) |

---

## Getting Your Gemini API Key (Jio / Google AI Pro Offer)

1. Open **[Google AI Studio](https://aistudio.google.com/app/apikey)** in your browser.
2. Sign in with the Google account linked to your **Jio Google AI Pro** offer.
3. Click **"Create API Key"** → choose an existing Google Cloud project (or create one).
4. Copy the key and add it to your `.env`:

```bash
GEMINI_API_KEY=AIzaSy...
```

> **Note:** The worker uses the `gemini-3.1-flash-image-preview` model (confirmed via `ListModels`).
> Alternatives available on your key: `gemini-2.5-flash-image`, `gemini-3-pro-image-preview`.
> All three support `generateContent` with `Modality.IMAGE` output.

---

## Running Locally

### One-shot (process all missing images now and exit)

```bash
npm run worker:images
# or directly:
node src/workers/newsWorker.js
```

### As part of the full server (cron runs automatically every 5 min)

```bash
npm run dev          # Includes cron scheduler
# or
npm start
```

> The `dev:api-only` script sets `DISABLE_CRON=true`, so the image worker will **not**
> run there. Use `npm run dev` or `npm run worker:images` for image generation.

---

## Safety & Content Policy

The Gemini system prompt enforces:

- **No realistic human faces** — avoids uncanny valley / misinformation risk
- **No text/watermarks** in the generated image
- **No blood, weapons, gore, or hateful symbols**
- **Sensitive news** (accidents, crime, tragedy) → abstract/symbolic imagery only
  (broken chain, glowing siren, rainy street, etc.)

These rules live in `geminiService.js → IMAGE_SYSTEM_PROMPT` and can be adjusted there.

---

## Error Handling

| Error | Behaviour |
|---|---|
| `400` — Safety filter triggered | `WARN` log; article skipped; retried next tick |
| `429` — Rate limit | `WARN` log; article skipped; retried next tick |
| Any other Gemini error | `ERROR` log; article skipped |
| R2 upload failure | `ERROR` log; falls back to placeholder URL (configurable in `r2.js`) |
| Gemini returns no image part | `WARN` log; article skipped |

---

## Logs to Watch

```
[NewsWorker] 🖼️  Starting image generation pass...
[NewsWorker] Found 12 article(s) without images.
[GeminiService] 🎨 Generating image for: "CM launches new scheme..."
[GeminiService] ✅ Image uploaded → https://pub-xxx.r2.dev/ai-images/1234-news-5678.png
[NewsWorker] ✅ Updated "CM launches new scheme..." → https://...
[GeminiService] ♻️  Cache hit for parentNewsId=abc123 → reusing https://...
[NewsWorker] ♻️  Reused parent image for translation 6789abc
[NewsWorker] 📊 Pass complete | Generated: 8 | Reused: 4 | Failed: 0 | Skipped: 0
```
