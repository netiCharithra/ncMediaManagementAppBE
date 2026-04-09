# Vishwa Vani Digital News — Backend API

> **Viva Digital News** | Hyperlocal News Distribution Platform for Andhra Pradesh

A production-ready, scalable backend built with **Node.js · Express.js · MongoDB · Redis · Firebase Cloud Messaging**.

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js          # MongoDB connection
│   │   ├── redis.js             # Redis connection & singleton
│   │   ├── firebase.js          # Firebase Admin SDK
│   │   └── seeder.js            # DB seed script
│   ├── models/
│   │   ├── User.js              # App users with geospatial index
│   │   ├── Admin.js             # Admin with permissions
│   │   ├── Contributor.js       # Contributor with approval flow
│   │   ├── RawNews.js           # Ingestion staging area
│   │   ├── News.js              # Published news (hyperlocal indexed)
│   │   ├── NewsTranslation.js   # Multilingual content
│   │   ├── Category.js          # News categories
│   │   └── Notification.js      # FCM push notification records
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── news.controller.js
│   │   ├── admin.controller.js
│   │   └── contributor.controller.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── news.routes.js
│   │   ├── admin.routes.js
│   │   ├── contributor.routes.js
│   │   ├── notification.routes.js
│   │   └── category.routes.js
│   ├── services/
│   │   ├── auth.service.js        # Login/register/token logic
│   │   ├── news.service.js        # Feed, search, CRUD
│   │   ├── ingestion.service.js   # RSS + manual entry ingestion
│   │   ├── pipeline.service.js    # Summarize → Categorize → Translate → Tag
│   │   └── notification.service.js # FCM push notifications
│   ├── workers/
│   │   ├── rss_ingestion_worker.js
│   │   ├── summarization_worker.js
│   │   ├── translation_worker.js
│   │   └── cronScheduler.js       # Cron-based scheduling
│   ├── middlewares/
│   │   ├── auth.middleware.js     # JWT verify + role guard
│   │   ├── errorHandler.js        # Global error handler
│   │   └── validate.middleware.js # express-validator results handler
│   ├── utils/
│   │   ├── logger.js              # Winston + rotating files
│   │   ├── AppError.js            # Operational error class
│   │   ├── asyncHandler.js        # Async wrapper
│   │   ├── jwt.js                 # Token generation/verification
│   │   ├── helpers.js             # Content hash, pagination, response
│   │   └── cache.js               # Redis get/set/delete + middleware
│   ├── app.js                     # Express app factory
│   └── server.js                  # Entry point
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- MongoDB 7.x
- Redis 7.x

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Seed Database
```bash
node src/config/seeder.js
```

### 4. Start Development Server
```bash
npm run dev
```

---

## 🐳 Docker Deployment

```bash
# Start all services (API + MongoDB + Redis)
docker-compose up -d

# View logs
docker-compose logs -f api

# Rebuild after code changes
docker-compose up -d --build
```

---

## 📡 API Reference

### Auth Endpoints
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/auth/register` | Public | Register user |
| POST | `/api/auth/login` | Public | User login |
| POST | `/api/auth/refresh` | Public | Refresh access token |
| GET | `/api/auth/me` | User | Get profile |
| POST | `/api/auth/fcm-token` | User | Register FCM token |

### News Endpoints (Hyperlocal Feed)
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/news/feed` | Public | Hyperlocal prioritised feed |
| GET | `/api/news/trending` | Public | Trending (last 24h by views) |
| GET | `/api/news/search?q=` | Public | Full-text search |
| GET | `/api/news/category/:slug` | Public | News by category |
| GET | `/api/news/:id` | Public | Single article |

#### Feed Query Parameters
```
?district=guntur     # Filter by district
&state=Andhra Pradesh
&page=1
&limit=20
&language=te
```

