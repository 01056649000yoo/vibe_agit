#!/usr/bin/env node

/**
 * 끄적끄적 아지트 기술·방법론 사전(docs/TECH_GLOSSARY.md) 자동 동기화 스크립트
 * 
 * 역할:
 * 1. package.json의 패키지, src/modules/의 기능 모듈, supabase/migrations/의 주요 RPC를 스캔합니다.
 * 2. docs/TECH_GLOSSARY.md에 해당 기술이나 모듈이 설명되어 있는지 검사합니다.
 * 3. 새로 도입된 기술/모듈/라이브러리가 발견되면 docs/TECH_GLOSSARY.md의
 *    "신규 감지된 기술/모듈 자동 등록 대기열" 섹션에 자동으로 템플릿과 함께 기록합니다.
 * 
 * 실행:
 *   node scripts/sync-tech-glossary.mjs         # 자동 감지 및 문서 갱신
 *   node scripts/sync-tech-glossary.mjs --check # 누락 여부 확인 (CI/체크리스트용)
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const GLOSSARY_PATH = 'docs/TECH_GLOSSARY.md';
const isCheckMode = process.argv.includes('--check');

// 1. 사전 원문 읽기
let glossaryContent = '';
try {
    glossaryContent = readFileSync(GLOSSARY_PATH, 'utf8');
} catch {
    console.error(`❌ ${GLOSSARY_PATH} 파일을 찾을 수 없습니다.`);
    process.exit(1);
}

// 2. package.json 의존성 수집
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const dependencies = Object.keys(pkg.dependencies || {});
const devDependencies = Object.keys(pkg.devDependencies || {});

// 3. src/modules 하위 모듈 수집
const getSubdirectories = (dir) => {
    try {
        return readdirSync(dir).filter(name => {
            const fullPath = path.join(dir, name);
            return statSync(fullPath).isDirectory() && !name.startsWith('.');
        });
    } catch {
        return [];
    }
};

const modules = [];
const moduleCategories = getSubdirectories('src/modules');
for (const cat of moduleCategories) {
    const subDirs = getSubdirectories(path.join('src/modules', cat));
    if (subDirs.length === 0) {
        modules.push({ category: cat, name: cat, path: `src/modules/${cat}` });
    } else {
        for (const sub of subDirs) {
            modules.push({ category: cat, name: sub, path: `src/modules/${cat}/${sub}` });
        }
    }
}

// 4. 최근 10개 마이그레이션 파일 수집
let recentMigrations = [];
try {
    const allMigrations = readdirSync('supabase/migrations')
        .filter(f => f.endsWith('.sql'))
        .sort();
    recentMigrations = allMigrations.slice(-10);
} catch {
    recentMigrations = [];
}

// 5. 미등록 항목 검사
const unmappedItems = [];

// A. 패키지 검사
for (const dep of dependencies) {
    const cleanName = dep.replace(/^@[\w-]+\//, '');
    if (!glossaryContent.includes(dep) && !glossaryContent.includes(cleanName)) {
        unmappedItems.push({
            type: '외부 라이브러리(패키지)',
            name: dep,
            location: 'package.json (dependencies)',
            hint: '새로 추가된 핵심 라이브러리입니다. 용도와 효과를 설명해 주세요.'
        });
    }
}

// B. 모듈 검사
for (const mod of modules) {
    if (!glossaryContent.includes(mod.name) && !glossaryContent.includes(mod.path)) {
        unmappedItems.push({
            type: '기능 모듈(Feature Module)',
            name: `${mod.category}/${mod.name}`,
            location: mod.path,
            hint: '새로 추가된 학급 기능 모듈입니다. 온/오프 방식 및 학생/교사 진입점을 설명해 주세요.'
        });
    }
}

// 6. 결과 처리 및 문서 갱신
const markerStart = '<!-- AUTO_SYNC_START -->';
const markerEnd = '<!-- AUTO_SYNC_END -->';

const startIndex = glossaryContent.indexOf(markerStart);
const endIndex = glossaryContent.indexOf(markerEnd);

if (startIndex === -1 || endIndex === -1) {
    console.error(`❌ ${GLOSSARY_PATH} 내에 자동 동기화 마커를 찾을 수 없습니다.`);
    process.exit(1);
}

if (unmappedItems.length === 0) {
    console.log('✅ 모든 주요 패키지 및 모듈이 기술 사전에 등록되어 있습니다.');
    if (isCheckMode) {
        process.exit(0);
    }
} else {
    console.log(`ℹ️ 기술 사전에 아직 상세 해설이 등록되지 않은 신규 항목 ${unmappedItems.length}개가 감지되었습니다:`);
    for (const item of unmappedItems) {
        console.log(`  - [${item.type}] ${item.name} (${item.location})`);
    }

    if (isCheckMode) {
        console.log('\n💡 `npm run glossary:sync`를 실행하여 사전에 자동 등록 대기열을 갱신하세요.');
        process.exit(0);
    }

    // 문서 갱신 블록 생성
    const today = new Date().toISOString().slice(0, 10);
    const generatedQueueLines = [
        `\n> 💡 아래 항목들은 최근 코드베이스에 새로 도입되었으나 아직 사전 본문 해설에 포함되지 않은 기술/모듈입니다. (감지일: ${today})`,
        '> 위 본문 적절한 카테고리로 내용을 옮겨 ① 쉬운 비유, ② 적용 위치, ③ 작동 원리, ④ 도입 이유를 작성해 주세요.\n'
    ];

    for (const item of unmappedItems) {
        generatedQueueLines.push(`### 📌 [신규 감지] ${item.name} (${item.type})`);
        generatedQueueLines.push(`* **위치**: \`${item.location}\``);
        generatedQueueLines.push(`* **안내**: ${item.hint}`);
        generatedQueueLines.push(`* **💡 쉬운 비유**: *(작성 대기 중)*`);
        generatedQueueLines.push(`* **⚙️ 작동 원리 및 도입 효과**: *(작성 대기 중)*\n`);
    }

    const newContent = glossaryContent.slice(0, startIndex + markerStart.length) +
        '\n' + generatedQueueLines.join('\n') +
        glossaryContent.slice(endIndex);

    writeFileSync(GLOSSARY_PATH, newContent, 'utf8');
    console.log(`\n🎉 ${GLOSSARY_PATH}의 자동 등록 대기열 섹션이 갱신되었습니다.`);
}
