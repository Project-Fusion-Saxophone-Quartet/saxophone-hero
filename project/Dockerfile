# =========================
# Stage 1: Build frontend
# =========================
FROM node:20-alpine AS build

WORKDIR /app

COPY . .

# Install dependencies
RUN yarn install --frozen-lockfile

# Build frontend
RUN yarn build

# =========================
# Stage 2: Production
# =========================
FROM node:20-alpine

WORKDIR /app

# Copy server code
COPY --from=build /app/server ./server
COPY --from=build /app/index.mjs .

# Copy built frontend to ./dist so server.mjs can find it
COPY --from=build /app/dist ./dist

# Copy public folder
COPY --from=build /app/public ./public

# Copy package.json and install production dependencies
COPY --from=build /app/package.json .
RUN yarn install --production --frozen-lockfile

# Expose only the Cloud Run port
EXPOSE 8080

# Start server
CMD ["node", "index.mjs"]
