import React from 'react';

/**
 * Interruptor de coluna booleana em tabela.
 *
 * Escala: 36×20px com bolinha de 16px (`w-9 h-5` / `after:h-4 after:w-4`) — a
 * mesma altura visual do texto da linha (§7), para o switch não crescer mais
 * que o dado ao lado. Era o desenho da coluna "Portal do Cliente" em
 * `ClientList.tsx`; virou componente em 2026-09-23, quando o usuário apontou
 * que os switches da Tabela de Preços (44×24, copiados antes do ajuste de
 * escala) estavam fora do padrão. Terceira cópia não nasce à mão: use este.
 *
 * `onLabel`/`offLabel` são opcionais — sem eles fica só o interruptor, para
 * coluna cujo cabeçalho já diz o que ele liga.
 */
const TableSwitch: React.FC<{
    checked: boolean;
    onChange: () => void;
    onLabel?: string;
    offLabel?: string;
    /** Cor do estado ligado; o padrão é o azul de ação do app. */
    onColor?: string;
    title?: string;
    disabled?: boolean;
}> = ({ checked, onChange, onLabel, offLabel, onColor = 'peer-checked:bg-blue-600', title, disabled }) => (
    <label
        className={`inline-flex items-center gap-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        title={title}
        onClick={(e) => e.stopPropagation()}
    >
        <input type="checkbox" className="sr-only peer" checked={checked} onChange={onChange} disabled={disabled} />
        <div className={`w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all relative ${onColor}`}></div>
        {(onLabel || offLabel) && (
            <span className={`text-sm font-normal ${checked ? 'text-gray-700' : 'text-gray-400'}`}>
                {checked ? onLabel : offLabel}
            </span>
        )}
    </label>
);

export default TableSwitch;
