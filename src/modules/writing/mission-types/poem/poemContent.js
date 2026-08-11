export const normalizePoemStanzas = (structuredContent, content = '') => {
    const source = Array.isArray(structuredContent?.stanzas)
        ? structuredContent.stanzas
        : String(content || '').split(/\n\s*\n/);
    return source
        .map((stanza) => String(stanza || '').replace(/\r\n?/g, '\n').trim())
        .filter(Boolean);
};
