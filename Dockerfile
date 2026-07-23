# 끄적끄적 아지트 — 정적 빌드 후 Caddy로 서빙
# build-arg로 Supabase URL/anon 키를 주입 (Vite는 빌드 타임에 VITE_* 인라인)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY"
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
RUN npm run build

FROM caddy:2-alpine AS runner
COPY --from=builder /app/dist /srv
COPY Caddyfile.container /etc/caddy/Caddyfile
EXPOSE 80