### Admin Endpoints
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/admin/login` | Public | Admin login |
| GET | `/admin/dashboard/stats` | Admin | Dashboard stats |
| POST | `/admin/news` | Admin | Create news article |
| PUT | `/admin/news/:id` | Admin | Update news |
| DELETE | `/admin/news/:id` | Admin | Archive news |
| PUT | `/admin/news/:id/publish` | Admin | Publish + optional breaking alert |
| POST | `/admin/notification` | Admin | Send push notification |
| GET | `/admin/contributors` | Admin | List contributors |
| PUT | `/admin/contributors/:id/approve` | Admin | Approve contributor |
| GET | `/admin/raw-news` | Admin | Review ingested raw news |

### Contributor Endpoints
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/contributor/register` | Public | Register as contributor |
| POST | `/contributor/login` | Public | Contributor login |
| GET | `/contributor/profile` | Contributor | View profile |
| POST | `/contributor/news` | Contributor | Submit news article |
| GET | `/contributor/news` | Contributor | View own submissions |

---

## 📖 Documentation Index

For in-depth technical details, please refer to the following:
- [🏗️ System Architecture](docs/ARCHITECTURE.md) - Tech stack and high-level design.
- [🔄 Detailed Pipeline Flows](docs/FLOWS.md) - Sequence diagrams of the news journey.
- [⚙️ Background Workers](docs/WORKERS.md) - Deep dive into RSS, AI, and Image workers.

---

## 🔄 AI Processing Pipeline

The backend features a fully automated content pipeline:

1.  **Ingestion**: `RSS Ingestion Worker` pulls new content from web sources (last 48 hours only).
2.  **Summarization**: `AI Summarizer` (Groq/Llama 3) creates headlines and briefs.
3.  **Translation**: `AI Translator` (Groq) generates Telugu and Hindi versions.
4.  **Visuals**: `AI Image Worker` (Hugging Face / FLUX.1) generates realistic photography.
5.  **Review**: Articles wait in **`review`** status for manual editorial approval.
6.  **Publication**: Once an admin publishes, translations are promoted to the main feed.

---

## ⏰ Background Workers (Cron)

| Worker | Schedule | Provider | Description |
|--------|----------|----------|-------------|
| **Master Pipeline** | Every 10 min | Multiple | Sequential: RSS → Summarize → Translate → Images |
| **Catch-up Worker** | Every 5 min | Groq | Processes straggler raw news missed by 10-min pipe |
| **Safety Image Worker** | Every 5 min | HF / FLUX.1 | Scans for any article missing a generated image |
| **Trending Recalc** | Every hour | - | Recompute trending flags derived from views |

Run a worker manually:
```bash
npm run worker:all
# Full sequential processing of all pending items:
npm run worker:process
```

---

## 🔔 FCM Notification Targeting

| Audience | FCM Topic |
|----------|-----------|
| All users | `all_users` |
| District | `district_guntur` |
| State | `state_andhra_pradesh` |
| National | `national_news` |

---

## 🛡️ Security Features

- **JWT** access + refresh token rotation
- **Bcrypt** password hashing (cost factor 12)
- **Helmet** HTTP security headers
- **CORS** allowlist-based
- **Rate limiting** (100 req / 15 min per IP)
- **mongo-sanitize** for NoSQL injection prevention
- **Non-root Docker user**

---

## 🗄️ Redis Caching TTLs

| Resource | TTL |
|----------|-----|
| News feed | 2 min |
| Trending | 1 min |
| Single article | 5 min |
| Category news | 3 min |
| Categories list | 10 min |

---

## 📊 MongoDB Indexes

Key indexes for performance:
- `News`: compound on `(status, publishedAt)`, `(status, location.district)`, `(status, location.scope)`, `(status, isTrending)` + text index on title/summary/content/tags
- `User`: 2dsphere on `location.coordinates`
- `RawNews`: `(processingStatus, createdAt)`, `contentHash` unique sparse
- `NewsTranslation`: unique `(newsId, language)`

