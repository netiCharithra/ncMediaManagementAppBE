# Detailed System Flows

This document explains the sequential logic of the **Vishwa Vani / Viva Digital News** pipeline.

## 🔄 The News Journey: Master Sequential Pipeline

The master sequential pipeline (`src/workers/cronScheduler.js`) runs every 10 minutes and ensures each stage finishes before the next starts. 

```mermaid
sequenceDiagram
    participant Web as RSS Sources
    participant RSS as Ingestion Worker
    participant Sum as Summarization Worker
    participant Trans as Translation Worker
    participant Img as Image Worker
    participant DB as MongoDB (RawNews / News)

    Web->>RSS: 1. Fetch XML Feeds (Last 48h only)
    RSS->>DB: 2. Save new RawNews (pending)
    
    DB->>Sum: 3. Find pending RawNews
    Sum->>DB: 4. Create News (review)
    
    DB->>Trans: 5. Find News (review) missing Telugu/Hindi
    Trans->>DB: 6. Save NewsTranslations
    
    DB->>Img: 7. Find Review/Published Articles (no image)
    Img->>DB: 8. Sync imageUrl to News & NewsTranslation
```

---

## 🛡️ Catch-up System (Redundancy Flow)

To ensure no article is left behind (especially when RSS produces large batches), a secondary **Catch-up Worker** runs every 5 minutes.

1.  **Summarize & Translate:** Scans for any articles that were missed by the 10-minute batch limit.
2.  **Safety Image Worker:** Continuously scans for any article (old or new) missing an image.
3.  **Atomic Locking:** All workers use atomic updates to ensure they don't process the same article if they trigger at the same time as the Master Pipeline.

---

## 📸 AI Visuals Flow (Isolated Pass)

The Image Worker runs independently every 5 minutes and works only on **`published`** / **approved** content.

```mermaid
sequenceDiagram
    participant DB as MongoDB
    participant Image_W as Image Worker
    participant HF as Hugging Face (Flux)
    participant R2 as Cloudflare Storage

    DB->>Image_W: 1. Find Published Articles (no imageUrl)
    Image_W->>Image_W: 2. Group by parentNewsId (Deduplicate)
    Image_W->>HF: 3. Generate 16:9 Realistic Photo (prompt)
    HF-->>Image_W: 4. Returns Image Binary (Blob)
    Image_W->>R2: 5. Upload Binary to /ai-images/
    R2-->>Image_W: 6. Returns Public R2 URL
    Image_W->>DB: 7. Update imageUrl for all siblings ($updateMany)
```

---

## ⚡ Caching Flow (Redis Strategy)

The Express API uses a middleware-based caching strategy.

1.  **Request Recieved**: `GET /api/news`
2.  **Check Cache**: Look in Redis for the specific language/category key.
3.  **Cache Hit**: Return JSON immediately (TTL: 1 hour).
4.  **Cache Miss**:
    -   Query MongoDB for the news.
    -   Store result in Redis with `news:list:*` key.
    -   Return JSON.
5.  **Invalidation**: When a news article is updated or a new one is published, all `news:*` keys are cleared automatically.

---

## ⚙️ Environment Variables Breakdown

For a full list of required tokens, refer to **`.env.example`**.
Key services used:
-   **MONGO_URI**: Database connection.
-   **GROQ_API_KEY**: AI Text.
-   **HUGGING_FACE_API_KEY**: AI Images.
-   **R2_ACCESS_KEY_ID / SECRET**: Storage.
