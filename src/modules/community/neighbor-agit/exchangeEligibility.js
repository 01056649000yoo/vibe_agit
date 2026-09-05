export function getExchangeEligibility({ memberships, classIds, hostClassId, actorClassId }) {
    if (classIds.length !== 2 || new Set(classIds).size !== 2 || !classIds.includes(actorClassId)) {
        return '우리 학급을 포함한 서로 다른 두 학급을 골라 주세요.';
    }
    if (!classIds.includes(hostClassId)) return '글짝 교환에는 호스트 학급이 포함되어야 합니다.';
    const selected = classIds.map((id) => memberships.find((item) => item.class_id === id && item.status === 'active'));
    if (selected.some((item) => !item || !Number.isInteger(item.matchable_student_count))) return '학생 수를 확인하려면 새로고침해 주세요.';
    const counts = selected.map((item) => item.matchable_student_count);
    if (Math.min(...counts) < 1 || Math.max(...counts) > 100) return '두 학급 모두 로그인 가능한 학생이 1~100명이어야 합니다.';
    if (Math.max(...counts) > Math.min(...counts) * 2) return '1:1·1:2 매칭을 위해 두 학급 인원 차이가 두 배 이내여야 합니다.';
    return '';
}
