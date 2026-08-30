import './PreparationRoadmap.css';

const PreparationRoadmap = ({ headingId, roadmap, tone = 'indigo' }) => (
    <section
        className={`preparation-roadmap preparation-roadmap--${tone}`}
        aria-labelledby={headingId}
    >
        <div className="preparation-roadmap__heading">
            <span className="preparation-roadmap__eyebrow">{roadmap.eyebrow}</span>
            <h2 id={headingId}>{roadmap.title}</h2>
        </div>
        <ol className="preparation-roadmap__items">
            {roadmap.items.map((item, index) => (
                <li key={item.title} className="preparation-roadmap__item">
                    <span className="preparation-roadmap__step" aria-hidden="true">{index + 1}</span>
                    <div>
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                    </div>
                </li>
            ))}
        </ol>
        <p className="preparation-roadmap__note">
            <span aria-hidden="true">🔒</span>
            {roadmap.note}
        </p>
    </section>
);

export default PreparationRoadmap;
