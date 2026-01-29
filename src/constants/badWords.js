export const BAD_WORDS = [
    "시발", "씨발", "병신", "개새끼", "지랄", "존나", "졸라", "미친",
    "fucking", "fuck", "shibal", "ssibal", "바보", "멍청이", "닥쳐",
    "꺼져", "죽어", "놈", "년", "쓰레기"
];

export const checkBadWords = (text) => {
    if (!text) return false;
    return BAD_WORDS.some(word => text.includes(word));
};
