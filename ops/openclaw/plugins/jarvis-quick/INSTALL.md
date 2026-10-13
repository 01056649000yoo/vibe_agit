# jarvis-quick (오픈클로 플러그인)

텔레그램 슬래시 명령(`/task` `/done` `/memo` `/proj` `/cal` `/pdf` — 형식이 간단한 것만. 복잡한 것은 문장으로)을 **모델을 거치지 않고** 자비스 통합 명령(`~/Jarvis_Brain_Local/scripts/jarvis.py quick <종류>`)에 곧바로 넘긴다(2026-10-13).
스킬(`ops/openclaw/skills/{task,done,memo,proj,cal,pdf}`)이 머리말 `command-dispatch: tool` + `command-tool: jarvis_quick` 으로 이 도구를 부른다.

설치(맥미니, Node 24 필요):
```
export PATH=/opt/homebrew/Cellar/node@24/24.21.0/bin:$PATH
cp -R ops/openclaw/plugins/jarvis-quick ~/openclaw-plugins/ && cd ~/openclaw-plugins/jarvis-quick
npm install && npm run plugin:build && npm run plugin:validate
openclaw plugins install --link --force ~/openclaw-plugins/jarvis-quick
cp -R ops/openclaw/skills/{jarvis,task,done,memo,proj,cal,pdf} ~/.openclaw/workspace/skills/   # 그리고 openclaw config set skills.entries.<이름>.enabled true
```
실행은 고정 스크립트 하나(`execFile`, 셸 없음)이고 명령 이름은 목록(task·done·memo·proj·cal·pdf)만 받는다.

텔레그램 `/` 메뉴 순서는 `channels.telegram.customCommands`(앞쪽이 맨 위)와 `channels.telegram.commands.nativeSkills=false` 로 정한다.
메뉴는 시작할 때 한 번 등록되므로 바꾼 뒤 `openclaw gateway restart`.
