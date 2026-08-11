# 백업 (BACKUP)

> 이 파일은 **맥미니 백업 설정의 단일 기준 문서**다. git 밖 인프라이므로 커밋만으로는 안 보인다.
> 백업 관련 설정을 바꾸면 **여기와 `WORKLOG.md` 를 함께** 고친다.
>
> **비밀 값은 여기 쓰지 않는다.** 열쇠·비밀번호는 *어디에 있는지*만 적는다.

**최종 설정 점검: 2026-08-11 — 아지트 Storage named volume 백업·복구 검사 추가** (DB 복구 리허설 최종 통과는 2026-07-30)

---

## 1. 매월 점검 — 이것만 보면 된다

매월 **1일 04:40**, `com.agit.restore-rehearsal` 이 DB 백업은 **임시 DB에 실제 복원**하고 아지트 Storage
백업은 **임시 디렉터리에 실제로 풀어** 확인한 뒤 결과를 남긴다.
실패하면 화면 알림도 뜬다.

```bash
cat ~/backups/auto/rehearsal-status.txt
```

| 나오는 값 | 뜻 | 할 일 |
|---|---|---|
| `PASS …` | 그달 백업이 복원됨을 확인 | 없음 |
| `FAIL …` | 복원이 안 되거나 빠진 게 있음 | `~/backups/auto/rehearsal.log` 의 `✗` 줄을 본다 |

바로 돌려 보고 싶으면 (약 10초, 운영 DB 는 읽기만 한다):

```bash
bash ~/scripts/restore_rehearsal.sh; cat ~/backups/auto/rehearsal-status.txt
```

**이 점검이 있는 이유**: 2026-07-19~29 열하루 동안 쌤링크 백업이 **20바이트 빈 파일**을 만들면서
로그에는 `백업 완료 (4.0K)` 로 남겼다. "백업이 돌았다"는 신호는 믿을 수 없다.
**복원해 보는 것만이 증거다.**

---

## 2. 무엇이 언제 어디로

| 작업 | 시각 | 대상 | 사본 위치 | 보관 |
|---|---|---|---|---|
| `com.agit.backup` | 매일 **04:00** | `agit-db`(아지트) · 아지트 Storage 객체 · `supabase-db`(연구소·쌤링크·수업도구·글쓰기도우미) · 자비스 · 스택 설정 · Caddyfile | ①내장 ②구글드라이브(**암호화**) ③외장SSD | 드라이브 30일 |
| `com.samlink.db-backup` | 매일 **03:30** | `supabase-db` 전체 | 내장 + 드라이브(**암호화** `agitcrypt:samlink/`) | 14일 |
| `local.literacy.backup` | 매일 **03:00** | literacy DB | 드라이브 동기화 폴더 | — |
| `com.agit.restore-rehearsal` | **매월 1일 04:40** | 위 백업을 복원해 검증 | 로그·상태 파일 | — |

- 스크립트: `~/scripts/sh_mirror_backup.sh` · `~/.db-backup/backup.sh` · `~/literacy/scripts/backup-db.sh` · `~/scripts/restore_rehearsal.sh`
- 로그: `~/backups/auto/sync.log` · `~/.db-backup/backup.log` · `~/backups/auto/rehearsal.log`
- 내장 산출물: `~/backups/auto/YYYYMMDD/`
- 로컬 평문 백업 디렉터리는 `700`, 파일은 `600`으로 유지한다. 백업 스크립트가 `umask 077`로 새 산출물에도 같은 권한을 적용한다.

### 하루치 산출물 (8개)

| 파일 | 내용 |
|---|---|
| `아지트DB.dump` | 아지트 DB — `public·auth·storage·writing_helper·writing_helper_internal` |
| `연구소DB.dump` | 공용 DB — 위 + `app·literacy` |
| `롤.sql` | 롤 15개. `pg_dump` 는 롤을 담지 않아 따로 뜬다 |
| `리얼타임설정.dump` | `_realtime.tenants`(동시접속 한도·JWT) + `_realtime.extensions` |
| `아지트DB스택설정.tar.gz` | `~/agit-supabase` (⚠️ `.env`·`secrets.agit.env` 포함) |
| `아지트Storage.tar.gz` | Docker named volume `agit-storage-data`의 실제 사진 파일. DB의 `storage` 스키마와 함께 복구해야 함 |
| `자비스.tar.gz` | `Jarvis_Brain_Local` |
| `host_Caddyfile` | 호스트 Caddy 설정 |

---

## 3. 암호화와 열쇠 ⚠️

