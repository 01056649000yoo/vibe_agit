/* eslint-disable security/detect-non-literal-fs-filename */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('학급 운영에 학생 아지트 탭이 있고 학생 명단 버튼이 같은 화면으로 연결된다', async () => {
    const [navigation, dashboard, operations, studentHub, studentList] = await Promise.all([
        read('src/constants/teacherNav.js'),
        read('src/components/teacher/TeacherDashboard.jsx'),
        read('src/components/teacher/TeacherOperationsHub.jsx'),
        read('src/components/teacher/TeacherStudentHub.jsx'),
        read('src/components/teacher/StudentManagementList.jsx')
    ]);

    assert.match(navigation, /id: 'operations'[\s\S]*id: 'student-agits', label: '학생 아지트'/);
    assert.match(dashboard, /visibleTab === 'student-agits'/);
    assert.match(dashboard, /navigationTarget=\{workspaceTarget\}/);
    assert.match(operations, /section === 'student-agits'[\s\S]*<TeacherStudentAgitViewer/);
    assert.match(studentHub, /tab: 'student-agits'[\s\S]*kind: 'student-agit'[\s\S]*studentId: student\.id/);
    assert.match(studentList, /id: 'agit'[\s\S]*label: '아지트 보기'[\s\S]*onOpenStudentAgit\?\.\(s\)/);
});

test('교사 학생 아지트는 담당 학급을 직접 제한하고 읽기 전용 상한을 지킨다', async () => {
    const [viewer, viewerStyles, migration] = await Promise.all([
        read('src/components/teacher/TeacherStudentAgitViewer.jsx'),
        read('src/components/teacher/TeacherStudentAgitViewer.css'),
        read('supabase/migrations/20260921_dragon_semester_farewell.sql')
    ]);

    assert.match(viewer, /get_teacher_dragon_growth_dashboard/);
    assert.match(viewer, /\.from\('students'\)[\s\S]*\.eq\('class_id', classId\)[\s\S]*\.limit\(100\)/);
    assert.match(viewer, /\.from\('student_posts'\)[\s\S]*\.eq\('class_id', classId\)[\s\S]*\.eq\('student_id', selectedStudentId\)[\s\S]*\.limit\(SHELF_LIMIT\)/);
    assert.match(viewer, /const SHELF_LIMIT = 60/);
    assert.match(viewer, /classKey\(classId, 'teacher-student-agit-shelf'/);
    assert.match(viewer, /className="teacher-student-agit__overview"/);
    assert.match(viewer, /<DragonHideoutScene[\s\S]*compact[\s\S]*eager/);
    assert.match(viewerStyles, /\.teacher-student-agit__overview\s*\{[\s\S]*grid-template-columns:/);
    assert.match(viewerStyles, /\.teacher-student-agit__room \.dragon-hideout-scene\s*\{[\s\S]*width: min\(100%, 260px\)/);
    assert.doesNotMatch(viewerStyles, /\.teacher-student-agit__room \.dragon-hideout-scene\s*\{[\s\S]{0,180}min-height: clamp/);
    assert.doesNotMatch(viewer, /\.(?:insert|update|delete|upsert)\(/);
    assert.doesNotMatch(viewer, /setInterval\s*\(|postgres_changes|\.channel\(/);

    const rpc = migration.slice(
        migration.indexOf('CREATE OR REPLACE FUNCTION public.get_teacher_dragon_growth_dashboard'),
        migration.indexOf('CREATE OR REPLACE FUNCTION public.open_teacher_dragon_season_closing')
    );
    assert.match(rpc, /c\.id = p_class_id[\s\S]*c\.teacher_id = auth\.uid\(\)/);
    assert.match(rpc, /WHERE s\.class_id = p_class_id[\s\S]*LIMIT 100/);
    assert.match(rpc, /REVOKE ALL ON FUNCTION public\.get_teacher_dragon_growth_dashboard\(UUID\) FROM PUBLIC, anon/);
});
