export default function DesignPicker({ label, options, value, onChange, disabled, type = 'gallery' }) {
    return <fieldset className="class-agit-design-picker" disabled={disabled}><legend>{label}</legend>
        <div className="class-agit-design-options">{options.map((option) => <label key={option.id} className={`class-agit-design-option${value === option.id ? ' is-selected' : ''}`}>
            <input type="radio" name={label} value={option.id} checked={value === option.id} onChange={() => onChange(option.id)} />
            {type === 'gallery' ? <span className="class-agit-theme-swatch" aria-hidden="true" data-theme={option.id} style={{ '--swatch-wall': option.wall, '--swatch-floor': option.floor, '--swatch-accent': option.accent }}><i /><i /><i /></span>
                : <span className="class-agit-book-swatch" aria-hidden="true" data-design={option.id} style={{ background: option.paper, color: option.ink, '--book-accent': option.accent }}>{option.mark}</span>}
            <strong>{option.label}</strong><small>{option.description}</small>
        </label>)}</div>
    </fieldset>;
}
