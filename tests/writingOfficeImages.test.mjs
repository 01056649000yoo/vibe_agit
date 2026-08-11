import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import writeExcelFile from 'write-excel-file/node';
import { buildExcelSheetWithImages } from '../src/lib/excelExport.js';
import { getGenreMissionType } from '../src/modules/writing/mission-types/registry.js';
import { appendGoogleDocImageRequests } from '../src/modules/writing/export/googleDocImageExport.js';

const REPORT_ITEM = {
    작성자: '김하늘',
    미션제목: '새싹 관찰',
    학생글제목: '새싹이 자랐어요',
    내용: '새싹을 관찰하고 달라진 점을 기록했다.',
    _inputTemplate: 'report',
    _structuredContent: {
        template: 'report',
        version: 1,
        sections: [
            {
                id: 'first',
                heading: '첫째 날',
                body: '작은 싹이 나왔다.',
                image: {
                    path: 'post/first/photo.webp',
                    caption: '첫째 날 새싹',
                    width: 800,
                    height: 600,
                    mimeType: 'image/webp',
                },
            },
            {
                id: 'second',
                heading: '셋째 날',
                body: '잎이 더 커졌다.',
                image: {
                    path: 'post/second/photo.jpg',
                    caption: '셋째 날 새싹',
                    width: 600,
                    height: 800,
                    mimeType: 'image/jpeg',
                },
            },
        ],
    },
};

test('사진이 있는 장르는 Excel·Google Docs 공용 이미지 계약을 선언한다', async () => {
    const contract = getGenreMissionType('report')?.imageExport;
    assert.equal(contract?.id, 'report');
    assert.equal(typeof contract?.load, 'function');
    const imageExport = await contract.load();
    const images = imageExport.collectImages(REPORT_ITEM);
    assert.deepEqual(images.map((image) => image.path), [
        'post/first/photo.webp',
        'post/second/photo.jpg',
    ]);
    assert.deepEqual(images.map((image) => image.caption), ['첫째 날 새싹', '셋째 날 새싹']);
});

test('Excel은 내용 열 뒤에 사진 열을 만들고 같은 글 행에 이미지를 고정한다', async () => {
    const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgQIAKz9mWQAAAABJRU5ErkJggg==',
        'base64',
    );
    const rows = [{
        번호: 1,
        작성자: '김하늘',
        미션제목: '새싹 관찰',
        학생글제목: '새싹이 자랐어요',
        승인일: '2026-08-11',
        내용: '본문 마지막 다음에 사진이 옵니다.',
    }];
    const attachments = [[
        { blob: png, contentType: 'image/png', width: 800, height: 600, caption: '첫 사진' },
        { blob: png, contentType: 'image/png', width: 600, height: 800, caption: '둘째 사진' },
    ]];
    const sheet = buildExcelSheetWithImages(rows, attachments);

    assert.deepEqual(sheet.data[0].map((cell) => cell.value).slice(-3), ['내용', '사진 1', '사진 2']);
    assert.equal(sheet.images[0].anchor.row, 2);
    assert.equal(sheet.images[0].anchor.column, 7);
    assert.equal(sheet.images[1].anchor.column, 8);
    assert.ok(sheet.data[1][0].height >= 80);

    const workbook = await writeExcelFile(sheet.data, {
        sheet: 'Data',
        columns: sheet.columns,
        images: sheet.images,
        stickyRowsCount: 1,
    }).toBuffer();
    const files = unzipSync(new Uint8Array(workbook));
    assert.ok(files['xl/media/sheet1-image1.png']);
    assert.ok(files['xl/media/sheet1-image2.png']);
    const drawingXml = strFromU8(files['xl/drawings/drawing1.xml']);
    assert.match(drawingXml, /<xdr:col>6<\/xdr:col>[\s\S]*?<xdr:row>1<\/xdr:row>/);
    assert.match(drawingXml, /<xdr:col>7<\/xdr:col>[\s\S]*?<xdr:row>1<\/xdr:row>/);
});

test('Google Docs 이미지는 본문 뒤에서 한 장씩 가운데 정렬한다', () => {
    const requests = [];
    const nextIndex = appendGoogleDocImageRequests(requests, 40, [
        { docUri: 'https://example.test/one.jpg', width: 800, height: 600 },
        { docUri: 'https://example.test/two.jpg', width: 600, height: 800 },
    ]);

    assert.equal(requests[0].insertInlineImage.location.index, 40);
    assert.deepEqual(requests[0].insertInlineImage.objectSize, {
        width: { magnitude: 300, unit: 'PT' },
        height: { magnitude: 225, unit: 'PT' },
    });
    assert.equal(requests[1].insertText.location.index, 41);
    assert.equal(requests[3].insertInlineImage.location.index, 42);
    assert.equal(requests[5].updateParagraphStyle.paragraphStyle.alignment, 'CENTER');
    assert.equal(nextIndex, 44);
});

test('Google Docs 사진은 본문 삽입 뒤에 추가하고 임시 공개 파일을 반드시 정리한다', async () => {
    const [dataExportSource, googleImageSource] = await Promise.all([
        readFile('src/hooks/useDataExport.js', 'utf8'),
        readFile('src/modules/writing/export/googleDocImageExport.js', 'utf8'),
    ]);
    const contentIndex = dataExportSource.indexOf('currentIndex += contentText.length;');
    const imageIndex = dataExportSource.indexOf('appendGoogleDocImageRequests(', contentIndex);
    assert.ok(contentIndex >= 0 && imageIndex > contentIndex);
    assert.match(googleImageSource, /type: 'anyone', role: 'reader', allowFileDiscovery: false/);
    assert.match(googleImageSource, /method: 'DELETE'/);
    assert.match(googleImageSource, /cleanup:/);
});
