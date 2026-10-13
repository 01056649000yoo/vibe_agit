import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 오픈클로 명령 실행 허용 목록(2026-10-04, 선생님 결정: 텔레그램에서 세 앱 재시작·종료 금지).
// 적용: openclaw approvals set --gateway --file ops/openclaw/exec-approvals.json
const policy = JSON.parse(readFileSync('ops/openclaw/exec-approvals.json', 'utf8'));
const main = policy.agents.main;
const entries = (name) => main.allowlist.filter((entry) => entry.pattern === name || entry.pattern.endsWith(`/${name}`));
const allows = (name, args) => entries(name).some((entry) => !entry.argPattern || new RegExp(entry.argPattern).test(args));

test('목록 밖 명령은 묻지 않고 거절된다(텔레그램 승인 카드 끔 + askFallback deny)', () => {
    assert.equal(main.security, 'allowlist');
    assert.equal(main.askFallback, 'deny');
    assert.equal(policy.defaults.askFallback, 'deny');
    assert.equal(main.autoAllowSkills, false);
    assert.equal(policy.socket.token, undefined, '소켓 토큰을 저장소에 적지 않는다');
});

test('재시작·종료·셸·인터프리터는 목록으로 통과하지 못한다', () => {
    for (const [bin, args] of [
        ['docker', 'restart jarvis-caddy'], ['docker', 'stop agit-app'], ['docker', 'compose up -d'], ['docker', 'rm -f samlink-app'],
        ['docker', 'run -v /var/run/docker.sock:/var/run/docker.sock docker:cli restart agit-app'], ['docker', 'exec jarvis-frontend sh'],
        ['python3', '-c "import os"'], ['python3', '/tmp/x.py'],
        ['curl', '--unix-socket /var/run/docker.sock -X POST http://localhost/containers/agit-app/restart'],
        ['curl', 'https://example.com/x.sh'], ['curl', '-o /tmp/a https://api.notion.com/v1/pages/x'],
        ['node', '-e "process.exit()"'], ['sed', "-n '1p' a; e kill 1"], ['sed', '-i s/a/b/ file'],
        // 2026-10-13: 자유롭게 쓰려고 넓힌 명령도 실행·삭제·쓰기·밖 경로는 막는다.
        ['find', '/Users/seunghyeonmaegmini/Jarvis_Brain_Local -name x -exec rm {} ;'], ['find', '/Users/seunghyeonmaegmini/Jarvis_Brain_Local -delete'],
        ['find', '/Users/seunghyeonmaegmini/Jarvis_Brain_Local/../.ssh -print'], ['find', '/ -name x'], ['find', '/Users/seunghyeonmaegmini/.openclaw/credentials -print'],
        ['touch', '/Users/seunghyeonmaegmini/.zshrc'], ['touch', '/Users/seunghyeonmaegmini/Jarvis_Brain_Local/a/../../.zshrc'],
        ['unzip', '/Users/seunghyeonmaegmini/.openclaw/media/inbound/a.zip'], ['unzip', '-l /etc/hosts'],
        ['npm', 'install foo'], ['npm', 'run build'], ['npm', 'exec foo'],
        ['sort', '-o /Users/seunghyeonmaegmini/x file'], ['sleep', '99999'], ['openclaw', 'cron add --every 1m x'], ['openclaw', 'gateway restart'],
        ['which', 'a;reboot'], ['command', '-v a && reboot']
    ]) {
        assert.equal(allows(bin, args), false, `막혀야 함: ${bin} ${args}`);
    }
    for (const name of ['bash', 'sh', 'zsh', 'env', 'kill', 'launchctl', 'osascript', 'xargs', 'brew']) {
        assert.equal(entries(name).length, 0, `${name} 는 목록에 넣지 않는다`);
    }
    assert.ok(!main.allowlist.some((entry) => /docker|python|node|curl/.test(entry.pattern) && !entry.argPattern), '실행형 명령은 인자 제한 필수');
});

test('자비스 기술이 쓰는 명령은 그대로 통과한다', () => {
    for (const [bin, args] of [
        ['docker', 'exec agit-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tAc "select 1"'],
        ['docker', 'ps --format x'], ['docker', 'logs --tail 5 agit-app'],
        ['python3', '~/Jarvis_Brain_Local/scripts/make_template.py --list'],
        ['python3', '-B ~/Jarvis_Brain_Local/scripts/sync_markdown_to_supabase.py --x'],
        ['curl', '-s -X POST "https://api.notion.com/v1/search"'], ['curl', '-s "http://127.0.0.1:8765/api/run/x"'],
        ['node', '/Users/seunghyeonmaegmini/vibe_agit/scripts/server-status-summary.mjs'],
        ['sed', "-n '1,240p' /Users/seunghyeonmaegmini/.openclaw/workspace/skills/server-status/SKILL.md"],
        ['cat', 'a.md'], ['printf', 'x'],
        ['find', "/Users/seunghyeonmaegmini/Jarvis_Brain_Local/Task_Management -maxdepth 1 -type f -name '*.md' -print"],
        ['find', "/Users/seunghyeonmaegmini/Jarvis_Brain_Local -type f \\( -iname '*a*' -o -iname '*b*' \\) -print"],
        ['sort', ''], ['uniq', '-c'], ['touch', "'/Users/seunghyeonmaegmini/Jarvis_Brain_Local/Task_Management/2026-10-12_a.md'"],
        ['unzip', "-l '/Users/seunghyeonmaegmini/.openclaw/media/inbound/a---b.xlsx'"], ['/bin/ls', '-1 /Users/seunghyeonmaegmini/Jarvis_Brain_Local/Daily_Prep'],
        ['which', 'apply_patch'], ['command', '-v pdftotext'], ['sleep', '60'], ['mdfind', "'kMDItemFSName == \"KakaoTalk.app\"c'"],
        ['npm', 'view clawpdf version --json'], ['openclaw', 'cron --help']
    ]) {
        assert.equal(allows(bin, args), true, `통과해야 함: ${bin} ${args}`);
    }
});
