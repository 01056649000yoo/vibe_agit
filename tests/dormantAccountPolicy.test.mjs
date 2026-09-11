import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [usageHook, terms, privacy] = await Promise.all([
    readFile('src/hooks/useAdminUsage.js', 'utf8'),
    readFile('src/components/layout/TermsOfService.jsx', 'utf8'),
    readFile('src/components/layout/PrivacyPolicy.jsx', 'utf8')
]);

test('코드·이용약관·개인정보처리방침이 같은 장기 미접속·휴면 기준을 쓴다', () => {
    assert.match(usageHook, /DORMANT_DAYS = 90/);
    assert.match(usageHook, /DORMANT_ACCOUNT_DAYS = 365/);

    for (const document of [terms, privacy]) {
        assert.match(document, /90일 이상 1년 미만/);
        assert.match(document, /1년 이상/);
        assert.match(document, /휴면계정/);
    }
});

test('휴면 분류는 데이터 이관·자동 삭제가 아니며 로그인하면 해제된다', () => {
    for (const document of [terms, privacy]) {
        assert.match(document, /별도 데이터베이스로 옮기거나/);
        assert.match(document, /자동 삭제하지 않습니다/);
        assert.match(document, /다시 로그인하면/);
        assert.match(document, /자동.*해제/);
    }

    // 2026-09-11 개정으로 약관 동의 기록도 계정과 함께 보유·삭제된다.
    assert.match(privacy, /교사 계정 정보, 마지막 로그인 일시, 약관 동의 기록:<\/strong> 회원 탈퇴 시까지/);
    assert.match(privacy, /서버 접속 로그:<\/strong> 3개월/);
});

test('개정 정책은 7일 고지 기간을 둔 시행일을 밝힌다', () => {
    // 2026-09-11 개정: 학생 개인정보 처리 근거·수집 항목 정정, 동의 기록. 시행 2026-09-14.
    // 시행일의 원본은 src/constants/policyVersion.js 이고 tests/policyConsent.test.mjs 가 본문과 대조한다.
    assert.match(terms, /개정일: 2026년 9월 11일 · 개정 시행일: 2026년 9월 14일/);
    assert.match(privacy, /최종 수정일: 2026년 9월 11일 · 시행일: 2026년 9월 14일/);
    assert.match(privacy, /2026년 9월 14일부터 적용/);
    assert.match(privacy, /시행 7일 전부터 공지사항을 통해 고지/);
});
