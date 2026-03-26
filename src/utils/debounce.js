/**
 * 역할: 특정 시간 동안 호출이 반복되면 마지막 호출만 실행하는 디바운스 함수 ⏱️
 * @param {Function} func 실행할 함수
 * @param {number} wait 대기 시간 (ms)
 * @returns {Function} 디바운스된 함수
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
