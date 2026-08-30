# 업데이트 실행 절차와 실패 목록

> **범위**: 통합 스택(Supabase 묶음)과 그에 준하는 운영 업데이트를 **실제로 실행할 때** 보는 문서다.
> *무엇을 언제 올릴지*는 [SUPABASE_RELEASE_POLICY.md](SUPABASE_RELEASE_POLICY.md)가 정한다.
> 이 문서는 **어떻게 안 깨지게 실행하느냐**만 다룬다.
>
> 처음 쓴 계기: 2026-08-30 v0.8.0 반영이 **같은 원인으로 세 번 롤백**됐다. 원인은 타이밍이 아니라
> 스크립트 실행 권한이었고, 사전점검이 그걸 못 봤다. 그때 배운 것을 여기에 모은다.

## 0. 한 줄 원칙

**실패는 대부분 "업데이트 내용"이 아니라 "실행 환경"에서 난다.**
버전 호환성보다 권한·잠금·디스크·관문 상태를 먼저 의심한다.

---

## 1. 실행 전 체크리스트

붙여넣고 한 번에 확인한다.

```bash
cd ~/vibe_agit

# ① 비파괴 사전점검 — 여기서 걸리면 실행하지 않는다
./scripts/apply-supabase-v080.sh --preflight-only; tail -1 ~/backups/auto/supabase-upgrade-status.txt

# ② 잠금 폴더 (실패·성공 뒤 남는다. 남아 있으면 재실행이 막힌다)
ls -d ~/backups/auto/.supabase-upgrade-v080.lock 2>/dev/null && echo "잠금 있음 → 지워야 재실행" || echo "잠금 없음"

# ③ 관문 둘
grep -c "^PASS .*$(date +%Y-%m-%d)" ~/backups/auto/backup-status.txt      # 1 이어야 함
tail -n 8 ~/Library/Logs/agit-backup-monitor.stdout.log | grep -c "date=$(date +%Y-%m-%d) result=PASS "  # 1 이어야 함

# ④ 열린 경고 (판정기가 0건을 요구한다)
docker exec agit-db psql -U postgres -d postgres -tAc "select count(*) from public.system_alert_events where status='open';"

# ⑤ 디스크 — 호스트와 Docker 를 따로 본다
df -g / | awk 'NR==2{print "호스트 여유 "$4"GB"}'
docker system df

# ⑥ 되돌릴 자료 — 별도 보관 덤프를 하나 뜬다
SAFE=~/backups/manual/pre-update-$(date +%Y%m%d-%H%M%S); mkdir -p "$SAFE"; chmod 700 "$SAFE"
docker exec agit-db pg_dump -U supabase_admin -d postgres -Fc --no-owner -f /tmp/pre.dump \
  && docker cp agit-db:/tmp/pre.dump "$SAFE/아지트DB-전체.dump" && docker exec agit-db rm -f /tmp/pre.dump
docker run --rm -v "$SAFE":/b:ro postgres:17-alpine pg_restore -l /b/아지트DB-전체.dump | grep -c "SCHEMA - "

# ⑦ 실행 전 기준값 — 끝나고 대조할 숫자
docker exec agit-db psql -U postgres -d postgres -tAc \
  "select 'users '||count(*) from auth.users union all select 'tasks '||count(*) from app.tasks;"
```

**⑥은 건너뛰지 않는다.** 스크립트가 만드는 롤백 자산과 별개로, 순환 백업에 섞이지 않는 사본이 하나 있어야 한다.

## 2. 실행

```bash
./scripts/apply-supabase-v080.sh --apply 2>&1 | tail -20
```

- 화면의 `curl: (28) ... 10004 milliseconds` 는 **WebSocket 검사의 정상 소음**이다.
  101 을 받은 뒤 연결이 유지되다 제한 시간에 끊기며 나온다. 이것만 보고 실패로 판단하지 않는다.
- 결과는 `~/backups/auto/supabase-upgrade-status.txt` 한 줄로 남는다:
  `PASS` · `BLOCKED`(관문에서 멈춤, 운영 무변경) · `ROLLED_BACK`(적용했다가 되돌림).

