# 🖼️ AI Image Generation Worker — Hugging Face FLUX.1

This doc explains the image worker, a scheduled job that automatically generates professional news photography using **FLUX.1-schnell** on Hugging Face Inference.

---

## 🏗️ Architecture

```
Every 5 Minutes (Safety) / Pipeline Trigger (10min)
      │
      ▼
┌──────────────────────────────────────────────┐
│  Query News where:                           │
│    status IN ('published', 'review')         │
│    imageUrl = null / ''                      │
│  Sort: publishedAt DESC                      │
│  Limit: 10 Unique Stories                    │
└───────────────┬──────────────────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
   Call Hugging Face  Update ALL Collections:
   (Inference API)    1. News (Originals)
        │             2. News (Promoted)
        ▼             3. NewsTranslation
   Upload PNG → Cloudflare R2
```

---

## 🛡️ Deduplication Strategy

The worker uses **MongoDB Aggregation** to identify unique news stories before calling the AI.
*   It groups by `storyKey` (which is `parentNewsId` for translations, or `_id` for originals).
*   It only makes **one AI API call** per news story, regardless of how many languages exist.
*   Once generated, it uses `updateMany` to sync the same URL across all linked records in **both** the `News` and `NewsTranslation` collections.

---

## ⚙️ Environment Variables

| Variable | Requirement | Description |
|---|---|---|
| `HF_TOKEN` | **Required** | Your Hugging Face API Token. |
| `R2_ACCESS_KEY_ID` | **Required** | Cloudflare R2 storage credentials. |
| `R2_PUBLIC_URL` | **Required** | Base URL for serving the images. |
| `IMAGE_WORKER_DELAY_MS` | Optional | Default **35000 (35s)**. Pause between images to avoid rate limits. |

---

## 🚀 Execution

Run a manual catch-up pass:
```bash
npm run worker:images
```

---

## 🎨 Creative Constraints (Prompt Engineering)

The service prompt (`hfImageService.js`) enforces:
1.  **Realistic Photo-style:** Professional editorial news look.
2.  **No Humans/Faces:** Strictly avoids faces, people, and human figures.
3.  **No Text/Signs:** Strictly filters for zero text, captions, or watermarks.
4.  **Symbolic Nature:** Focuses on objects, architecture, or environment related to the headline.
5.  **Sensitive News:** Tragic or criminal news results in abstract imagery (e.g., siren light on wet road).
xxx.r2.dev/ai-images/1234-news-5678.png
[NewsWorker] ✅ Updated "CM launches new scheme..." → https://...
[GeminiService] ♻️  Cache hit for parentNewsId=abc123 → reusing https://...
[NewsWorker] ♻️  Reused parent image for translation 6789abc
[NewsWorker] 📊 Pass complete | Generated: 8 | Reused: 4 | Failed: 0 | Skipped: 0
```
