import { createExhibitionDraft, editExhibition } from '../../modules/class-agit/exhibitionDraft.js';

// 실제 학생 자료가 아닌 개발 전용 창작 예문. 운영 모듈은 이 파일을 가져오지 않는다.
export const previewClass = { id: 'sample-class-agit', name: '4학년 햇살반' };
export const previewStudents = ['김도윤', '이서윤', '박하준', '최지아', '정현우', '강수아', '조지호', '윤다은', '한시우', '임예린', '오하린', '백이준', '문서아', '장우진', '신유나', '송민준'].map((name, index) => ({ id: `sample-student-${index + 1}`, name }));
const stories = [
    { title: '운동장 한쪽의 작은 봄', content: '운동장 구석에서 아주 작은 꽃을 발견했다. 아무도 심지 않았는데 노란 꽃 한 송이가 돌 틈에서 고개를 내밀고 있었다.\n\n나는 축구를 하다가도 그 꽃을 밟지 않으려고 조심했다. 친구에게 보여 주자 친구도 꽃 주위에 작은 돌을 놓아 주었다.\n\n이제 쉬는 시간이 되면 꽃에게 먼저 인사한다. 작은 것을 알아보는 마음도 조금씩 자라는 것 같다.' },
    { title: '비가 하는 말', stanzas: ['톡, 톡\n창문을 두드리는 비\n오늘은 천천히 걸으래', '찰박, 찰박\n웅덩이에 비친 하늘\n발끝에서 동그랗게 웃네', '우산 아래\n친구와 어깨를 나누면\n비 오는 날도 따뜻해'] },
    { title: '할머니의 주머니', content: '할머니의 주머니에서는 신기한 것이 나온다. 작은 사탕, 접은 휴지, 오래된 버스표. 오늘은 내가 유치원에서 그려 드린 그림이 나왔다.\n\n종이는 모서리가 닳아서 둥글어졌다. 할머니는 이 그림을 보면 어디에서든 내 얼굴이 생각난다고 하셨다.\n\n집에 돌아와 할머니를 다시 그렸다. 이번에는 할머니 주머니도 크게 그렸다. 그 안에 내 마음이 더 많이 들어갔으면 좋겠다.' },
    { title: '나무의 시간', stanzas: ['나무는 시계가 없어도\n봄이 오는 것을 안다', '작은 잎 하나\n또 하나\n초록 시간을 펼친다', '나는 나무 아래 앉아\n조금 느린 하루를 배운다'] },
    { title: '처음으로 혼자 만든 아침', content: '토요일 아침, 혼자 토스트를 만들기로 했다. 빵 위에 치즈를 올리고 계란을 구웠다. 계란은 동그랗게 되지 않았지만 냄새는 아주 좋았다.\n\n접시를 식탁에 놓고 가족을 불렀다. 모두 내가 만든 아침을 먹었다. 동생은 별 모양 계란이라며 웃었다.\n\n설거지를 하니 만들 때보다 힘들었다. 매일 밥을 준비하는 마음을 조금 알게 되었다.' },
    { title: '우리 집 고양이의 하루', content: '우리 집 고양이는 아침마다 햇볕을 따라 자리를 옮긴다. 처음에는 창가, 다음에는 소파, 오후에는 내 책상이다.\n\n내가 숙제를 펼치면 꼭 공책 위에 앉는다. 오늘은 옆에 빈 종이를 놓아 주었다. 고양이는 그 위에서 동그랗게 몸을 말았다.\n\n우리는 함께 숙제를 했다. 나는 글씨를 쓰고 고양이는 꿈을 썼다.' },
    { title: '지우개', stanzas: ['틀려도 괜찮아\n내가 옆에 있잖아', '내 몸은 작아져도\n네 마음은 작아지지 마', '다시 쓸 수 있는 칸을\n하얗게 비워 줄게'] },
    { title: '바람에게 빌린 자전거', content: '처음 두 발 자전거를 타던 날, 손잡이를 꼭 잡았다. 아빠가 뒤를 잡고 계신 줄 알았는데 돌아보니 멀리서 손을 흔들고 있었다.\n\n조금 무서웠지만 페달을 계속 밟았다. 얼굴에 닿는 바람이 나를 밀어 주는 것 같았다.\n\n집에 와서 무릎의 작은 상처를 보았다. 오늘 내가 혼자 달린 길만큼 마음에도 길이 생겼다.' },
    { title: '도서관에서 만난 친구', content: '도서관에서 같은 책에 손을 뻗은 친구가 있었다. 우리는 잠깐 웃다가 함께 읽기로 했다. 한 쪽씩 번갈아 소리 없이 읽었다.\n\n재미있는 장면에서는 서로 얼굴을 바라보았다. 말을 하지 않아도 같은 곳에서 웃고 있다는 것을 알 수 있었다.\n\n책을 다 읽고 다음 주에도 만나기로 했다. 책 한 권에서 이야기도 얻고 친구도 얻었다.' },
    { title: '저녁 하늘 한 숟갈', stanzas: ['엄마가 밥을 푸는 동안\n나는 창가에 서서\n저녁 하늘을 담는다', '주황 한 숟갈\n분홍 한 숟갈\n보라 한 숟갈', '오늘도 맛있는 하루\n잘 먹었습니다'] },
    { title: '다르게 보이는 우리 동네', content: '학교에 가는 길을 거꾸로 걸어 보았다. 늘 지나던 길인데 가게 간판도 나무 모양도 다르게 보였다.\n\n모퉁이 벽에 작은 그림이 있었다. 매일 지나면서 한 번도 보지 못했던 그림이었다. 나는 잠시 멈추어 그림 속 강아지의 이름을 지어 주었다.\n\n익숙한 길에도 처음 보는 것이 숨어 있다. 내일은 조금 천천히 걸어 봐야겠다.' },
    { title: '작은 용기를 모으면', content: '발표를 하려고 손을 들었다가 내렸다. 목소리가 작으면 친구들이 못 들을 것 같았다. 옆에 앉은 친구가 고개를 끄덕여 주었다.\n\n다시 손을 들었다. 처음 한 문장은 떨렸지만 두 번째 문장은 조금 잘 나왔다. 발표를 마치니 마음이 가벼워졌다.\n\n내가 낸 용기는 아주 작았지만 친구의 응원과 만나 조금 커졌다. 다음에는 내가 누군가에게 고개를 끄덕여 주고 싶다.' },
];

