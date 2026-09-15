import React from 'react';

/** `group`: nome do <optgroup> — usado quando a lista junta mais de uma organização
 *  (conta que "atende também" outras orgs), para cada item dizer de quem é. */
export type LazyOption = { value: string; label: string; group?: string };

/**
 * <select> que só materializa a lista completa de <option> ao ser aberto/focado.
 * Enquanto fechado, renderiza apenas a opção do valor atual — evitando que centenas
 * de cards × centenas de opções explodam o DOM e travem a thread principal
 * ("página sem resposta"). O comportamento visual é idêntico a um <select> comum.
 */
export const LazySelect: React.FC<{
    value: string;
    currentLabel?: string;
    options: LazyOption[];
    onChange: (value: string) => void;
    className?: string;
    placeholder?: string;
    title?: string;
}> = ({ value, currentLabel, options, onChange, className, placeholder = '', title }) => {
    const [revealed, setRevealed] = React.useState(false);
    const reveal = React.useCallback(() => setRevealed(true), []);
    return (
        <select
            value={value}
            title={title}
            onChange={(e) => { e.stopPropagation(); onChange(e.target.value); }}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={reveal}
            onMouseDown={reveal}
            onFocus={reveal}
            className={className}
        >
            <option value="">{placeholder}</option>
            {!revealed && value !== '' && (
                <option value={value}>{currentLabel || value}</option>
            )}
            {revealed && value !== '' && !options.some(o => o.value === value) && (
                <option value={value}>{currentLabel || value}</option>
            )}
            {revealed && (() => {
                const grupos = options.some(o => o.group)
                    ? [...new Set(options.map(o => o.group ?? ''))]
                    : null;
                if (!grupos) return options.map(o => <option key={o.value} value={o.value}>{o.label}</option>);
                return grupos.map(g => (
                    <optgroup key={g || '__sem_grupo'} label={g || '—'}>
                        {options.filter(o => (o.group ?? '') === g).map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </optgroup>
                ));
            })()}
        </select>
    );
};
