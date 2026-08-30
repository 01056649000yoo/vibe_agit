# 1차 서비스 점검 근거 (2026-08-30)

> 관리자 `운영 → 서비스 관리` 의 12개 항목을 판정할 때 보는 근거다.
> **판정은 사람이 한다.** 이 문서는 지금 상태를 모아 둔 것이고, 화면에서 각 항목을
> `정상 / 보완 필요 / 해당 없음` 으로 고르면 된다. 완료 시각 + 3개월이 다음 점검일이 된다.

## CVE 기준 검사 — 완료

`npm run service:scan -- --force` 로 첫 기준을 만들었다. 이미지 16개 · **CRITICAL 39 · HIGH 777 · 긴급 23**.

| 이미지 | CRITICAL | HIGH | 수정 가능 | 긴급 |
|---|---:|---:|---:|---:|
| postgrest/postgrest:v14.12 | 17 | 263 | 139 | **12** |
| supabase/realtime:v2.102.3 | 7 | 106 | 35 | 2 |
| supabase/edge-runtime:v1.74.0 | 6 | 33 | 9 | 2 |
| darthsim/imgproxy:v3.30.1 | 2 | 49 | 51 | 2 |
| jarvis_brain_local-frontend | 1 | 23 | 24 | 1 |
| supabase/storage-api:v1.60.4 | 1 | 89 | 90 | 1 |
| supabase/gotrue:v2.189.0 | 1 | 44 | 44 | 1 |
| url-app | 1 | 12 | 13 | 1 |
| writing-helper:integrated-lab | 1 | 23 | 24 | 1 |
| curlimages/curl:8.12.1 | 2 | 22 | 24 | 0 |
| supabase/postgres:17.6.1.136 | 0 | 29 | 29 | 0 |
| kong/kong:3.9.3 | **0** | **0** | 0 | 0 |
| 그 외 4개 | 0 | 21 | 21 | 0 |

오늘 v0.8.0 으로 올린 직후의 값이다. 대부분 베이스 이미지의 OS 패키지이고,
**공개 경로에 닿는지**가 판단 기준이다(12번 항목).

---

## 항목별 근거

### 1. 외부·LAN 포트 — **확인 필요**

외부에 열린 포트: `22 · 80 · 443 · 28198 · 46594 · 52660`

- `80·443` Caddy — 정상
- **`22`(SSH)** — 공유기 전달 여부를 관리자 화면에서 봐야 한다. 로드맵의 미완료 P0 과 같은 건이다
- `28198` Stream Deck — 예전부터 알려진 항목
- **`46594·52660`** — 무엇인지 확인이 필요하다(포트가 매번 바뀌면 임시 프로세스일 수 있다)

### 2. SSH·Tailscale — **보완 필요로 보임**

`/etc/ssh/sshd_config` 에 `#PasswordAuthentication yes` (주석 처리 = 기본값 yes).
즉 **비밀번호 로그인이 열려 있다.** 원격 로그인 켜짐 여부는 관리자 권한이 필요해 확인하지 못했다.
→ 공개키 확인 후 `PasswordAuthentication no` 로 바꾸는 것이 로드맵의 남은 P0 이다.

### 3. 컨테이너 격리 — **부분 적용**

| 적용됨 | `jarvis-frontend`(ro·비root·nnp) · `samlink-app`(ro·비root·nnp) |
|---|---|
| **비root만** | `agit-auth`(supabase) · `agit-rest`(1000) · `agit-kong`(kong) · `agit-imgproxy`(999) · `samlink-cleanup` |
| **root로 실행** | `agit-db` · `agit-app` · `agit-storage` · `agit-realtime` · `agit-edge-functions` · `jarvis-caddy` · `classroom-tools` · `writing-helper-lab-app` · `agit-templates-server-1` |

**Docker 소켓은 어디에도 노출돼 있지 않다** (16개 전부 0). 이게 가장 중요한 부분이고 통과다.
Supabase 공식 구성은 손대면 업데이트마다 충돌하므로, 아지트·연구소 쪽부터 좁히는 것이 현실적이다.

### 4. 이미지·호스트 버전 — **대체로 고정, 4건 예외**

