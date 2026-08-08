const normalizeCellValue = (value) => {
    if (value == null) return '';
    if (value instanceof Date || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    return JSON.stringify(value);
};

const safeSheetName = (name) => String(name || 'Data')
    .replace(/[\\/?*:[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'Data';

export const exportObjectsToExcel = async (rows, fileName, options = {}) => {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('출력할 데이터가 없습니다.');
    const headers = Object.keys(rows[0]);
    if (headers.length === 0) throw new Error('출력할 열이 없습니다.');

    const data = [
        headers.map((header) => ({
            value: header,
            fontWeight: 'bold',
            backgroundColor: '#EAF2FF',
            borderColor: '#CBD5E1',
            borderStyle: 'thin'
        })),
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
