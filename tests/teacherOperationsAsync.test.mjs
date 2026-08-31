import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [classAnalysis, recentActivity, learningMastery] = await Promise.all([
    readFile('src/components/teacher/ClassAnalysis.jsx', 'utf8'),
    readFile('src/components/teacher/RecentActivity.jsx', 'utf8'),
    readFile('src/modules/learning/useLearningMastery.js', 'utf8')
]);

test('운영 현황은 빠른 기간 전환에서 늦은 이전 응답을 반영하지 않는다', () => {
    const loadBlock = classAnalysis.slice(
        classAnalysis.indexOf('const loadDashboard'),
        classAnalysis.indexOf('const totalStudents')
    );

    assert.match(classAnalysis, /const requestSequenceRef = useRef\(0\)/);
    assert.match(loadBlock, /const requestId = requestSequenceRef\.current \+ 1;\s*requestSequenceRef\.current = requestId/);
    assert.match(loadBlock, /await dataCache\.get[\s\S]*if \(requestId !== requestSequenceRef\.current\) return;\s*setData/);
    assert.match(loadBlock, /catch \(error\) \{\s*if \(requestId !== requestSequenceRef\.current\) return;/);
    assert.match(loadBlock, /finally \{\s*if \(requestId === requestSequenceRef\.current\) \{[\s\S]*setLoading\(false\);[\s\S]*setRefreshing\(false\);/);
    assert.match(loadBlock, /return \(\) => \{\s*requestSequenceRef\.current \+= 1;\s*\};/);
});

test('최근 활동은 기간·갈래·더 보기 변경 뒤 이전 목록을 덮거나 섞지 않는다', () => {
    const fetchBlock = recentActivity.slice(
        recentActivity.indexOf('const fetchPage'),
        recentActivity.indexOf("window.localStorage.setItem('teacher-recent-activity-columns-v1'")
    );

    assert.match(recentActivity, /const requestSequenceRef = useRef\(0\)/);
    assert.match(fetchBlock, /const requestId = requestSequenceRef\.current \+ 1;\s*requestSequenceRef\.current = requestId/);
    assert.match(fetchBlock, /await dataCache\.get[\s\S]*if \(requestId !== requestSequenceRef\.current\) return;\s*const items/);
    assert.match(fetchBlock, /const items[\s\S]*setActivities\(\(current\) => append \? \[\.\.\.current, \.\.\.items\] : items\)/);
    assert.match(fetchBlock, /catch \(error\) \{\s*if \(requestId !== requestSequenceRef\.current\) return;/);
    assert.match(fetchBlock, /finally \{\s*if \(requestId === requestSequenceRef\.current\) \{[\s\S]*setLoadingMore\(false\);[\s\S]*setRefreshing\(false\);/);
    assert.match(fetchBlock, /return \(\) => \{\s*requestSequenceRef\.current \+= 1;\s*\};/);
});

test('학습 성취는 학생 전환 뒤 직전 학생 응답을 새 학생 화면에 쓰지 않는다', () => {
    const loadBlock = learningMastery.slice(
        learningMastery.indexOf('const load = useCallback'),
        learningMastery.indexOf('// 효과 본문에서')
    );

    assert.match(learningMastery, /const requestSequenceRef = useRef\(0\)/);
    assert.match(loadBlock, /const requestId = requestSequenceRef\.current \+ 1;\s*requestSequenceRef\.current = requestId/);
    assert.match(loadBlock, /await supabase\.rpc\([\s\S]*if \(requestId !== requestSequenceRef\.current\) return;\s*setLoading\(false\)/);
    assert.match(loadBlock, /if \(error\) \{[\s\S]*setContents\(\[\]\);[\s\S]*setContents\(Array\.isArray\(data\?\.contents\)/);
    assert.match(learningMastery, /return \(\) => \{\s*window\.clearTimeout\(timerId\);\s*requestSequenceRef\.current \+= 1;\s*\};/);
});
