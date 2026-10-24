/**
 * 우리반 수호룡 광장 교사 화면. 교사가 정하거나 올릴 것은 없다 — 켜고 끄는 스위치는 놀이터 관리 화면의 공통 스위치가 맡는다.
 * (교사 활용 방법은 구현 뒤 선생님 결정으로 이어서 붙인다. docs/CLASS_DRAGON_ROOM_PLAN.md)
 */
export default function DragonPlazaTeacherManager() {
    return (
        <section style={{ display: 'grid', gap: 10, padding: 8, color: '#334155', lineHeight: 1.6 }}>
            <p style={{ margin: 0, fontSize: 'var(--ui-text-md)', fontWeight: 800 }}>🏫 우리 반 수호룡이 한 교실에 모여 앉아 있는 곳이에요.</p>
            <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: 'var(--ui-text-sm)' }}>
                <li>학급 학생 수만큼 자리가 있고, 친구의 수호룡과 공방에서 꾸민 문패·프레임이 책상에 보여요.</li>
                <li>학생이 자리를 누르면 그 친구의 아지트를 구경할 수 있어요. 칠판에는 이번 주 내 아지트에 놀러 온 친구의 이름이 나와요.</li>
                <li>선생님이 따로 정하거나 올리실 것은 없어요. 쓰지 않는 학급은 위쪽 스위치로 끄세요.</li>
            </ul>
        </section>
    );
}
