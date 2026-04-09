# 📅 Viva Digital News: Automated Job Schedule

This document serves as the **Single Source of Truth** for all automated background tasks running on the backend.

---

## 🚀 The Schedule Dashboard

| Priority | Job Name | Frequency | Pattern | Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **P0** | **Master Pipeline** | Every 10 Min | `*/10 * * * *` | RSS Ingest → Summarize → Translate → Images |
| **P1** | **Catch-up Worker** | Every 5 Min | `*/5 * * * *` | Summarize & Translate any straggler pending news |
| **P1** | **Image Safety Net** | Every 5 Min | `*/5 * * * *` | Scans for any Review/Published articles without images |
| **P2** | **Trending Refresh** | Hourly | `0 * * * *` | Ranks top 20 news by views in last 24h |
| **P3** | **Daily Summary** | Once Daily | `59 23 * * *` | Logs a complete audit of the day's performance |

---

## ⚙️ Dynamic Operational Logic

### **1. Master Pipeline (Sequential)**
To prevent race conditions, the 10-minute master pipeline runs **sequentially**. 
*   **RSS Filter:** It only pulls articles from the **last 48 hours**.
*   **Sequential Chain:** Step 2 starts only after Step 1 finishes, and so on.

### **2. Catch-up Workers (Parallel)**
The 5-minute workers act as "straggler collectors." If a large batch of news comes in (e.g., 200 articles) and the 10-minute pipeline only processes the first 50, these workers pick up the next batch 5 minutes later.

### **3. Atomic Locking (Safety)**
Even if the 10-minute and 5-minute jobs trigger at the exact same second (e.g., at 12:10:00), they use **Atomic Database Locking** (`findOneAndUpdate`). 
- One worker "claims" an article.
- The other worker sees it is `processing` and automatically skips it.

---

## 🛠️ Manual Override Commands

If you need to trigger a job immediately without waiting for the clock:

```bash
# Process ALL pending stages immediately (Summarize -> Translate -> Image)
npm run worker:process

# Fetch RSS feeds and process everything
npm run worker:all

# Just generate images for existing research
npm run worker:images
```
