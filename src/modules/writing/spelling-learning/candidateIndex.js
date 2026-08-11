const createNode = () => ({
    children: new Map(),
    failure: null,
    outputs: []
});

/**
 * 여러 고정 표현을 한 번의 본문 순회로 찾는 후보 색인.
 *
 * 라벨은 사람이 규칙을 찾고 묶는 이름표이고, 이 색인은 그 라벨에 연결된
 * 실제 검사 표현을 빠르게 고르는 장치다. 문맥 판정은 후보를 고른 뒤 각 규칙이 맡는다.
 */
export const createSpellingCandidateIndex = (items, getTrigger) => {
    const root = createNode();
    root.failure = root;
    const records = [];

    for (const [order, item] of (items || []).entries()) {
        const trigger = String(getTrigger(item) || '').normalize('NFC');
        if (!trigger) continue;

        const record = { item, trigger, order };
        records.push(record);
        let node = root;
        for (const character of trigger) {
            if (!node.children.has(character)) node.children.set(character, createNode());
            node = node.children.get(character);
        }
        node.outputs.push(record);
    }

    const queue = [];
    for (const child of root.children.values()) {
        child.failure = root;
        queue.push(child);
    }

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const node = queue.at(cursor);
        for (const [character, child] of node.children.entries()) {
            let fallback = node.failure;
            while (fallback !== root && !fallback.children.has(character)) {
                fallback = fallback.failure;
            }
            child.failure = fallback.children.get(character) || root;
            child.outputs.push(...child.failure.outputs);
            queue.push(child);
        }
    }

    return Object.freeze({ root, size: records.length });
};

/**
 * 본문에 실제로 등장한 검사 표현과 위치만 반환한다.
 * 결과는 원래 규칙 순서로 정렬해 기존 규칙 우선순위와 50개 상한 동작을 유지한다.
 */
export const collectSpellingCandidates = (value, index) => {
    const text = String(value || '').normalize('NFC');
    if (!text || !index?.root) return [];

    const startsByRecord = new Map();
    let node = index.root;
    let offset = 0;

    while (offset < text.length) {
        const character = String.fromCodePoint(text.codePointAt(offset));
        const nextOffset = offset + character.length;

        while (node !== index.root && !node.children.has(character)) {
            node = node.failure;
        }
        node = node.children.get(character) || index.root;

        for (const record of node.outputs) {
            const start = nextOffset - record.trigger.length;
            const starts = startsByRecord.get(record);
            if (starts) starts.push(start);
            else startsByRecord.set(record, [start]);
        }

        offset = nextOffset;
    }

    return [...startsByRecord.entries()]
        .sort(([left], [right]) => left.order - right.order)
        .map(([record, starts]) => ({
            item: record.item,
            trigger: record.trigger,
            starts
        }));
};
