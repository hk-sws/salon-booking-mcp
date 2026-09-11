# ── App image ────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install

# App source.
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