export const previewSources = Array.from({ length: 64 }, (_, index) => {
    const story = stories[index % stories.length];
    const student = previewStudents[index % 12];
    const round = Math.floor(index / stories.length);
    return {
        id: `sample-post-${index + 1}`, class_id: previewClass.id, student_id: student.id, student_name: student.name,
        source_revision: `sample-version-${index + 1}`, writing_context: 'assignment', is_submitted: true, is_confirmed: true, is_returned: false,
        title: `${story.title}${round ? ` · 계절 ${round + 1}` : ''}`, content: story.content || story.stanzas.join('\n\n'),
        input_template: story.stanzas ? 'poem' : null,
        structured_content: story.stanzas ? { template: 'poem', version: 1, stanzas: [...story.stanzas] } : null,
        group_title: story.stanzas ? '마음을 담은 시' : '우리의 작은 발견',
    };
});
previewSources.push(
    { ...previewSources[0], id: 'sample-long', title: '긴 글 읽기 실험', content: Array.from({ length: 24 }, (_, index) => `${index + 1}번째 기억. 운동장 구석에서 아주 작은 꽃을 발견했다. 아무도 심지 않았는데 노란 꽃 한 송이가 돌 틈에서 고개를 내밀고 있었다. 친구와 함께 작은 꽃을 바라보며 오래 기억하고 싶은 이야기를 나누었다.`).join('\n\n') },
    { ...previewSources[0], id: 'sample-private', title: '내 마음속 비밀 일기', writing_context: 'self', visibility: 'private' },
    { ...previewSources[0], id: 'sample-unconfirmed', title: '확인을 기다리는 글', is_confirmed: false },
    { ...previewSources[0], id: 'sample-unsubmitted', title: '아직 쓰는 중인 이야기', is_submitted: false },
    { ...previewSources[0], id: 'sample-report', title: '사진으로 남긴 봄 관찰', input_template: 'report', has_images: true },
);

export function createPreviewDraft(count = 12) {
    return previewSources.slice(0, count).reduce((draft, source) => editExhibition(draft, { type: 'add', source, classAcknowledged: true }), createExhibitionDraft(previewClass.id));
}
