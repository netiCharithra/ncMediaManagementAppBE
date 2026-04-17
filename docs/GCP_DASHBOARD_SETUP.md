# GCP Dashboard Setup Checklist

This document contains the step-by-step SRE tasks required to build out the AI Image Pipeline Observability Dashboard in Google Cloud Platform (GCP).

## Phase 1: Define Logs-based Metrics
*Before building the dashboard, you must create these metrics in GCP Logs Explorer.*

- [ ] **Triggered Metrics (Counter)**
  - [ ] `image_requests_gemini_total`
  - [ ] `image_requests_huggingface_total`
  - [ ] `image_requests_pollinations_total`
- [ ] **Success Metrics (Counter)**
  - [ ] `image_success_gemini_total`
  - [ ] `image_success_huggingface_total`
  - [ ] `image_success_pollinations_total`
- [ ] **Warning Metrics (Counter)**
  - [ ] `image_warning_gemini_total`
  - [ ] `image_warning_huggingface_total`
  - [ ] `image_warning_pollinations_total`
- [ ] **Report Metrics (Counter)**
  - [ ] `image_report_success_total`
  - [ ] `image_report_failed_total`
  - [ ] `image_report_upload_failed_total`
  - [ ] `image_report_fallback_used_total`
  - [ ] `image_report_cache_hit_total`
- [ ] **Final Selection Metrics (Counter)**
  - [ ] `image_selected_gemini_total`
  - [ ] `image_selected_huggingface_total`
  - [ ] `image_selected_pollinations_total`
- [ ] **Diagnostics (Counter)**
  - [ ] `image_gemini_quota_exhausted_total`
  - [ ] `image_all_providers_failed_total`
- [ ] **Latency (Distribution)**
  - [ ] `image_generation_duration_ms` (Extract `jsonPayload.metadata.total_duration_ms`)

---

## Phase 2: Build the GCP Dashboard
*Navigate to Monitoring > Dashboards > Create Dashboard. Add the following widgets to create a comprehensive end-to-end view of your system.*

### Row 1: Executive Summary (The "Morning Coffee" View)
*These top-row widgets tell you instantly if the system is running beautifully or if there are critical failures.*

- [ ] **Widget: Scorecard / Gauge**
  - **Title:** Overall Success Output
  - **Metric:** `image_report_success_total`
  - **Description:** Tracks total success. If this isn't close to 100%, stories are literally publishing without images.
- [ ] **Widget: Pie Chart**
  - **Title:** Cache Hits vs New Generations
  - **Metric:** `image_report_cache_hit_total`
  - **Description:** Tells you exactly how much money and inference time you are saving by not regenerating identical titles.
- [ ] **Widget: Scorecard (Threshold > 0 = RED)**
  - **Title:** Complete System Failures
  - **Metric:** `image_all_providers_failed_total`
  - **Description:** If this reads `0`, the system is healthy. If it's `> 0`, your entire fallback chain (Gemini → HF → Pollinations) completely collapsed.

### Row 2: Provider-Wise Performance (The "Race" View)
*This is where you monitor horizontal performance to see who is fast, who is failing, and who is pulling the most weight.*

- [ ] **Widget: Stacked Area Chart (or Pie)**
  - **Title:** Final Provider Distribution (Who Won?)
  - **Metrics:** `image_selected_gemini_total`, `image_selected_huggingface_total`, `image_selected_pollinations_total`
  - **Description:** Visually proves which provider successfully generated the final image. If Pollinations suddenly takes 80% volume, you know primary APIs are heavily degraded.
- [ ] **Widget: Grouped Bar Chart (Side-by-side)**
  - **Title:** Request vs Success Drop-off (The Generation Funnel)
  - **Metrics:** `image_requests_*_total` overlaid with `image_success_*_total` (all 6 metrics)
  - **Description:** Shows conversion. Example: Gemini 1,000 requests -> 200 successes (shows 800 blocked by quota). Shows reliability per model.
- [ ] **Widget: Line Chart**
  - **Title:** Provider API Warnings & Errors
  - **Metrics:** `image_warning_*_total` (all 3 providers)
  - **Description:** If the blue line (HuggingFace) spikes at 2 PM, you can pinpoint exactly when their API started shedding your load.

### Row 3: Latency & User Experience (The "Speed" View)
*Providers might succeed, but if they take 45 seconds per image, your worker queues will back up endlessly.*

- [ ] **Widget: Line Chart**
  - **Title:** System-Wide Generation Latency (P50/P95/P99)
  - **Metric:** `image_generation_duration_ms` (Percentile Aggregation)
  - **Description:** P50 shows average speed. P99 shows how horribly slow the worst-case fallback scenarios are.
- [ ] **Widget: Heatmap**
  - **Title:** Latency Heatmap
  - **Metric:** `image_generation_duration_ms`
  - **Description:** Displays density. You will visually see bright clusters for normal generation vs delayed fallbacks.

### Row 4: FinOps, Quota & Storage (The "Wallet" View)
*This tracks external constraints that limit your pipeline capabilities vs costs.*

- [ ] **Widget: Bar Chart**
  - **Title:** Gemini Daily Quota Ceiling
  - **Metric:** `image_gemini_quota_exhausted_total`
  - **Description:** Tracks exactly when in the day you run out of credits so you can measure if your free tier is sufficient for daily news volume.
- [ ] **Widget: Scorecard**
  - **Title:** AI Fallbacks Engaged
  - **Metric:** `image_report_fallback_used_total`
  - **Description:** Tracks how many images "cost" you extra processing time by falling through to 2nd or 3rd tier providers.
- [ ] **Widget: Line Chart**
  - **Title:** R2 Object Storage Failures
  - **Metric:** `image_report_upload_failed_total`
  - **Description:** If the AI succeeds but Cloudflare goes down, this chart prevents you from blaming the AI models for an S3 storage issue.
