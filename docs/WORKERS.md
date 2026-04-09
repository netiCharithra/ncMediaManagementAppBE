# Background Workers - Technical Flows

The backend runs a high-performance **Master Pipeline** and a **Redundant Catch-up System** via `node-cron`. 
The orchestration is managed in `src/workers/cronScheduler.js`.

---

## 1. 📂 RSS Ingestion Worker
-   **File:** `src/workers/rss_ingestion_worker.js` (logic in `src/services/ingestion.service.js`)
-   **Schedule:** Every 10 minutes (Master Pipeline Step 1).
-   **Freshness Filter:** Only processes articles published within the **last 48 hours**. 
-   **Logic:**
    -   Fetches new content from a list of RSS feed sources.
    -   Calculates a `contentHash` to prevent duplicates.
    -   Saves new articles with `processingStatus: 'pending'`.

## 2. 🧠 AI Summarization Worker (Content Engine)
-   **File:** `src/workers/summarization_worker.js`
-   **Schedule:** Every 10 minutes (Master Pipeline Step 2) AND Every 5 minutes (Catch-up).
-   **Atomic Locking:** Uses `findOneAndUpdate` to "lock" records, allowing multiple workers to safely collaborate without processing the same article twice.
-   **Logic:**
    -   Picks `RawNews` records where `processingStatus: 'pending'`.
    -   Calls **Groq AI (Llama 3 / Gemma)** to summarize content into a Headline and News Brief.
    -   Creates a new record in `News` collection with status **`review`**.
    -   **Slow Drip Rule:** 3-second sleep between AI calls to stay within Free-Tier rate limits.

## 3. 🗣️ AI Translation Worker
-   **File:** `src/workers/translation_worker.js`
-   **Schedule:** Every 10 minutes (Master Pipeline Step 3) AND Every 5 minutes (triggered after Catch-up Summarization).
-   **Target Languages:** Telugu (`te`), Hindi (`hi`).
-   **Logic:**
    -   Identifies **`review`** status articles missing translations.
    -   Calls **Groq AI** for high-quality contextual translation.
    -   Creates `NewsTranslation` records linked by `newsId`.

## 📸 4. AI Image Generation Worker (Visuals)
-   **File:** `src/workers/newsWorker.js`
-   **Schedule:** Every 5 minutes (Standalone) AND Every 10 minutes (Master Pipeline Step 4).
-   **Provider:** Hugging Face (**FLUX.1-schnell**) via `hfImageService.js`.
-   **Logic:**
    -   Finds **`review`** or **`published`** articles where `imageUrl` is empty or null.
    -   Deduplicates by `parentNewsId` (one image for all translations).
    -   Generates a realistic photo (no humans, no text).
    -   **Cross-Collection Sync:** Updates **both** the `News` and `NewsTranslation` collections simultaneously.
    -   **Rate Limit Protection:** 35-second pause between each image call.

## 📈 5. Trending Recalculation Worker
-   **File:** Logic in `src/workers/cronScheduler.js`.
-   **Schedule:** Top of every hour.
-   **Logic:**
    -   Finds top 20 news by **`views`** in the last 24 hours.
    -   Resets previous `isTrending` flags and clears Redis cache.

---

## 🚀 Execution Guide
To run all workers manually (for debugging):
```bash
npm run worker:all
```
To run the full pipeline (Summarize -> Translate -> Images):
```bash
npm run worker:process
```
To run just the Image Gen:
```bash
npm run worker:images
```
