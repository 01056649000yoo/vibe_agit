/** ISBN 정규화 한 자리. 구글·국립중앙도서관 조회가 같은 규칙을 쓰도록 여기서만 만든다. */
export function normalizeIsbn(value) {
    const normalized = String(value ?? '').replace(/[^0-9X]/gi, '').toUpperCase()
    return normalized.length === 10 || normalized.length === 13 ? normalized : ''
}
