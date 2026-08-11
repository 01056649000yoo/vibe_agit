const normalizeCellValue = (value) => {
    if (value == null) return '';
    if (value instanceof Date || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    return JSON.stringify(value);
};

const safeSheetName = (name) => String(name || 'Data')
    .replace(/[\\/?*:[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'Data';

const headerCell = (value) => ({
    value,
    fontWeight: 'bold',
    backgroundColor: '#EAF2FF',
    borderColor: '#CBD5E1',
    borderStyle: 'thin'
});

const fitImageInside = (image, maxWidth, maxHeight) => {
    const width = Math.max(1, Number(image?.width) || 4);
    const height = Math.max(1, Number(image?.height) || 3);
    const scale = Math.min(maxWidth / width, maxHeight / height, 1);
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
};

export const exportObjectsToExcel = async (rows, fileName, options = {}) => {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('출력할 데이터가 없습니다.');
    const headers = Object.keys(rows[0]);
    if (headers.length === 0) throw new Error('출력할 열이 없습니다.');

    const data = [
        headers.map(headerCell),
        ...rows.map((row) => headers.map((header) => normalizeCellValue(Reflect.get(row, header))))
    ];
    const widths = options.columnWidths || headers.map((header) => Math.min(60, Math.max(12, header.length + 4)));
    const columns = headers.map((_, index) => ({ width: Reflect.get(widths, index) || 14 }));
    const { default: writeExcelFile } = await import('write-excel-file/browser');
    await writeExcelFile(data, {
        sheet: safeSheetName(options.sheetName),
        columns,
        stickyRowsCount: 1
    }).toFile(`${fileName}.xlsx`);
};

export const buildExcelSheetWithImages = (rows, attachmentsByRow, options = {}) => {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('출력할 데이터가 없습니다.');
    const headers = Object.keys(rows[0]);
    if (headers.length === 0) throw new Error('출력할 열이 없습니다.');
    const imageCount = Math.max(0, ...(attachmentsByRow || []).map((images) => images?.length || 0));
    const imageHeaders = Array.from({ length: imageCount }, (_, index) => `사진 ${index + 1}`);
    const allHeaders = [...headers, ...imageHeaders];
    const excelImages = [];
    const dataRows = rows.map((row, rowIndex) => {
        const rowImages = Reflect.get(attachmentsByRow || [], rowIndex) || [];
        const fittedImages = rowImages.map((image) => ({
            image,
            size: fitImageInside(image, 144, 108),
        }));
        const tallestImage = Math.max(0, ...fittedImages.map(({ size }) => size.height));
        const rowHeight = tallestImage > 0 ? Math.ceil((tallestImage + 10) * 0.75) : undefined;
        fittedImages.forEach(({ image, size }, imageIndex) => {
            excelImages.push({
                content: image.blob,
                contentType: image.contentType,
                width: size.width,
                height: size.height,
                dpi: 96,
                anchor: {
                    row: rowIndex + 2,
                    column: headers.length + imageIndex + 1,
                },
                offsetX: 4,
                offsetY: 4,
                title: `사진 ${imageIndex + 1}`,
                description: image.caption || '',
            });
        });

        return [
            ...headers.map((header, columnIndex) => ({
                value: normalizeCellValue(Reflect.get(row, header)),
                wrap: header === '내용',
                alignVertical: 'top',
                ...(columnIndex === 0 && rowHeight ? { height: rowHeight } : {}),
            })),
            ...imageHeaders.map(() => ({ value: '', alignVertical: 'top' })),
        ];
    });
    const baseWidths = options.columnWidths || headers.map((header) => (
        header === '내용' ? 60 : Math.min(32, Math.max(12, header.length + 4))
    ));
    return {
        data: [allHeaders.map(headerCell), ...dataRows],
        columns: [
            ...headers.map((_, index) => ({ width: Reflect.get(baseWidths, index) || 14 })),
            ...imageHeaders.map(() => ({ width: 22 })),
        ],
        images: excelImages,
    };
};

export const exportObjectsToExcelWithImages = async (
    rows,
    attachmentsByRow,
    fileName,
    options = {},
) => {
    const sheet = buildExcelSheetWithImages(rows, attachmentsByRow, options);
    const { default: writeExcelFile } = await import('write-excel-file/browser');
    await writeExcelFile(sheet.data, {
        sheet: safeSheetName(options.sheetName),
        columns: sheet.columns,
        images: sheet.images,
        stickyRowsCount: 1,
    }).toFile(`${fileName}.xlsx`);
};
