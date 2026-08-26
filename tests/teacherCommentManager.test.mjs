import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const componentPath = 'src/components/teacher/TeacherCommentManager.jsx';
const stylePath = 'src/components/teacher/teacherComments.css';

test('학생 댓글 관리 새로고침은 현재 조건을 재조회하고 기존 목록을 유지한다', async () => {
    const source = await readFile(componentPath, 'utf8');

    assert.match(source, /aria-label="학생 댓글 목록 새로고침"/);
    assert.match(source, /onClick=\{refresh\}/);
    assert.match(source, /loading=\{refreshing\}/);
    assert.match(source, /loadingText="갱신 중\.\.\."/);
    assert.match(source, /load\(\{ keepContent: true \}\)/);
    assert.match(source, /if \(!keepContent\) \{\s*setItems\(\[\]\);\s*setTotal\(0\);/);
});

test('검색 자동 조회와 수동 새로고침이 겹쳐도 중복·오래된 응답을 반영하지 않는다', async () => {
    const source = await readFile(componentPath, 'utf8');

    assert.match(source, /const requestSequenceRef = useRef\(0\)/);
    assert.match(source, /조건이 바뀌는 즉시[\s\S]*requestSequenceRef\.current \+= 1/);
    assert.match(source, /requestId !== requestSequenceRef\.current/);
    assert.match(source, /const scheduledLoadRef = useRef\(null\)/);
    assert.match(source, /window\.clearTimeout\(scheduledLoadRef\.current\)/);
    assert.equal((source.match(/get_teacher_class_comments/g) || []).length, 1);
});

test('더 보기 응답은 검색·탭·학급이 바뀐 뒤 새 목록에 섞이지 않는다', async () => {
    const source = await readFile(componentPath, 'utf8');
    const loadMoreBlock = source.match(/const loadMore = async \(\) => \{[\s\S]*?\n    \};/)?.[0] || '';

    assert.match(loadMoreBlock, /const requestId = requestSequenceRef\.current/);
    assert.match(loadMoreBlock, /fetchPage\(items\.length\)[\s\S]*requestId !== requestSequenceRef\.current\) return;[\s\S]*setItems/);
});

test('검색창과 새로고침 버튼은 좁은 화면에서도 잘리지 않는다', async () => {
    const styles = await readFile(stylePath, 'utf8');

    assert.match(styles, /\.teacher-comments__tools\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/);
    assert.match(styles, /@media \(max-width: 420px\)[\s\S]*\.teacher-comments__tools\s*\{ grid-template-columns: minmax\(0, 1fr\); \}/);
    assert.match(styles, /\.teacher-comments__refresh\s*\{ min-height: 44px; white-space: nowrap; \}/);
});
