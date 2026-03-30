# 📦 Data Models & Schema Design

The **Vishwa Vani / Viva Digital News** backend uses a specialized, multilingual-friendly schema set in **MongoDB**.

---

## 🏛️ Schematic Relationship Diagram

The hierarchy follows the lifecycle of a news story from ingestion to internationalization.

```mermaid
erDiagram
    RAW_NEWS ||--o| NEWS : processes-into
    NEWS ||--o{ NEWS_TRANSLATION : has-translations
    NEWS ||--|| CATEGORY : categorized-as
    ADMIN ||--o{ NEWS : creates-or-approves
    CONTRIBUTOR ||--o{ NEWS : submits

    RAW_NEWS {
        string _id PK
        string title
        string link
        string processingStatus "pending | processed | failed"
        string source "RSS | Manual"
    }
    NEWS {
        string _id PK
        string title "The Master English Title"
        string summary "AI-Generated brief"
        string content "Summarized primary body"
        string imageUrl "Hosted on Cloudflare R2"
        string status "review | published"
        string parentNewsId "Identifier for Translation grouping"
    }
    NEWS_TRANSLATION {
        string _id PK
        ObjectId newsId FK
        string language "te (Telugu) | hi (Hindi)"
        string title "Translated headline"
        string summary "Translated brief"
    }
```

---

## 🔍 Model Breakdown

### 1. 📂 `RawNews` (Ingestion Store)
This is the **Staging Area**. Content enters here from RSS feeds.
-   **Key Index:** `link` (Unique) — Prevents duplicate ingestion.
-   **Fields:**
    -   `description`: The full XML block from the RSS.
    -   `pubDate`: Original publication date from source.

### 2. 🗞️ `News` (Master Articles)
The centerpiece. Every story starts as a `News` document (English/Original).
-   **Indexes:**
    -   Compound: `(status, publishedAt)` — For high-speed feed filtering.
    -   Text: `(title, summary, content)` — For full-text search.
-   **Fields:**
    -   `isTrending`: Boolean, recalculated hourly.
    -   `views`: Integer, incremented on every hit (cached-write strategy).

### 3. 🗣️ `NewsTranslation` (Localized Content)
All non-English content lives here, linked to the Master.
-   **Key Index:** `(newsId, language)` (Unique) — Ensures only one Telugu translation per Master story.

### 4. 🏘️ `User` (Mobile Subscribers)
-   **Key Index:** `2dsphere` on `location.coordinates`.
-   **Rationale:** Allows the API to serve **Hyperlocal News** based on a user's geolocation or chosen district/mandal.

---

## 📊 Optimization Features

-   **Geospatial Queries**: Used for localized news feeds (Distance-based filtering).
-   **Population**: Large queries use Mongoose `.populate()` for efficiency when linking Categories to News articles.
-   **Caching Layer**: All `News` data is cached in Redis with a TTL (Time To Live).
