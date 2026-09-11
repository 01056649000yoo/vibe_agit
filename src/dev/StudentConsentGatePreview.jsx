import React, { useState } from 'react';
import StudentConsentGate from '../components/teacher/StudentConsentGate';

/*
 * 학생 개인정보 동의서 확인 관문 미리보기 (2026-09-11).
 * 기존 학급 591개의 담당 교사가 다음 로그인 때 보는 화면이다. DB 없이 문구·배치만 본다.
 */
export default function StudentConsentGatePreview() {
    const [count, setCount] = useState(3);
    const [policy, setPolicy] = useState(true);
    const [done, setDone] = useState(false);
    const classes = Array.from({ length: count }, (_, i) => ({ id: `c${i}`, name: ['3학년 1반', '4학년 2반 (작년)', '방과후 글쓰기반', '5학년 3반', '독서 동아리'][i % 5] }));
    if (done) return <p style={{ padding: 24 }}>확인 완료 → 대시보드로 넘어갑니다. <button type="button" onClick={() => setDone(false)}>다시 보기</button></p>;
    return (
        <div>
            <div style={{ display: 'flex', gap: 6, padding: 8 }}>
                {[0, 1, 3, 5].map((n) => <button key={n} type="button" onClick={() => setCount(n)}>학급 {n}개</button>)}
                <button type="button" onClick={() => setPolicy((v) => !v)}>약관 추가 동의 {policy ? '있음' : '없음'}</button>
            </div>
            <StudentConsentGate classes={classes} needsPolicyConsent={policy} onConfirmed={() => setDone(true)} onLogout={() => alert('로그아웃')} />
        </div>
    );
}