드라이브로 나가는 사본은 **rclone crypt** 로 암호화된다(내용·파일명 모두). 내장·외장SSD 사본은 평문이다.

- 원격 이름 `agitcrypt:` → 실제 위치 `gdrive:SH맥미니-enc`
- **열쇠는 `~/.config/rclone/rclone.conf` 의 `[agitcrypt]` 항목에만 있다.**

> ### 🔴 반드시 해야 할 일
> **`~/.config/rclone/rclone.conf` 사본을 맥미니 밖(비밀번호 관리자 등)에 보관한다.**
> 이게 없으면 맥미니가 죽었을 때 **드라이브 백업을 영영 열 수 없다** — 오프사이트 백업의 의미가 사라진다.
>
> **파일을 통째로 보관한다.** `rclone config show agitcrypt` 는 값을 `*** ENCRYPTED ***` 로 가려서
> 출력만 저장하면 소용이 없다. 실제 값(80글자 두 개)은 설정 파일 안에만 있다.
>
> ```bash
> open -e ~/.config/rclone/rclone.conf   # 내용을 비밀번호 관리자에 붙여넣거나 파일째 첨부
> ```
>
> 이 파일에는 구글 드라이브 접속 토큰도 함께 있어 **파일 자체가 비밀**이다. 평문으로 아무 데나 두지 않는다.
>
> **두면 안 되는 곳**: 대화창·구글 드라이브(백업이 거기 있다 = 금고 안에 열쇠)·깃 저장소·바탕화면.
> 이 파일은 백업 산출물 어디에도 들어가지 않는다(그래야 맞다).
>
> 파일 하나에 세 가지가 들어 있고 중요도가 다르다:
>
> | 항목 | 잃어버리면 |
> |---|---|
> | `password`·`password2` (crypt 열쇠) | 🔴 **드라이브 백업을 영영 못 연다. 복구 불가** |
> | `client_id`·`client_secret` | 🟡 Cloud Console 에서 재발급 |
> | `token` | 🟢 `rclone config reconnect gdrive:` 로 재발급 |
>
> ⚠️ **노출됐을 때**: 구글 권한 페이지에서 **액세스 삭제**를 해야 옛 토큰이 죽는다.
> **재연결만으로는 안 죽는다** — 구글은 같은 앱·계정에 토큰을 여러 개 살려 둔다.
> crypt 열쇠가 함께 샜다면 **열쇠 교체 + 옛 열쇠로 만든 암호문 폐기 + 재업로드**까지 해야 한다.
> (2026-07-30 에 실제로 이 절차를 밟았다. `WORKLOG.md` 같은 날 ⑪ 항목)

암호화가 필요한 이유: `아지트DB스택설정.tar.gz` 안에 `.env` 와 `secrets.agit.env` 가 그대로 들어가고,
DB 덤프에는 계정 비밀번호 해시가 있다. 2026-07-30 이전에는 이것이 평문으로 드라이브에 30일 남았다.

---

## 4. 복구 절차 (2026-07-30 리허설로 검증한 순서)

### ⚠️ 먼저 — `extensions` 스키마를 만들지 않으면 데이터가 조용히 빠진다

`extensions.uuid_generate_v4()` 를 기본값으로 쓰는 표는 그 스키마가 없으면 **생성부터 실패**하고,
표가 없으니 데이터도 안 들어간다. **오류를 안 읽으면 성공한 줄 안다.**
실제로 첫 리허설에서 `post_comments` 8,410건 · `post_reactions` 2,465건이 그렇게 사라졌다.

```bash
# 0) (드라이브에서 가져올 때) 암호화 사본 내려받기
rclone copy "agitcrypt:20260730" ./복구 --progress

# 1) 대상 DB 준비 — 이 단계를 건너뛰지 말 것
psql -U supabase_admin -d 대상DB \
  -c 'CREATE SCHEMA IF NOT EXISTS extensions;' \
  -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;' \
  -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;'
# 연구소DB 는 pgvector 도 필요하다
psql -U supabase_admin -d 대상DB -c 'CREATE EXTENSION IF NOT EXISTS vector;'

# 2) 롤 먼저 (권한을 얹을 대상이 있어야 한다)
psql -U supabase_admin -d postgres -f 롤.sql

# 3) 본 덤프
pg_restore -U supabase_admin -d 대상DB --no-owner 아지트DB.dump

# 3-1) 아지트 Storage 객체 파일 — 새 스택에서 storage/imgproxy를 올리기 전에 실행
docker volume create agit-storage-data
docker run --rm --entrypoint sh \
  -v agit-storage-data:/restore \
  -v "$PWD:/backup:ro" \
  supabase/storage-api:v1.48.26 \
  -c 'tar xzf /backup/아지트Storage.tar.gz -C /restore'

# 4) 리얼타임 설정 — 새 스택에는 시드된 행이 이미 있어 그대로 넣으면 PK 충돌이 난다.
#    기존 행을 지운 뒤 얹거나, 한도 값만 UPDATE 한다 (값은 WORKLOG 2026-07-30 항목 참고)
pg_restore -U supabase_admin -d 대상DB --no-owner --data-only 리얼타임설정.dump
```