태그 있는 이미지 13개. 고정되지 않은 것 4건:
`jarvis_brain_local-frontend` · `url-app` · `classroom-tools-classroom-tools`(로컬 빌드라 무방) ·
**`caddy:latest`**(외부 이미지인데 태그가 `latest` — 버전을 고정하는 편이 좋다).
Supabase 는 오늘 `self-hosted/v0.8.0` 으로 올렸다.

### 5. 비밀·환경파일 — **정상**

`agit-supabase/.env` · `Jarvis_Brain_Local/frontend/.env.local` · `secrets.agit.env`
모두 `-rw-------`(600). 브라우저 노출은 앱 코드에서 service key 를 쓰지 않는 구조다.

### 6. HTTPS·인증서 — **정상**

인증서 유효기간 `2026-07-23 ~ 2026-10-21`. 약 **52일 남음**. Caddy 가 자동 갱신한다.
HSTS 는 아지트·API·샘링크·자비스에 적용돼 있다(2026-08-29 작업).

### 7. 디스크·로그 — **정상, Docker 는 주의**

호스트 여유 **110GB**(10% 사용). 백업 폴더 719MB. Caddy 로그 2개.
**Docker 는 상한 32GB 중 이미지 22.94GB + 캐시 2.67GB** 로 여유가 넉넉하지 않다.
2026-08-30 에 이것 때문에 이미지 빌드가 조용히 실패했다.
→ v0.8.0 7일 관찰이 끝나면 안 쓰는 이미지를 정리한다.

### 8. 재시작·서비스 상태 — **정상**

컨테이너 16개 모두 정상, unhealthy·재시작 반복 **0건**, 열린 경고 **0건**.

### 9. 백업·실제 복구 — **정상**

`PASS 2026-08-30 13:07` (내장·암호화 Drive·암호화 외장SSD 3중 완료).
월간 실제 복구 리허설 `PASS 2026-08-29`.
다만 08-29~08-30 새벽에 백업이 **466분** 걸린 일이 있었다(평소 27초). 원인 미상이며
백업 로그에 단계별 시각을 넣어 다음에 추적할 수 있게 해 두었다.

### 10. 복구키·물리 보안 — **확인 필요**

rclone crypt 열쇠는 `~/.config/rclone/rclone.conf` 의 `[agitcrypt]`·`[agitssdcrypt]` 에만 있다.
**이 파일 사본이 맥 밖(비밀번호 관리자 등)에 없으면 맥미니가 죽었을 때 백업을 열 수 없다.**
사본을 두었는지는 선생님만 아신다. 내장 FileVault 는 무인 재부팅 때문에 보류한 상태다.

### 11. DB·RPC·Realtime 표면 — **정상으로 보임**

Realtime 관리 경로(`/realtime/v1/api/openapi`·`/tenants`)는 Kong 에서 403 으로 막혀 있고
오늘 업데이트 스모크에서도 403 을 확인했다. 인증 없는 REST 는 401 이다.

### 12. CVE 예외 재검토 — **첫 기준이므로 예외 없음**

이번이 첫 기준 검사라 재검토할 기존 예외가 없다. 다음 분기부터 이 항목이 의미를 갖는다.
지금 눈에 띄는 것은 **postgrest 의 긴급 12건**인데, PostgREST 는 Kong 뒤에 있고
인증 없이는 401 이라 공개 경로에 바로 닿지 않는다.

---

## 판정 제안

| 항목 | 제안 |
|---|---|
| 1 외부·LAN 포트 | 보완 필요 (46594·52660 확인, 22 전달 여부) |
| 2 SSH·Tailscale | **보완 필요** (비밀번호 로그인 열림) |
| 3 컨테이너 격리 | 보완 필요 (소켓은 안전, root 실행 다수) |
| 4 이미지·호스트 버전 | 보완 필요 (`caddy:latest` 고정) |
| 5 비밀·환경파일 | 정상 |
| 6 HTTPS·인증서 | 정상 |
| 7 디스크·로그 | 정상 (Docker 정리는 7일 관찰 뒤) |
| 8 재시작·서비스 상태 | 정상 |
| 9 백업·실제 복구 | 정상 |
| 10 복구키·물리 보안 | 선생님만 판단 가능 |
| 11 DB·RPC·Realtime | 정상 |
| 12 CVE 예외 | 해당 없음 (첫 기준) |

**모두 판정해야 완료할 수 있고, 완료 시각 + 3개월이 다음 점검일이 된다.**
그때부터 분기 주기가 시작된다.