## 3. 실행 후 확인

```bash
# 버전이 실제로 바뀌었나 — 상태 파일만 믿지 않는다
for c in agit-db agit-kong agit-auth agit-rest agit-realtime agit-storage; do
  printf "%-16s %s\n" "$c" "$(docker inspect $c --format '{{.Config.Image}}')"; done

# 자료가 그대로인가 — ⑦ 기준값과 대조
docker exec agit-db psql -U postgres -d postgres -tAc \
  "select 'users '||count(*) from auth.users union all select 'tasks '||count(*) from app.tasks;"

# 서비스
docker ps --filter name=agit- --format '{{.Names}} {{.Status}}'
curl -s -o /dev/null -w "아지트 %{http_code}\n" http://127.0.0.1:8300/
curl -s -o /dev/null -w "샘링크 %{http_code}\n" https://xn--9y2br3k43n.kr/

# 경고가 새로 생기지 않았나
docker exec agit-db psql -U postgres -d postgres -tAc \
  "select count(*) from public.system_alert_events where status='open';"
```

성공하면 **7일 관찰**을 시작하고, 그동안 Docker 이미지 정리를 하지 않는다(롤백 대상이 사라진다).

---

## 4. 문제 되는 상황 — 증상 → 원인 → 조치

### ① `BLOCKED  smoke helper is not executable`

- **원인**: 스모크가 부르는 스크립트에 실행 권한이 없다. git 에 `100644` 로 들어가면 이렇게 된다.
- **조치**: `git add --chmod=+x scripts/<파일>` 후 커밋.
- **이력**: 2026-08-30, `check-service-health.sh` 가 이 상태였다. 사전점검은 통과하는데 실행 중에만
  터져서 **세 번 연속 롤백**했다. 지금은 사전점검이 이 항목을 본다.

### ② `BLOCKED  04:00 integrated backup is not PASS`

- **원인**: 05:00 판정 시점에 백업이 아직 `RUNNING` 이었다. 백업이 실패한 것이 아니라 **느린 것**이다.
- **확인**: `cat ~/backups/auto/backup-status.txt`, `tail ~/backups/auto/sync.log`
- **조치**: 백업이 `PASS` 로 끝난 뒤 판정기를 다시 돌린다.
  `launchctl kickstart -k gui/501/com.agit.backup-monitor` (수동 실행은 로그 파일에 안 남아 관문이 못 본다)
- **주의**: 값을 손으로 만들지 않는다. 실제 상태가 통과할 때만 다시 돌린다.
- **이력**: 2026-08-30 05:30. 04:00 백업이 **466분** 걸렸다. 평소 0~1분이다.
- **원인 추적 방법(2026-08-30 추가)**: 백업 로그가 이제 단계마다 시각을 남긴다.
  `~/backups/auto/sync.log` 에서 `[누적 +이번단계초]` 를 보면 어느 구간이 늦었는지 바로 짚인다.

      ✓ 드라이브 agitcrypt:/20260830          [00:20 +16s]
      ✓ 암호화 외장SSD 사본 (7개·cryptcheck)   [00:26 +6s]

  평상시 값은 위와 같다(전체 27초). 다음에 늦어지면 이 줄들로 구간을 특정한다.

### ③ `BLOCKED  another upgrade process or completed one-shot lock exists`

- **원인**: 잠금 폴더가 남아 있다. **성공해도 실패해도 남는다**(일회성 표시).
- **조치**: `rmdir ~/backups/auto/.supabase-upgrade-v080.lock`
- **주의**: 정말 다른 실행이 돌고 있지 않은지 먼저 본다. `ps aux | grep apply-supabase`

### ④ 이미지 빌드·기동이 조용히 실패한다

