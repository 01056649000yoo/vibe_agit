import { AnimatePresence, motion } from 'framer-motion';

const MAX_DISPLAY_NAMES = 15;
const NAMES_PER_LINE = 5;

const formatNames = (names) => {
    const visibleNames = names.slice(0, MAX_DISPLAY_NAMES);
    const lines = [];
    for (let index = 0; index < visibleNames.length; index += NAMES_PER_LINE) {
        lines.push(visibleNames.slice(index, index + NAMES_PER_LINE).join(', '));
    }
    const extraCount = names.length - visibleNames.length;
    return `${lines.join(',\n')}${extraCount > 0 ? `\n외 ${extraCount}명` : ''}`;
};

const ReactionNamesTooltip = ({ open, names = [] }) => (
    <AnimatePresence>
        {open && names.length > 0 && (
            <motion.div
                initial={{ opacity: 0, y: 5, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 5, scale: 0.95 }}
                style={{
                    position: 'absolute', bottom: '100%', left: '20%', marginBottom: '10px',
                    padding: '10px 16px', borderRadius: '12px', zIndex: 9999,
                    background: '#2D3436', color: 'white', boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
                    fontSize: '0.8rem', fontWeight: 600, pointerEvents: 'none',
                    minWidth: 'max-content', maxWidth: '250px'
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ fontSize: '0.9rem' }}>👥</span>
                        <span style={{ color: '#BDC3C7', fontSize: '0.7rem' }}>반응을 보낸 친구들</span>
                    </div>
                    <div style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>
                        {formatNames(names)}
                    </div>
                </div>
                <div style={{ position: 'absolute', top: '100%', left: '20px', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #2D3436' }} />
            </motion.div>
        )}
    </AnimatePresence>
);

export default ReactionNamesTooltip;
