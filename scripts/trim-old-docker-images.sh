#!/bin/bash
# 새 버전이 올라간 지 오래된 "이전 버전" 도커 이미지를 지운다 (2026-10-11 선생님 결정).
#
# 왜: 버전을 올릴 때마다 이전 버전 이미지(수백 MB~1.7GB)가 도커 가상 디스크에 남는다. 처음 한동안은 되돌리기용으로
#   쓸모 있지만 새 버전이 자리 잡으면 쓸 일이 없다. 도커 디스크가 차면 배포가 죽으므로 한 달 뒤에는 치운다.
#
# 무엇을 지우나 — 같은 프로그램(저장소 이름)에 이미지가 둘 이상 있을 때, 가장 새것이 아닌 것 가운데
#   · 어떤 컨테이너도(멈춘 것 포함) 쓰지 않고
#   · 태그에 rollback 이 없고
#   · 가장 새 버전이 로컬에 들어온 지 30일(기본)이 지난 것.
# 버전이 하나뿐인 프로그램, 아지트·연구소·샘링크 앱 이미지(자체 롤백 규칙이 있음), 이름 없는 이미지는 건드리지 않는다.
#
#   bash scripts/trim-old-docker-images.sh            무엇을 지울지만 보여 준다(기본)
#   bash scripts/trim-old-docker-images.sh --apply    실제로 지운다
#   bash scripts/trim-old-docker-images.sh --apply 14 새 버전이 14일 지난 것부터
set -uo pipefail

APPLY=0
[ "${1:-}" = "--apply" ] && { APPLY=1; shift; }
KEEP_DAYS="${1:-30}"

command -v docker >/dev/null 2>&1 || { echo "도커가 없어 건너뜁니다."; exit 0; }
docker info >/dev/null 2>&1 || { echo "도커가 꺼져 있어 건너뜁니다."; exit 0; }

python3 - "$APPLY" "$KEEP_DAYS" <<'PY'
import json, subprocess, sys, datetime

apply_, keep_days = sys.argv[1] == "1", int(sys.argv[2])
OWN_ROLLBACK_REPOS = {"agit-app", "url-app", "writing-helper"}

def run(*args):
    return subprocess.run(args, capture_output=True, text=True).stdout

used = set()
for cid in run("docker", "ps", "-aq").split():
    used.add(run("docker", "inspect", "--format", "{{.Image}}", cid).strip())

def parse(text):
    text = text.split(".")[0].replace("T", " ").replace("Z", "").strip()
    try:
        return datetime.datetime.strptime(text[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc)
    except ValueError:
        return None

by_repo = {}
for line in run("docker", "images", "--format", "{{.Repository}}|{{.Tag}}").splitlines():
    repo, tag = line.split("|")
    if repo == "<none>" or tag == "<none>" or repo in OWN_ROLLBACK_REPOS or repo.endswith("-frontend"):
        continue
    info = json.loads(run("docker", "image", "inspect", f"{repo}:{tag}"))[0]
    by_repo.setdefault(repo, []).append({
        "ref": f"{repo}:{tag}", "id": info["Id"], "created": info["Created"],
        "tagged": parse(info.get("Metadata", {}).get("LastTagTime", "")),
        "size": info["Size"],
    })

now = datetime.datetime.now(datetime.timezone.utc)
targets, freed = [], 0
for repo, items in by_repo.items():
    if len(items) < 2:
        continue
    items.sort(key=lambda item: item["created"], reverse=True)
    newest, older = items[0], items[1:]
    arrived = newest["tagged"]
    if arrived is None or (now - arrived).days < keep_days:
        print(f"[기다림] {repo}: 가장 새 버전이 들어온 지 {keep_days}일이 안 됐습니다 — 이전 버전 {len(older)}개를 둡니다.")
        continue
    for item in older:
        if "rollback" in item["ref"] or item["id"] in used:
            continue
        targets.append(item["ref"])
        freed += item["size"]

if not targets:
    print("지울 이전 버전 이미지가 없습니다.")
    sys.exit(0)

print(("지웁니다" if apply_ else "지울 후보(실제로는 지우지 않았습니다)") + f" — {len(targets)}개, 약 {freed/1e9:.1f}GB:")
for ref in targets:
    print(f"  {ref}")
if apply_:
    for ref in targets:
        out = subprocess.run(["docker", "rmi", ref], capture_output=True, text=True)
        print(("  ✓ " if out.returncode == 0 else "  ✗ ") + ref + ("" if out.returncode == 0 else f" — {out.stderr.strip()[:120]}"))
PY
