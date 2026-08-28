# 호스트 Caddy 설정

운영 Caddy 설정은 `/etc/caddy/Caddyfile`(root 소유)에 있다. git 밖이라 여기에 사본을 둔다.

## `Caddyfile.with-access-log`

접근 로그를 켠 판이다. 2026-08-28 에 만들었다.

**왜**: "어제 그 시간에 무엇이 있었나"를 되짚을 방법이 없었다. `docker logs` 는 곧 밀려나고
컨테이너를 다시 만들면 사라진다. Supabase 의 `analytics`(Logflare)는 메모리 1.1GB 를 쓰면서
정작 한 건도 모으지 않아 껐다. 그 자리를 파일 로그로 대신한다.

**IP·헤더는 남기지 않는다**. 개인정보처리방침에 접속 로그·IP 수집 항목이 없고
만 14세 미만 아동이 쓰는 서비스다. 언제·무엇을·얼마나 걸려·어떤 상태로만 남긴다.

### 적용

```bash
# 1. 로그 자리 만들기
sudo mkdir -p /var/log/caddy && sudo chown root:wheel /var/log/caddy

# 2. 지금 것을 되돌릴 수 있게 사본부터
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M%S)

# 3. 새 설정 넣고 문법 확인 (틀리면 여기서 멈춘다)
sudo cp ops/caddy/Caddyfile.with-access-log /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# 4. 끊김 없이 다시 읽기
sudo caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

# 5. 확인
curl -s -o /dev/null -w "%{http_code}\n" https://xn--vz0ba242ncqcba79xhwx.site/
sudo tail -3 /var/log/caddy/agit-access.log
```

### 되돌리기

```bash
sudo cp /etc/caddy/Caddyfile.bak-<날짜> /etc/caddy/Caddyfile
sudo caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

### 로그가 쌓이는 양

한 파일 10MiB, 5개까지, 7일 뒤 버린다 → **최대 50MiB**.
도커 VM 디스크가 31.3GB 뿐이라 상한을 두었다(AGENTS.md 운영 함정 참고).
