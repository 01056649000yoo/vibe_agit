import Button from '../../../components/common/Button.jsx';
import SourceBrowser from '../selection/SourceBrowser.jsx';
import { CLASS_AGIT_LIMITS as limits } from '../policy.js';

export default function SourcePicker({ classId, api, items, onAdd, onClose }) {
    return <section className="class-agit-book-picker"><header><h2>수록할 글 찾기</h2><Button variant="outline" type="button" onClick={onClose}>찾기 닫기</Button></header>
        <SourceBrowser classId={classId} api={api} items={items} maximum={limits.anthologyWorks} scope="학급 문집" onAdd={onAdd} />
    </section>;
}
