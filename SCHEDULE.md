# 📅 Viva Digital News: Automated Job Schedule

This document serves as the **Single Source of Truth** for all automated background tasks running on the backend.

---

## 🚀 The Schedule Dashboard

| Priority | Job Name | Frequency | Pattern | Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **P0** | **Master Pipeline** | Every 10 Min | `*/10 * * * *` | RSS Ingest → Summarize → Translate → Images |
| **P1** | **Catch-up Worker** | Every 10 Min | `5,15,25...` | (Offset by 5m) Processes stragglers missed by Master |
| **P1** | **Image Safety Net** | Every 10 Min | `*/10 * * * *` | Scans for Review/Published articles without images |
| **P2** | **Zombie Recovery** | Every 30 Min | `*/30 * * * *` | Rescues articles stuck in 'processing' status |
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

### **3. Mutex Locking (Job Safety)**
To prevent "Process Pile-up" (where workers stack up and crash the server), all workers now use **In-Memory Mutex Flags**:
- **Busy Check:** If a worker is triggered but the previous run is still active, it skips the current cycle.
- **Auto-Release:** Uses `try...finally` blocks to ensure the "Busy" sign is always removed, even if an error occurs.
- **Self-Healing:** If the server restarts, all flags are automatically reset to `false`.

### **4. Atomic Database Locking (Article Safety)**
Even if two jobs try to grab the same news article, they use **Atomic Updates** (`findOneAndUpdate`). One worker "claims" an article by setting it to `processing`, and the other worker automatically skips it.

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
