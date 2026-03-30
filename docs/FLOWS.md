# Detailed System Flows

This document explains the sequential logic of the **Vishwa Vani / Viva Digital News** pipeline.

## 🔄 The News Journey: Sequence Diagram

The master sequential pipeline (`src/workers/cronScheduler.js`) ensures each stage finishes before the next starts.

```mermaid
sequenceDiagram
    participant Web as RSS Sources
    participant RSS as Ingestion Worker
    participant Sum as Summarization Worker
    participant Trans as Translation Worker
    participant DB as MongoDB (RawNews / News)

    Web->>RSS: 1. Fetch XML Feeds
    RSS->>DB: 2. Check for duplicate links
    RSS->>DB: 3. Save new RawNews (pending)
    
    DB->>Sum: 4. Find pending RawNews
    Sum->>Sum: 5. Groq AI Summarization
    Sum->>DB: 6. Create News (review)
    Sum->>DB: 7. Mark RawNews (processed)
    
    DB->>Trans: 8. Find News (review) missing Telugu
    Trans->>Trans: 9. Groq AI Translation (te, hi)
    Trans->>DB: 10. Save NewsTranslations
```

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
