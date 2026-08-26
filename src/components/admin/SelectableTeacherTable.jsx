import React from 'react';
import { EmptyState, tableStyle, tdLeftStyle, tdStyle, theadRowStyle, thLeftStyle, thStyle } from './adminUsageUi';

/**
 * 체크박스로 여러 선생님을 고를 수 있는 표.
 * 장기 미접속 탭과 정리 탭이 같은 조작감을 갖도록 하나의 표를 공유한다.
 *
 * columns: [{ key, label, align, render(row) }]
 */
const SelectableTeacherTable = ({ rows, columns, selectedIds, onToggle, onToggleAll, emptyMessage }) => {
    if (!rows.length) {
        return <EmptyState>{emptyMessage}</EmptyState>;
    }

    const allSelected = rows.every(row => selectedIds.includes(row.teacher_id));

    return (
        <div style={{ maxHeight: '68vh', overflow: 'auto', scrollbarGutter: 'stable' }}>
            <table style={tableStyle}>
                <thead>
                    <tr style={theadRowStyle}>
                        <th style={{ ...thStyle, position: 'sticky', top: 0, zIndex: 2, width: '48px' }}>
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={() => onToggleAll(!allSelected)}
                                title={allSelected ? '전체 선택 해제' : '전체 선택'}
                            />
                        </th>
                        <th style={{ ...thLeftStyle, position: 'sticky', top: 0, zIndex: 2 }}>선생님</th>
                        {columns.map(column => (
                            <th key={column.key} style={{ ...(column.align === 'left' ? thLeftStyle : thStyle), position: 'sticky', top: 0, zIndex: 2 }}>
                                {column.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const isSelected = selectedIds.includes(row.teacher_id);
                        return (
                            <tr
                                key={row.teacher_id}
                                style={{
                                    borderBottom: '1px solid #F1F3F5',
                                    background: isSelected ? '#EBF8FF' : 'white'
                                }}
                            >
                                <td style={{ ...tdStyle, width: '48px' }}>
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => onToggle(row.teacher_id)}
                                    />
                                </td>
                                <td style={tdLeftStyle}>
                                    <div
                                        lang="ko"
                                        translate="no"
                                        className="notranslate"
                                        style={{ fontWeight: 'bold', color: '#2C3E50' }}
                                    >
                                        {row.display_name}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#A0AEC0', marginTop: '3px' }}>
                                        {row.school_name || '학교 정보 없음'} · {row.email}
                                    </div>
                                </td>
                                {columns.map(column => (
                                    <td key={column.key} style={column.align === 'left' ? tdLeftStyle : tdStyle}>
                                        {column.render(row)}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default SelectableTeacherTable;
