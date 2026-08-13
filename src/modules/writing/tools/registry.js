import { spellingLookupToolManifest } from './spelling-lookup/manifest';
import { labResultsToolManifest } from './lab-results/manifest';

const writingToolManifests = [
    spellingLookupToolManifest,
    labResultsToolManifest
];

export const getWritingToolManifests = () => [...writingToolManifests]
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
