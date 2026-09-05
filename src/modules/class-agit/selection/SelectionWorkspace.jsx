import { useState } from 'react';
import Button from '../../../components/common/Button.jsx';
import SourceBrowser from './SourceBrowser.jsx';
import OrderList from './OrderList.jsx';
import { addExhibitionSources, replaceDraftItems } from './model.js';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';

export default function SelectionWorkspace({ draft, savedRevision, dirty, api, onDraft, onReadSource, onWithdraw, onBusyChange }) {
    const [mode, setMode] = useState('find');
    return <div className="class-agit-selection-workspace">
        <div className="class-agit-selection-modes" role="group" aria-label="작품 선택 작업">
            <Button variant={mode === 'find' ? 'primary' : 'outline'} type="button" aria-pressed={mode === 'find'} onClick={() => setMode('find')}>작품 찾기</Button>
            <Button variant={mode === 'order' ? 'primary' : 'outline'} type="button" aria-pressed={mode === 'order'} onClick={() => setMode('order')}>담은 작품 정리 · {draft.items.length}/{limits.maxWorks}</Button>
        </div>
        <div hidden={mode !== 'find'}><SourceBrowser classId={draft.classId} api={api} items={draft.items} onAdd={(sources) => onDraft(addExhibitionSources(draft, sources))} onArrange={() => setMode('order')} onBusyChange={onBusyChange} /></div>
        <div hidden={mode !== 'order'}><OrderList items={draft.items} savedRevision={savedRevision} dirty={dirty} onChange={(items) => onDraft(replaceDraftItems(draft, items))} onRestore={(items) => onDraft({ ...draft, items, revision: draft.revision + 1 })} onFind={() => setMode('find')} onReadSource={onReadSource} onWithdraw={onWithdraw} /></div>
    </div>;
}
