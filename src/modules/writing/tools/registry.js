import { spellingLookupToolManifest } from './spelling-lookup/manifest';
import { labResultsToolManifest } from './lab-results/manifest';
import { aiSpellCheckToolManifest } from './ai-spell-check/manifest';
import { spellingGrayToolManifest } from './spelling-gray/manifest';

const writingToolManifests = [
    spellingLookupToolManifest,
    labResultsToolManifest,
    aiSpellCheckToolManifest,
    spellingGrayToolManifest
];

export const getWritingToolManifests = () => [...writingToolManifests]
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
