# Background Workers - Technical Flows

The backend runs **five core background processes** via `node-cron`. 
The orchestration is managed in `src/workers/cronScheduler.js`.

---

## 1. 📂 RSS Ingestion Worker
-   **File:** `src/workers/rss_ingestion_worker.js`
-   **Schedule:** Every 10 minutes (Master Pipeline Step 1).
-   **Logic:**
    -   Fetches new content from a list of RSS feed sources.
    -   Checks for duplicates in `RawNews` using the `link` field.
    -   Saves new articles with `processingStatus: 'pending'`.

## 2. 🧠 AI Summarization Worker (Content Engine)
-   **File:** `src/workers/summarization_worker.js`
-   **Schedule:** Every 10 minutes (Master Pipeline Step 2).
-   **Batch Size:** 50 unique stories.
-   **Logic:**
    -   Picks `RawNews` records where `processingStatus: 'pending'`.
    -   Calls **Groq AI (Llama 3 / Gemma)** to summarize the long RSS description into:
        -   Headline
        -   News Brief (16:9 oriented summary)
    -   Creates a new record in `News` collection with status **`review`**.
    -   **Slow Drip Rule:** 3-second sleep between AI calls to stay within Free-Tier rate limits.

## 3. 🗣️ AI Translation Worker
-   **File:** `src/workers/translation_worker.js`
-   **Schedule:** Every 10 minutes (Master Pipeline Step 3).
-   **Target Languages:** Telugu (`te`), Hindi (`hi`).
-   **Logic:**
    -   Identifies **`review`** status articles missing Telugu/Hindi translations.
    -   Calls **Groq AI** for high-quality contextual translation.
    -   Creates `NewsTranslation` records linked by `newsId`.
    -   Inherits the master `imageUrl` and `sourceUrl`.

## 📸 4. AI Image Generation Worker (Visuals)
-   **File:** `src/workers/newsWorker.js`
-   **Schedule:** Every 5 minutes (Standalone).
-   **Provider:** Hugging Face (**FLUX.1-schnell**) via `hfImageService.js`.
-   **Batch Size:** 10 unique stories (latest first).
-   **Logic:**
    -   Finds **`published`** articles where `imageUrl` is empty or null.
    -   Deduplicates by `parentNewsId` (one image for all translations).
    -   Generates a **high-resolution realistic photo** (no humans, no text).
    -   Uploads to **Cloudflare R2** and updates all relevant Article IDs.
    -   **Rate Limit Protection:** 35-second pause between each image call.

## 📈 5. Trending Recalculation Worker
-   **File:** Logic in `src/workers/cronScheduler.js` at Line 43.
-   **Schedule:** Top of every hour.
-   **Logic:**
    -   Finds top 20 news by **`views`** in the last 24 hours.
    -   Resets previous `isTrending` flags.
    -   Sets `isTrending: true` and clears the Redis cache for trending news.

---

## 🚀 Execution Guide
To run all workers manually (for debugging):
```bash
npm run worker:all
```
To run a specific worker (e.g., Image Gen):
```bash
npm run worker:images
```
