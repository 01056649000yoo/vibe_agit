/**
 * 편지지의 원본. PDF 렌더러·출력 양식 선택 화면·교사의 빈 편지지 인쇄가 모두 이 목록을 본다.
 *
 * 계기교육에서 편지를 쓰는 때를 기준으로 골랐다. 학교 프린터가 흑백이거나 잉크 절약인 경우가 많아
 * 사진 이미지 대신 테두리·무늬·띠로만 그린다. 벡터라 확대해도 또렷하고 번들도 가볍다.
 *
 * **편지지 하나 = 이 파일의 한 항목**이다. 색만 바꾸는 것이 아니라 테두리 모양·배경 무늬·머리 띠 모양까지
 * 항목 안의 `css`가 정한다. 공용 뼈대(`letterPdfExport.js`)는 자리만 잡아 두고, 꾸미기는 여기서 한다.
 *
 * 공용 뼈대가 주는 자리:
 *   .letter-sheet          편지지 한 장
 *   .letter-sheet__band    머리 띠 (이모지 + 제목)
 *   .letter-sheet__body    본문
 *   .letter-sheet__deco--tl|tr|bl|br   네 모서리 장식 (기본 숨김)
 *   .letter-sheet__mark    워터마크 (기본 숨김)
 */

export const LETTER_PAPERS = Object.freeze([
    {
        value: 'plain',
        label: '기본 편지지',
        printTitle: '마음을 담은 편지',
        description: '무늬 없이 줄만 있는 단정한 편지지입니다.',
        shape: '가는 단선 테두리에 옅은 가로줄',
        emoji: '✉️',
        ink: '#334155',
        edge: '#CBD5E1',
        tint: '#FFFFFF',
        band: '#E2E8F0',
        css: `
        .pdf-entry--letter-plain .letter-sheet {
            border: .35mm solid #CBD5E1;
            border-radius: 2mm;
            background: #FFFFFF;
        }
        .pdf-entry--letter-plain .letter-sheet__band {
            justify-content: flex-start;
            border-bottom: .3mm solid #E2E8F0;
            color: #334155;
        }
        .pdf-entry--letter-plain .letter-sheet__row { color: #334155; }
        .pdf-entry--letter-plain .letter-sheet__blank-line { border-bottom-color: #CBD5E1; }`,
        blankCss: `
        .pdf-entry--letter-plain.pdf-entry--letter-blank .letter-sheet {
            border: .45mm solid #94A3B8;
            border-radius: 1mm;
            background:
                linear-gradient(135deg, transparent 0 49.7%, #F1F5F9 49.7% 50.3%, transparent 50.3%) 0 0 / 18mm 18mm,
                #FFFFFF;
        }
        .pdf-entry--letter-plain.pdf-entry--letter-blank .letter-sheet__band {
            justify-content: flex-start;
            border: 0;
            border-bottom: .8mm double #94A3B8;
            background: rgba(255, 255, 255, .9);
            color: #334155;
            letter-spacing: .08em;
        }
        .pdf-entry--letter-plain.pdf-entry--letter-blank .letter-sheet__deco--tr {
            display: block;
            top: 10mm;
            right: 17mm;
            z-index: 4;
            width: 18mm;
            height: 13mm;
            border: .35mm solid #94A3B8;
            background:
                linear-gradient(32deg, transparent 48%, #CBD5E1 49% 51%, transparent 52%),
                linear-gradient(-32deg, transparent 48%, #CBD5E1 49% 51%, transparent 52%),
                #FFFFFF;
            transform: rotate(3deg);
        }
        .pdf-entry--letter-plain.pdf-entry--letter-blank .letter-sheet__blank-line { border-bottom-color: #CBD5E1; }`,
    },
    {
        value: 'parents',
        label: '어버이날 편지지',
        printTitle: '사랑하는 마음을 담아',
        description: '5월 8일 부모님께. 둥근 카드 모양에 은은한 분홍빛과 카네이션 워터마크가 들어갑니다.',
        shape: '큰 라운드 카드 + 은은한 분홍 그라데이션 + 카네이션',
        emoji: '🌸',
        ink: '#9D174D',
        edge: '#F9A8D4',
        tint: '#FFF1F5',
        band: '#FBCFE8',
        watermark: '🌷',
        css: `
        .pdf-entry--letter-parents .letter-sheet {
            border: .9mm solid #F9A8D4;
            border-radius: 9mm;
            background: linear-gradient(145deg, #FFF9FB, #FFF1F5);
        }
        .pdf-entry--letter-parents .letter-sheet__band {
            justify-content: center;
            border-radius: 0 0 7mm 7mm;
            background: linear-gradient(90deg, #FBCFE8 0%, #FDE7EF 50%, #FBCFE8 100%);
            color: #9D174D;
        }
        .pdf-entry--letter-parents .letter-sheet__body { position: relative; }
        .pdf-entry--letter-parents .letter-sheet__mark {
            display: block;
            right: 10mm;
            bottom: 12mm;
            color: #F9A8D4;
            font-size: 52pt;
            opacity: .22;
        }
        .pdf-entry--letter-parents .letter-sheet__row { color: #9D174D; }
        .pdf-entry--letter-parents .letter-sheet__blank-line { border-bottom-color: #F9A8D4; }`,
        blankCss: `
        .pdf-entry--letter-parents.pdf-entry--letter-blank .letter-sheet {
            border: .9mm solid #F9A8D4;
            border-radius: 9mm;
            background:
                radial-gradient(circle at 8mm 8mm, #FBCFE8 0 1mm, transparent 1.1mm),
                radial-gradient(circle at calc(100% - 8mm) calc(100% - 8mm), #FBCFE8 0 1mm, transparent 1.1mm),
                linear-gradient(145deg, #FFF9FB, #FFF1F5);
        }
        .pdf-entry--letter-parents.pdf-entry--letter-blank .letter-sheet__band {
            left: 38mm;
            right: 38mm;
            justify-content: center;
            border: .45mm solid #F9A8D4;
            border-radius: 999px;
            background: linear-gradient(90deg, #FBCFE8, #FFF7FA 50%, #FBCFE8);
            color: #9D174D;
        }
        .pdf-entry--letter-parents.pdf-entry--letter-blank .letter-sheet__deco {
            display: block;
            z-index: 4;
            width: 13mm;
            height: 13mm;
            border: .4mm solid #F472B6;
            border-radius: 70% 30% 68% 32%;
            background: radial-gradient(circle at 35% 35%, #FFF7FA 0 18%, #F9A8D4 20% 62%, #F472B6 64%);
        }
        .pdf-entry--letter-parents.pdf-entry--letter-blank .letter-sheet__deco--tl { top: 6mm; left: 12mm; transform: rotate(-28deg); }
        .pdf-entry--letter-parents.pdf-entry--letter-blank .letter-sheet__deco--tr { top: 6mm; right: 12mm; transform: rotate(62deg); }
        .pdf-entry--letter-parents.pdf-entry--letter-blank .letter-sheet__deco--bl { bottom: 8mm; left: 9mm; transform: rotate(18deg) scale(.7); opacity: .65; }
        .pdf-entry--letter-parents.pdf-entry--letter-blank .letter-sheet__deco--br { bottom: 8mm; right: 9mm; transform: rotate(108deg) scale(.7); opacity: .65; }
        .pdf-entry--letter-parents.pdf-entry--letter-blank .letter-sheet__blank-line { border-bottom-color: #F9A8D4; }`,
    },
    {
        value: 'teacher',
        label: '스승의 날 편지지',
        printTitle: '선생님, 감사합니다',
        description: '5월 15일 선생님께. 칠판 머리글과 은은한 초록 줄, 아래쪽 연필 장식이 들어갑니다.',
        shape: '교실 칠판 머리글 + 은은한 초록 줄 + 아래쪽 연필 장식',
        emoji: '🍎',
        ink: '#166534',
        edge: '#86EFAC',
        tint: '#FFFFFF',
        band: '#DCFCE7',
        css: `
        .pdf-entry--letter-teacher .letter-sheet {
            border: .5mm solid #86EFAC;
            border-radius: 2mm;
            background:
                linear-gradient(180deg, rgba(220, 252, 231, .5), rgba(255, 254, 249, 0) 42mm),
                #FFFEF9;
        }
        .pdf-entry--letter-teacher .letter-sheet__band {
            justify-content: center;
            margin: 6mm 24mm 0;
            border: 1.1mm solid #854D0E;
            border-radius: 1.5mm;
            background: linear-gradient(#166534, #14532D);
            box-shadow: inset 0 0 0 .3mm rgba(255, 255, 255, .24), 0 1mm 0 #D6A56C;
            color: #FFFFFF;
            letter-spacing: .05em;
        }
        .pdf-entry--letter-teacher .letter-sheet__body {
            padding: 10mm 14mm 12mm;
        }
        .pdf-entry--letter-teacher .letter-sheet__row { color: #166534; }
        .pdf-entry--letter-teacher .letter-sheet__blank-line { border-bottom-color: #BFDBFE; }`,
        blankCss: `
        .pdf-entry--letter-teacher.pdf-entry--letter-blank .letter-sheet {
            border: .55mm solid #86EFAC;
            border-radius: 2.5mm;
            background:
                linear-gradient(180deg, rgba(220, 252, 231, .48), rgba(255, 254, 249, 0) 46mm),
                #FFFEF9;
        }
        .pdf-entry--letter-teacher.pdf-entry--letter-blank .letter-sheet__band {
            left: 30mm;
            right: 30mm;
            justify-content: center;
            border: 1.3mm solid #854D0E;
            border-radius: 1.5mm;
            background: linear-gradient(#166534, #14532D);
            box-shadow: inset 0 0 0 .35mm rgba(255, 255, 255, .28), 0 1.2mm 0 #D6A56C;
            color: #FFFFFF;
            letter-spacing: .08em;
        }
        .pdf-entry--letter-teacher.pdf-entry--letter-blank .letter-sheet__deco--bl,
        .pdf-entry--letter-teacher.pdf-entry--letter-blank .letter-sheet__deco--br {
            display: block;
            bottom: 7mm;
            z-index: 4;
            width: 24mm;
            height: 5mm;
            border: .3mm solid #D6A56C;
            border-radius: 1mm;
            background: repeating-linear-gradient(90deg, #FDE68A 0 4mm, #FACC15 4mm 4.4mm);
        }
        .pdf-entry--letter-teacher.pdf-entry--letter-blank .letter-sheet__deco--bl { left: 8mm; transform: rotate(5deg); }
        .pdf-entry--letter-teacher.pdf-entry--letter-blank .letter-sheet__deco--br { right: 8mm; transform: rotate(-5deg); }
        .pdf-entry--letter-teacher.pdf-entry--letter-blank .letter-sheet__blank-line { border-bottom-color: #BFDBFE; }`,
    },
    {
        value: 'soldier',
        label: '나라사랑 편지지',
        printTitle: '감사와 응원의 마음을 담아',
        description: '호국보훈의 달과 국군의 날 위문편지. 태극색 모서리와 은은한 무궁화 장식으로 꾸밉니다.',
        shape: '차분한 이중 테두리 + 태극색 모서리 + 무궁화 머리글',
        emoji: '✿',
        ink: '#1E3A8A',
        edge: '#9BB6D6',
        tint: '#FFFEFC',
        band: '#F8FAFC',
        css: `
        .pdf-entry--letter-soldier .letter-sheet {
            border: .6mm solid #9BB6D6;
            border-radius: 3mm;
            background:
                radial-gradient(circle at 10mm 10mm, rgba(200, 16, 46, .08) 0 8mm, transparent 8.3mm),
                radial-gradient(circle at calc(100% - 10mm) calc(100% - 10mm), rgba(0, 52, 120, .07) 0 8mm, transparent 8.3mm),
                linear-gradient(145deg, #FFFEFC, #F8FBFF);
            box-shadow: inset 0 0 0 .3mm #F7D6DC;
        }
        .pdf-entry--letter-soldier .letter-sheet__band {
            justify-content: center;
            margin: 6mm 24mm 0;
            border-top: .5mm solid #C8102E;
            border-bottom: .5mm solid #003478;
            background: rgba(255, 255, 255, .86);
            color: #1E3A8A;
            letter-spacing: .08em;
        }
        .pdf-entry--letter-soldier .letter-sheet__emoji {
            color: #C8102E;
            font-size: 15pt;
        }
        .pdf-entry--letter-soldier .letter-sheet__body {
            padding: 10mm 14mm 12mm;
        }
        .pdf-entry--letter-soldier .letter-sheet__deco--tl,
        .pdf-entry--letter-soldier .letter-sheet__deco--br {
            display: block;
            z-index: 4;
            width: 8mm;
            height: 8mm;
            border: .7mm solid #FFFFFF;
            border-radius: 50%;
            background:
                radial-gradient(circle at 50% 25%, #003478 0 24%, transparent 25%),
                radial-gradient(circle at 50% 75%, #C8102E 0 24%, transparent 25%),
                linear-gradient(180deg, #C8102E 0 50%, #003478 50%);
            box-shadow: 0 0 0 .35mm #CBD5E1;
        }
        .pdf-entry--letter-soldier .letter-sheet__deco--tl { top: 8mm; left: 10mm; transform: rotate(-12deg); }
        .pdf-entry--letter-soldier .letter-sheet__deco--br { right: 10mm; bottom: 8mm; transform: rotate(168deg); opacity: .72; }
        .pdf-entry--letter-soldier .letter-sheet__row { color: #1E3A8A; }
        .pdf-entry--letter-soldier .letter-sheet__blank-line { border-bottom-color: #93C5FD; }`,
        blankCss: `
        .pdf-entry--letter-soldier.pdf-entry--letter-blank .letter-sheet {
            border: .6mm solid #9BB6D6;
            border-radius: 3mm;
            background:
                radial-gradient(circle at 10mm 10mm, rgba(200, 16, 46, .08) 0 8mm, transparent 8.3mm),
                radial-gradient(circle at calc(100% - 10mm) calc(100% - 10mm), rgba(0, 52, 120, .07) 0 8mm, transparent 8.3mm),
                linear-gradient(145deg, #FFFEFC, #F8FBFF);
            box-shadow: inset 0 0 0 .3mm #F7D6DC;
        }
        .pdf-entry--letter-soldier.pdf-entry--letter-blank .letter-sheet__band {
            left: 30mm;
            right: 30mm;
            justify-content: center;
            border: 0;
            border-top: .5mm solid #C8102E;
            border-bottom: .5mm solid #003478;
            border-radius: 0;
            background: rgba(255, 255, 255, .88);
            color: #1E3A8A;
            letter-spacing: .08em;
        }
        .pdf-entry--letter-soldier.pdf-entry--letter-blank .letter-sheet__deco--tl { top: 8mm; left: 10mm; transform: rotate(-12deg); }
        .pdf-entry--letter-soldier.pdf-entry--letter-blank .letter-sheet__deco--tr,
        .pdf-entry--letter-soldier.pdf-entry--letter-blank .letter-sheet__deco--bl { display: none; }
        .pdf-entry--letter-soldier.pdf-entry--letter-blank .letter-sheet__deco--br { right: 10mm; bottom: 8mm; transform: rotate(168deg); opacity: .72; }
        .pdf-entry--letter-soldier.pdf-entry--letter-blank .letter-sheet__blank-line { border-bottom-color: #93C5FD; }`,
    },
    {
        value: 'thanks',
        label: '고마운 분들께',
        printTitle: '고마운 마음을 담아',
        description: '경찰관·소방관·환경미화원 등 고마운 분들께. 감사장처럼 이중 테두리와 모서리 장식이 있습니다.',
        shape: '감사장 — 이중 테두리 + 네 모서리 마름모',
        emoji: '🙏',
        ink: '#92400E',
        edge: '#FCD34D',
        tint: '#FFFBEB',
        band: '#FDE68A',
        css: `
        .pdf-entry--letter-thanks .letter-sheet {
            position: relative;
            border: 1mm solid #FCD34D;
            border-radius: 2mm;
            background: #FFFDF5;
        }
        .pdf-entry--letter-thanks .letter-sheet::before {
            content: '';
            position: absolute;
            inset: 3mm;
            border: .35mm solid #FCD34D;
            border-radius: 1mm;
            pointer-events: none;
        }
        .pdf-entry--letter-thanks .letter-sheet__deco {
            display: block;
            width: 3.5mm;
            height: 3.5mm;
            background: #FCD34D;
            transform: rotate(45deg);
        }
        .pdf-entry--letter-thanks .letter-sheet__deco--tl { top: 5mm; left: 5mm; }
        .pdf-entry--letter-thanks .letter-sheet__deco--tr { top: 5mm; right: 5mm; }
        .pdf-entry--letter-thanks .letter-sheet__deco--bl { bottom: 5mm; left: 5mm; }
        .pdf-entry--letter-thanks .letter-sheet__deco--br { bottom: 5mm; right: 5mm; }
        .pdf-entry--letter-thanks .letter-sheet__band {
            justify-content: center;
            margin: 6mm 8mm 0;
            border-bottom: .4mm solid #FCD34D;
            color: #92400E;
            letter-spacing: .1em;
        }
        .pdf-entry--letter-thanks .letter-sheet__body { padding-top: 10mm; }
        .pdf-entry--letter-thanks .letter-sheet__row { color: #92400E; }
        .pdf-entry--letter-thanks .letter-sheet__blank-line { border-bottom-color: #FCD34D; }`,
        blankCss: `
        .pdf-entry--letter-thanks.pdf-entry--letter-blank .letter-sheet {
            border: 1mm solid #D6A227;
            border-radius: 0;
            background:
                linear-gradient(135deg, rgba(253, 230, 138, .18), transparent 22%),
                linear-gradient(315deg, rgba(253, 230, 138, .18), transparent 22%),
                #FFFDF7;
        }
        .pdf-entry--letter-thanks.pdf-entry--letter-blank .letter-sheet::before {
            inset: 4mm;
            border: .35mm double #D6A227;
            border-radius: 0;
        }
        .pdf-entry--letter-thanks.pdf-entry--letter-blank .letter-sheet__band {
            left: 32mm;
            right: 32mm;
            justify-content: center;
            border: 0;
            border-top: .35mm solid #D6A227;
            border-bottom: .35mm solid #D6A227;
            background: linear-gradient(90deg, transparent, #FEF3C7 24% 76%, transparent);
            color: #78350F;
            letter-spacing: .14em;
        }
        .pdf-entry--letter-thanks.pdf-entry--letter-blank .letter-sheet__deco {
            display: block;
            z-index: 4;
            width: 7mm;
            height: 7mm;
            border: .4mm solid #D6A227;
            background: #FFFDF7;
            box-shadow: inset 0 0 0 1.2mm #FEF3C7;
            transform: rotate(45deg);
        }
        .pdf-entry--letter-thanks.pdf-entry--letter-blank .letter-sheet__deco--tl { top: 8mm; left: 8mm; }
        .pdf-entry--letter-thanks.pdf-entry--letter-blank .letter-sheet__deco--tr { top: 8mm; right: 8mm; }
        .pdf-entry--letter-thanks.pdf-entry--letter-blank .letter-sheet__deco--bl { bottom: 8mm; left: 8mm; }
        .pdf-entry--letter-thanks.pdf-entry--letter-blank .letter-sheet__deco--br { right: 8mm; bottom: 8mm; }
        .pdf-entry--letter-thanks.pdf-entry--letter-blank .letter-sheet__blank-line { border-bottom-color: #E7C461; }`,
    },
    {
        value: 'friend',
        label: '친구 사랑 편지지',
        printTitle: '친구야, 고마워',
        description: '학교폭력 예방 주간의 칭찬 편지. 말풍선 머리글과 산뜻한 하늘빛 바탕으로 꾸밉니다.',
        shape: '말풍선 머리글 + 산뜻한 하늘빛 + 모서리 장식',
        emoji: '💛',
        ink: '#0E7490',
        edge: '#7DD3FC',
        tint: '#F0F9FF',
        band: '#BAE6FD',
        css: `
        .pdf-entry--letter-friend .letter-sheet {
            border: .6mm dashed #7DD3FC;
            border-radius: 5mm;
            background: linear-gradient(145deg, #FAFEFF, #EFF9FF);
        }
        .pdf-entry--letter-friend .letter-sheet__band {
            position: relative;
            justify-content: center;
            width: fit-content;
            max-width: 80%;
            margin: 8mm auto 6mm;
            padding: 4mm 9mm;
            border: .5mm solid #7DD3FC;
            border-radius: 999px;
            background: #FFFFFF;
            color: #0E7490;
        }
        .pdf-entry--letter-friend .letter-sheet__band::after {
            content: '';
            position: absolute;
            left: 16mm;
            bottom: -3.4mm;
            width: 4mm;
            height: 4mm;
            border-right: .5mm solid #7DD3FC;
            border-bottom: .5mm solid #7DD3FC;
            background: #FFFFFF;
            transform: rotate(45deg);
        }
        .pdf-entry--letter-friend .letter-sheet__row { color: #0E7490; }
        .pdf-entry--letter-friend .letter-sheet__blank-line { border-bottom-color: #7DD3FC; }`,
        blankCss: `
        .pdf-entry--letter-friend.pdf-entry--letter-blank .letter-sheet {
            border: .7mm dashed #38BDF8;
            border-radius: 7mm;
            background: linear-gradient(145deg, #FAFEFF, #EEF9FF);
        }
        .pdf-entry--letter-friend.pdf-entry--letter-blank .letter-sheet__band {
            left: 39mm;
            right: 39mm;
            justify-content: center;
            border: .55mm solid #38BDF8;
            border-radius: 8mm;
            background: #FFFFFF;
            color: #0E7490;
            box-shadow: 2mm 2mm 0 #FDE68A;
        }
        .pdf-entry--letter-friend.pdf-entry--letter-blank .letter-sheet__band::after {
            left: 18mm;
            bottom: -3.3mm;
            width: 5mm;
            height: 5mm;
            border-color: #38BDF8;
        }
        .pdf-entry--letter-friend.pdf-entry--letter-blank .letter-sheet__deco {
            display: block;
            z-index: 4;
            width: 10mm;
            height: 8mm;
            border: .45mm solid #38BDF8;
            border-radius: 50%;
            background: #FFFFFF;
            box-shadow: 1.5mm 1.5mm 0 #FDE68A;
        }
        .pdf-entry--letter-friend.pdf-entry--letter-blank .letter-sheet__deco--tl { top: 13mm; left: 13mm; transform: rotate(-12deg); }
        .pdf-entry--letter-friend.pdf-entry--letter-blank .letter-sheet__deco--tr { top: 9mm; right: 13mm; transform: rotate(10deg) scale(.75); }
        .pdf-entry--letter-friend.pdf-entry--letter-blank .letter-sheet__deco--bl { bottom: 10mm; left: 10mm; transform: rotate(8deg) scale(.65); opacity: .7; }
        .pdf-entry--letter-friend.pdf-entry--letter-blank .letter-sheet__deco--br { right: 10mm; bottom: 10mm; transform: rotate(-8deg) scale(.65); opacity: .7; }
        .pdf-entry--letter-friend.pdf-entry--letter-blank .letter-sheet__blank-line { border-bottom-color: #7DD3FC; }`,
    },
    {
        value: 'farewell',
        label: '헤어지는 친구에게',
        printTitle: '우리의 소중한 추억',
        description: '졸업·전학으로 헤어지는 친구에게. 리본 배너 머리글과 아래쪽 별 장식이 들어갑니다.',
        shape: '리본 배너 머리글 + 은은한 보라 그라데이션 + 별 장식',
        emoji: '🎓',
        ink: '#5B21B6',
        edge: '#C4B5FD',
        tint: '#F5F3FF',
        band: '#DDD6FE',
        watermark: '⭐',
        css: `
        .pdf-entry--letter-farewell .letter-sheet {
            border: .5mm solid #C4B5FD;
            border-radius: 3mm;
            background: linear-gradient(145deg, #FCFBFF, #F6F3FF);
        }
        .pdf-entry--letter-farewell .letter-sheet__band {
            justify-content: center;
            width: 76%;
            margin: 7mm auto 4mm;
            background: linear-gradient(90deg, #C4B5FD 0%, #DDD6FE 50%, #C4B5FD 100%);
            color: #4C1D95;
            clip-path: polygon(0 0, 100% 0, 96% 50%, 100% 100%, 0 100%, 4% 50%);
        }
        .pdf-entry--letter-farewell .letter-sheet__body { position: relative; }
        .pdf-entry--letter-farewell .letter-sheet__mark {
            display: block;
            right: 12mm;
            bottom: 14mm;
            color: #C4B5FD;
            font-size: 44pt;
            opacity: .2;
        }
        .pdf-entry--letter-farewell .letter-sheet__row { color: #5B21B6; }
        .pdf-entry--letter-farewell .letter-sheet__blank-line { border-bottom-color: #C4B5FD; }`,
        blankCss: `
        .pdf-entry--letter-farewell.pdf-entry--letter-blank .letter-sheet {
            border: .6mm solid #A78BFA;
            border-radius: 4mm;
            background: linear-gradient(180deg, #6D5FB5 0 30mm, #F8F7FF 30.5mm 100%);
        }
        .pdf-entry--letter-farewell.pdf-entry--letter-blank .letter-sheet__band {
            left: 28mm;
            right: 28mm;
            justify-content: center;
            border: 0;
            background: linear-gradient(90deg, #C4B5FD, #EDE9FE 50%, #C4B5FD);
            color: #4C1D95;
            clip-path: polygon(0 0, 100% 0, 95% 50%, 100% 100%, 0 100%, 5% 50%);
            letter-spacing: .08em;
        }
        .pdf-entry--letter-farewell.pdf-entry--letter-blank .letter-sheet__blank-line { border-bottom-color: #C4B5FD; }`,
    },
]);

export const DEFAULT_LETTER_PAPER = 'plain';

export const getLetterPaper = (value) => (
    LETTER_PAPERS.find((paper) => paper.value === value) || LETTER_PAPERS[0]
);

/** 출력 양식 선택 화면에 넘길 목록. 보고서의 `renderModes`와 같은 계약이다. */
export const getLetterPaperRenderModes = () => LETTER_PAPERS.map((paper) => ({
    value: paper.value,
    label: `${paper.emoji} ${paper.label}`,
    description: paper.shape,
}));

/** 편지지마다 다른 꾸미기 규칙을 한 벌로 잇는다. */
export const getLetterPaperStyles = () => LETTER_PAPERS.map((paper) => paper.css).join('\n');

/** 빈 편지지에서만 쓰는 주제별 장식. 고정 쓰기 영역 뒤에 붙여 위치 기준을 덮어쓰지 않는다. */
export const getLetterBlankPaperStyles = () => LETTER_PAPERS.map((paper) => paper.blankCss).join('\n');
