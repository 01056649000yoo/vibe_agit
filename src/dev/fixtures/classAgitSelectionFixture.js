import { previewClass, previewSources, previewStudents } from './classAgitFixtures.js';
import { createClassAgitPersistenceFixture } from './classAgitPersistenceFixture.js';

export const selectionMissions = Array.from({ length: 66 }, (_, index) => ({
    id: `selection-mission-${index}`, title: `${String(index + 1).padStart(2, '0')} ${['새로운 시작', '가족의 이야기', '마음을 담은 시', '자연 관찰', '친구에게 전하는 마음'][index % 5]}`,
    format: index === 64 ? 'report' : index % 5 === 2 ? 'poem' : 'prose', supported: index !== 64,
    archived: index >= 50, created_at: new Date(Date.UTC(2026, 8, 5 - index)).toISOString(),
}));
export const selectionSources = selectionMissions.flatMap((mission, index) => index === 65 ? [] : Array.from({ length: 16 }, (_, number) => ({
    ...previewSources[mission.format === 'poem' ? 1 : 0], id: `selection-post-${index}-${number}`, mission_id: mission.id,
    student_id: previewStudents.at(number).id, student_name: previewStudents.at(number).name, title: `${mission.title} · ${number + 1}번째 이야기`,
    source_revision: `selection-revision-${index}-${number}`, group_title: mission.title, input_template: mission.format === 'report' ? 'report' : mission.format === 'poem' ? 'poem' : null,
    updated_at: mission.created_at,
})));
export async function createClassAgitSelectionFixture(count = 0) {
    const fixture = createClassAgitPersistenceFixture(selectionSources, selectionMissions);
    const id = 'selection-exhibition';
    let workspace = await fixture.api.runAction(previewClass.id, 'create', { exhibition_id: id });
    if (count) {
        const { addExhibitionSources } = await import('../../modules/class-agit/selection/model.js');
        let draft = workspace.draft;
        for (let start = 0; start < count; start += 50) draft = addExhibitionSources(draft, selectionSources.slice(start, Math.min(start + 50, count)));
        workspace = await fixture.api.save(previewClass.id, draft, workspace.draft.revision);
    }
    return { ...fixture, workspace };
}
