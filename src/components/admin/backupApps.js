export const BACKUP_APPS = [
    {
        key: 'agit',
        label: '아지트',
        icon: '✍️',
        description: '아지트 DB·인증·Storage와 연구소 데이터를 함께 확인합니다.'
    },
    {
        key: 'samlink',
        label: '샘링크',
        icon: '🔗',
        description: '통합 DB의 samlink 스키마와 공용 운영 설정을 확인합니다.'
    },
    {
        key: 'jarvis',
        label: '자비스',
        icon: '🤖',
        description: '통합 DB의 app 스키마와 자비스 파일 묶음을 확인합니다.'
    }
];

export const BACKUP_APP_KEYS = BACKUP_APPS.map((app) => app.key);
