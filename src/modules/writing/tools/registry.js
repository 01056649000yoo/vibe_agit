import { spellingLookupToolManifest } from './spelling-lookup/manifest';

const writingToolManifests = [
    spellingLookupToolManifest
];

export const getWritingToolManifests = () => [...writingToolManifests]
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
