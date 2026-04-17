# GCP Image Metrics Filters

Use these filters when creating **Logs-based Metrics** in Google Cloud Logging.

## Base Scope

Add this base to all filters:

```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.component="ImageService"
```

---

## Provider Triggered Metrics

### `image_requests_gemini_total`
Purpose: Total number of Gemini image generation attempts started.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.event="REQUESTED"
jsonPayload.metadata.provider="Gemini"
```

### `image_requests_huggingface_total`
Purpose: Total number of HuggingFace image generation attempts started.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.event="REQUESTED"
jsonPayload.metadata.provider="HuggingFace"
```

### `image_requests_pollinations_total`
Purpose: Total number of Pollinations image generation attempts started.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.event="REQUESTED"
jsonPayload.metadata.provider="Pollinations"
```

---

## Provider Success Metrics

### `image_success_gemini_total`
Purpose: Number of times Gemini successfully generated and uploaded the image.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.event="SUCCESS"
jsonPayload.metadata.provider="Gemini"
```

### `image_success_huggingface_total`
Purpose: Number of times HuggingFace successfully generated and uploaded the image.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.event="SUCCESS"
jsonPayload.metadata.provider="HuggingFace"
```

### `image_success_pollinations_total`
Purpose: Number of times Pollinations successfully generated and uploaded the image.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.event="SUCCESS"
jsonPayload.metadata.provider="Pollinations"
```

---

## Provider Warning Metrics

### `image_warning_gemini_total`
Purpose: Gemini warning count (quota/rate-limit/provider failures).
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.event="WARNING"
jsonPayload.metadata.provider="Gemini"
```

### `image_warning_huggingface_total`
Purpose: HuggingFace warning count (busy/rate-limit/provider failures).
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.event="WARNING"
jsonPayload.metadata.provider="HuggingFace"
```

### `image_warning_pollinations_total`
Purpose: Pollinations warning count (timeouts/provider failures).
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.event="WARNING"
jsonPayload.metadata.provider="Pollinations"
```

---

## Detailed Report Metrics (`image.generate.report`)

These come from structured report logs emitted per image generation cycle.

### `image_report_success_total`
Purpose: Total stories completed successfully (final output produced).
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.event="image.generate.report"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.result="success"
```

### `image_report_failed_total`
Purpose: Total stories where all providers failed (no image output).
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.event="image.generate.report"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.result="failed"
```

### `image_report_upload_failed_total`
Purpose: Total stories where image generation succeeded but upload failed.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.event="image.generate.report"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.result="upload_failed"
```

### `image_report_fallback_used_total`
Purpose: Successful stories that required fallback to a different provider.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.event="image.generate.report"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.result="success"
jsonPayload.metadata.fallback_used=true
```

### `image_report_cache_hit_total`
Purpose: Total stories served from cache without new generation.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.event="image.generate.report"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.result="cache_hit"
```

---

## Final Provider Selection Metrics

### `image_selected_gemini_total`
Purpose: Number of successful stories where Gemini was the final selected provider.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.event="image.generate.report"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.result="success"
jsonPayload.metadata.selected_provider="Gemini"
```

### `image_selected_huggingface_total`
Purpose: Number of successful stories where HuggingFace was the final selected provider.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.event="image.generate.report"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.result="success"
jsonPayload.metadata.selected_provider="HuggingFace"
```

### `image_selected_pollinations_total`
Purpose: Number of successful stories where Pollinations was the final selected provider.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.event="image.generate.report"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.result="success"
jsonPayload.metadata.selected_provider="Pollinations"
```

---

## Error / Quota Diagnostics

### `image_gemini_quota_exhausted_total`
Purpose: Count of Gemini attempts blocked by daily quota exhaustion.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.component="ImageService"
jsonPayload.metadata.provider="Gemini"
jsonPayload.metadata.event="WARNING"
jsonPayload.metadata.message_detail:"Daily quota exhausted"
```

### `image_all_providers_failed_total`
Purpose: Count of complete generation failures after trying all providers.
```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.component="ImageService"
jsonPayload.message:"All providers failed"
```

---

## Latency Metric (Distribution)

Create a **Distribution metric**:

- Name: `image_generation_duration_ms`
- Purpose: End-to-end image generation duration per story (for P50/P95/P99 latency charts).
- Filter:

```text
jsonPayload.metadata.service="viva-digital-news-backend"
jsonPayload.metadata.event="image.generate.report"
jsonPayload.metadata.component="ImageService"
```

- Value extractor:

```text
EXTRACT(jsonPayload.metadata.total_duration_ms)
```
