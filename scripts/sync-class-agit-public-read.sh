#!/usr/bin/env bash
set -euo pipefail
# Called only by an authorized deployment. Both entry point and shared handler must ship together.
class_agit_edge_src="supabase/functions/class-agit-public-read"
class_agit_edge_dst="$HOME/agit-supabase/volumes/functions/class-agit-public-read"
if [ -f "$class_agit_edge_dst/index.ts" ] && cmp -s "$class_agit_edge_src/index.ts" "$class_agit_edge_dst/index.ts" \
    && cmp -s "$class_agit_edge_src/handler.js" "$class_agit_edge_dst/handler.js"; then
    echo "class-agit-public-read already current"
else
    mkdir -p "$class_agit_edge_dst"
    install -m 0644 "$class_agit_edge_src/handler.js" "$class_agit_edge_dst/handler.js"
    install -m 0644 "$class_agit_edge_src/index.ts" "$class_agit_edge_dst/index.ts"
    (cd "$HOME/agit-supabase" && docker compose up -d --no-deps --force-recreate functions)
fi
# No real link/token is used in deployment verification. Missing/invalid input must fail closed.
for class_agit_edge_attempt in 1 2 3 4 5 6; do
    class_agit_edge_response=$(curl --max-time 5 -s -w $'\n%{http_code}' \
        -X POST http://127.0.0.1:8100/functions/v1/class-agit-public-read -H 'Content-Type: application/json' -d '{}' || true)
    if [ "$class_agit_edge_response" = $'{"version":1,"error":"unavailable"}\n404' ]; then
        echo "class-agit-public-read gateway verified"
        exit 0
    fi
    sleep 2
done
class_agit_edge_status=${class_agit_edge_response##*$'\n'}
echo "class-agit-public-read gateway verification failed: HTTP $class_agit_edge_status" >&2
exit 1
