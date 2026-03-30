# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copy production dependencies from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application source
COPY --chown=nodejs:nodejs . .

# Create logs directory
RUN mkdir -p logs && chown nodejs:nodejs logs

USER nodejs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "src/server.js"]