정상이면 오류는 `schema "public" already exists` **1건**만 난다(무해).

- 테이블·함수 소유자가 `supabase_admin` 이다. **`-U postgres` 로는 실패**한다.
- `--no-privileges` 를 쓰지 않는다. 그러면 `anon`/`authenticated` 표 권한이 안 담겨,
  복원해도 **데이터는 있는데 PostgREST 가 표를 못 본다**(앱이 빈 화면).
- `agit-storage-data`는 compose의 외부 영구 볼륨이다. 새 맥에서 복구할 때는 위 명령으로 볼륨을 먼저 만들고
  객체 파일을 푼 뒤 `docker compose up -d storage imgproxy`를 실행한다.

### 덤프에 없는 것 (전체 재구축 시)

`realtime`(휘발성 메시지) · `vault`(비어 있음) · `supabase_functions.hooks`(비어 있음) · `net` · `graphql` · `extensions`.
→ Supabase 스택을 새로 띄우면 다시 만들어진다. 그 위에 위 덤프를 얹는다.
**단, 리얼타임 동시접속 한도는 손으로 넣은 값이라 자동 복구되지 않는다**(`SEED_SELF_HOST=false`).

---

## 5. 아직 남은 것

| 항목 | 누가 |
|---|---|
| 🔴 `rclone.conf` 사본을 맥미니 밖에 보관 (3절) | **사용자** |
| `gdrive:Supabase-Backups/literacy/` 는 아직 **평문**이다(15개·34MB). 같은 방식으로 `agitcrypt:` 로 옮길 수 있다 | 미정 |
| 외장SSD 를 뽑으면 3중 중 하나가 빠진다 | — |

### 2026-07-30 에 정리·해결한 것
- 드라이브 평문 백업(`gdrive:SH맥미니` 237MB)·`gdrive:samlink-backup` 삭제 → 드라이브에는 **암호화본만** 남았다.
- 내장·외장SSD 의 옛 백업과 컷오버 시절 임시 덤프 삭제. **오늘(20260730)치 한 벌**로 다시 시작한다.
  단 `~/backups/agit-cloud-20260724`(이관 전 클라우드 상태)는 대체 불가라 남겼다.
- 빈 백업 파일 11개(`postgres-20260719~29`) 삭제 — 로컬·드라이브 양쪽.
- 쌤링크 백업의 드라이브 사본을 `cp` → `rclone` 으로 바꿔 **전체 디스크 접근 권한 없이** 올라가게 했다(아래).

---

## 6. 되짚을 교훈

1. **파이프 종료코드를 믿지 마라.** `docker exec … | gzip > 파일` 은 `gzip` 의 성공을 돌려준다.
   `docker` 가 없어도 "성공"이었다. → `set -o pipefail` + 내용 크기 검사.
2. **launchd 는 로그인 셸 PATH 를 물려받지 않는다.** 명령은 절대 경로로 부른다.
3. **`du -h` 로 백업 크기를 판단하지 마라.** 빈 파일도 블록 크기 `4.0K` 로 보인다.
4. **백업이 있다 ≠ 복원된다.** 복원해 보기 전까지는 아무것도 증명되지 않았다.
6. **TCC(전체 디스크 접근)로 뚫기 전에 우회로를 본다.** 쌤링크 백업이 Drive 데스크톱 앱 폴더
   (`~/Library/CloudStorage/…`)에 `cp` 하다 launchd 에서 막혔다. `/bin/bash` 에 전체 디스크 접근
   권한을 주면 풀리지만 그 인터프리터로 도는 **모든** 스크립트가 디스크 전체를 읽게 된다.
   rclone 은 API 로 직접 올려 보호 폴더를 지나가지 않는다 → 권한 불필요 + 암호화가 덤으로 따라왔다.
5. **살아 있는 표와 백업을 행 수로 비교하지 마라.** 백업 시각과 검사 시각 사이에 데이터는 움직인다.
   리허설은 "운영과 똑같은가"가 아니라 "표가 빠지거나 비지 않았는가"로 판정한다.
