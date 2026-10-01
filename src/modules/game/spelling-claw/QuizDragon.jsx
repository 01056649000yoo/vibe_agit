import DragonAvatar from '../dragon/DragonAvatar';
import { getDragonStage } from '../dragon/presentation';
import './quizDragon.css';

/**
 * 문제를 내는 수호룡. **학생이 키운 수호룡**(종류·작가 단계)을 그대로 보여 주므로, 수호룡이 자라면
 * 문제를 내는 수호룡도 함께 자란다. 그림·이름은 수호룡 모듈(getDragonStage) 한 곳에서 정한다.
 */
const QuizDragon = ({ speciesId, writerLevel = 1, readerLevel = 1, line, compact = false }) => {
    const dragon = getDragonStage(writerLevel, speciesId);
    return <div className={`quiz-dragon${compact ? ' is-compact' : ''}`}>
        <DragonAvatar dragon={dragon} readerLevel={readerLevel} alt={`${dragon.species.shortName} ${dragon.name}`} className="quiz-dragon__avatar" eager />
        <div className="quiz-dragon__talk">
            <small>{dragon.species.shortName} · {dragon.name}</small>
            {line && <p role="status">{line}</p>}
        </div>
    </div>;
};

export default QuizDragon;
