# 끄적끄적 아지트 — 정적 빌드 후 Caddy로 서빙
# build-arg로 공개 Supabase URL/anon 키와 Google OAuth 클라이언트 ID를 주입
# (Vite는 빌드 타임에 VITE_*를 인라인하므로 OAuth 시크릿은 절대 넣지 않는다.)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run test:all
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_GOOGLE_CLIENT_ID
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" && test -n "$VITE_GOOGLE_CLIENT_ID"
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
RUN npm run build

FROM caddy:2-alpine AS runner
COPY --from=builder /app/dist /srv
COPY Caddyfile.container /etc/caddy/Caddyfile
EXPOSE 80