- **증상**: `docker compose up -d` 가 `Container Running` 만 찍고 넘어가는데 **옛 이미지로 돈다.**
- **원인**: Docker 디스크가 찼다(`ENOSPC`). 호스트 디스크는 넉넉해도 **Docker 상한(32GB)** 은 따로다.
- **확인**: `docker system df` — Images + Build Cache 합이 상한에 가까운지.
- **조치**: `docker builder prune -af` (빌드 캐시는 다시 만들어진다).
  **이미지 정리(`image prune -a`)는 하지 않는다** — 롤백 대상이 지금 쓰는 이미지다.
- **주의(2026-08-30 실제로 겪음)**: `docker image prune -f`(dangling 만 지우는 것)에도
  **태그 없이 digest 로 고정한 도구 이미지는 지워진다.** Trivy(`aquasec/trivy@sha256:...`)가
  이렇게 사라져 CVE 검사가 실패했다. 지운 뒤 그런 도구를 쓸 일이 있으면 다시 받아야 한다.
- **이력**: 2026-08-30, 캐시 8.45GB 를 비워 약 9GB 를 확보했다.

### ⑤ 스모크가 기동 직후 실패한다

- **원인**: 컨테이너가 `healthy` 여도 Kong 뒤 첫 요청과 갓 만든 DB 연결은 잠깐 늦다.
- **조치**: 이미 완화되어 있다 — 기동 후 20초 대기, 앱 확인 5회×20초, DB 확인 6회×5초.
  더 필요하면 `SETTLE_SECONDS`·`APP_TRIES`·`DB_TRIES` 를 환경변수로 올린다.
- **주의**: 관대하게 바꿀 때는 **진짜 장애를 여전히 잡는지** 반드시 시험한다
  (없는 포트로 `APP_URL`, `DOCKER=/bin/false`).

### ⑥ 공개 주소가 맥에서 `000` 으로 보인다

- **원인일 수 있는 것**: 집 안에서 공인 IP 로 되짚는 **하이핀 경로**가 막힌 것. 밖에서는 멀쩡하다.
- **판별**: `curl --resolve <도메인>:443:127.0.0.1 https://<도메인>/` 이 200 이면 서버는 정상이다.
  최종 확인은 **휴대폰 LTE(와이파이 끄고)** 로 한다.
- **참고**: 판정기는 이미 아지트를 `--resolve ...:127.0.0.1` 로 보므로 하이핀 영향을 받지 않는다.
  샘링크·자비스는 Cloudflare 터널이라 애초에 이 경로를 타지 않는다.
- **이력**: 2026-08-30, 이걸 장애로 오인해 한참 헤맸다.

### ⑦ 되돌렸는데 자료가 걱정된다

- **자동 롤백이 되돌리는 것**: 설정과 이미지뿐이다. **DB 는 자동 복구하지 않는다.**
- **자료는 어디 있나**: 데이터 폴더 `~/agit-supabase/volumes/db/data` 를 그대로 재사용하므로
  기동 실패·스모크 실패로 되돌린 경우 자료는 손대지 않은 상태다.
- **확인**: 실행 전 기준값(⑦)과 대조한다. 다르면 그때
  `upgrade-backups/<시각>-pre-v080/pre-v080.dump` 나 별도 보관 덤프로 사람이 복원한다.

---

## 5. 다음에 이런 일이 없게 하려면

1. **사전점검이 실행 환경까지 본다.** 권한·Docker 여유를 이미 넣었다.
   새 스모크를 추가하면 그 의존물도 사전점검에 넣는다.
2. **실패하면 로그를 끝까지 읽고 나서 원인을 정한다.** 2026-08-30 에 첫 실패를 보고
   "기동이 느려서"라고 단정해 재시도 로직부터 만들었는데, 로그 한 줄에 `Permission denied` 가 있었다.
   두 번을 더 헛돌렸다.
3. **관대하게 고칠 때는 진짜 장애를 여전히 잡는지 같이 시험한다.**
4. **성공 뒤 7일 관찰 동안 Docker 이미지를 정리하지 않는다.**
5. 결과는 `WORKLOG.md` 에 남기고, 새로 겪은 실패 유형은 **이 문서 4장에 추가한다.**
