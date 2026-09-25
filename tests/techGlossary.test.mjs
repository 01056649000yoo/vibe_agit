import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const glossary = await readFile('docs/TECH_GLOSSARY.md', 'utf8');

test('기술 사전(docs/TECH_GLOSSARY.md)은 필수 아키텍처 및 방법론 범주를 모두 포함한다', () => {
    // 1. 인프라
    assert.match(glossary, /셀프 호스팅|Self-hosting/);
    assert.match(glossary, /Mac mini|맥미니/);
    assert.match(glossary, /Docker/);
    assert.match(glossary, /Caddy/);
    assert.match(glossary, /Kong/);
    assert.match(glossary, /Supavisor/);

    // 2. 데이터베이스 & 백엔드
    assert.match(glossary, /PostgreSQL 17/);
    assert.match(glossary, /RLS|Row Level Security/);
    assert.match(glossary, /RPC|Remote Procedure Call/);
    assert.match(glossary, /SECURITY DEFINER/);
    assert.match(glossary, /트랜잭션|COMMIT|ROLLBACK/);

    // 3. 프론트엔드
    assert.match(glossary, /React 19/);
    assert.match(glossary, /Vite/);
    assert.match(glossary, /코어 셸|Core Shell/);
    assert.match(glossary, /기능 모듈|Feature Module/);
    assert.match(glossary, /Zustand/);
    assert.match(glossary, /지연 로딩|Lazy Loading/);

    // 4. 보안 & 인증
    assert.match(glossary, /JWT/);
    assert.match(glossary, /auth\.uid\(\)/);
    assert.match(glossary, /SSO|Single Sign-On/);
    assert.match(glossary, /레이트 리밋|Rate Limiting/);

    // 5. 성능 & AI & 바이브 코딩
    assert.match(glossary, /1,000명|하네스/);
    assert.match(glossary, /부트스트랩|Bootstrap/);
    assert.match(glossary, /Edge Function/);
    assert.match(glossary, /로컬 비속어 필터링|INAPPROPRIATE_WORDS/);
    assert.match(glossary, /바이브 코딩|Vibe Coding/);
    assert.match(glossary, /정본 단일화|Single Source of Truth/);
});

test('기술 사전 자동 동기화 검사 스크립트(glossary:check)가 오류 없이 정상 통과한다', () => {
    const output = execFileSync('node', ['scripts/sync-tech-glossary.mjs', '--check'], { encoding: 'utf8' });
    assert.match(output, /모든 주요 패키지 및 모듈이 기술 사전에 등록되어 있습니다/);
});
