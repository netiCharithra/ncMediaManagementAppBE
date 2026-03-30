# 📡 API Reference Guide

This document provides a categorized overview of the **Viva Digital News** REST API.

---

## 🔐 Authentication Endpoints

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Returns `accessToken` and `refreshToken`. |
| `POST` | `/api/auth/register` | Public | Register a new mobile user. |
| `POST` | `/api/auth/refresh` | Public | Rotate access tokens using a valid refresh token. |

---

## 🗞️ News Discovery (Mobile App)

All news endpoints support the following headers:
- `Accept-Language`: `te` (Telugu), `hi` (Hindi), `en` (English).

### 1. The Super-Feed
`GET /api/news/feed`
- **Purpose**: Personalized, hyperlocal news.
- **Query Params**:
    - `district`: Filter by district name.
    - `state`: Filter by state.
    - `language`: Target language (defaults to `en`).

### 2. Trending Now
`GET /api/news/trending`
- **Purpose**: Returns top 20 news articles based on 24h engagement.
- **Cache**: Fast-cache (Redis) enabled.

### 3. Search
`GET /api/news/search?q=keyword`
- **Purpose**: Full-text search across all language translations.

---

## 🛠️ Admin Dashboard Endpoints
*Requires `Authorization: Bearer <Admin_JWT>`*

### 📊 Statistics
`GET /admin/dashboard/stats`
- Returns daily ingestion counts, active users, and content health.

### 📝 Editorial Management
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/news` | List all articles across all statuses. |
| `PUT` | `/admin/news/:id/publish` | Approve an AI-generated draft to the public feed. |
| `PUT` | `/admin/news/bulk-publish` | Approve multiple drafts at once. |
| `PATCH` | `/admin/editors/:id/permissions` | Update fine-grained ACLs for editorial staff. |

---

## 🔔 Notifications (FCM)
`POST /admin/notification`
- **Targeting**: `all`, `district`, `state`, or `national`.
- **Payload**:
```json
{
  "title": "Breaking News",
  "body": "Major update from Guntur district...",
  "targetAudience": "district",
  "targetValue": "Guntur"
}
```

---

## ⚡ Caching & Performance
- **Headers**: Most `GET` requests return `X-Cache: HIT` if served from Redis.
- **Cache Purge**: Caches are flushed automatically when content is published or deleted.
