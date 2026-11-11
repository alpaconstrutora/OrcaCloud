import React, { useEffect, useRef, useState } from 'react';

export interface ImovibInputRowProps {
    label: string;
    desc?: string;
    value: number;
    /** A cada tecla com número válido — atualiza o estado do pai (soma 100%, etc.). */
    onChange?: (valor: number) => void;
    /** Ao sair do campo — grava. */
    onCommit: (valor: number) => void;
    /** Texto depois do número, dentro do campo. */
    unidade?: string;
    step?: string;
    /** Explicação no `title` do campo (premissa com regra legal, padrão etc.). */
    title?: string;
}

/**
 * Linha "rótulo + campo numérico" das abas Receitas e Capital do Imovib. Saiu de
 * ImovibFundingForm na Fase 1 do plano 2026-11-11 (D7: a aba foi dividida).
 *
 * Fica no nível do MÓDULO de propósito (item 5.3 do plano 2026-10-12): declarada
 * dentro do render, cada tecla criava um componente novo, o React desmontava o
 * <input> e o foco caía. O texto digitado fica num rascunho local: no meio de
 * "12,5" o navegador entrega "" para um <input type="number"> (entrada
 * incompleta), e converter isso em 0 na hora fazia o React trocar o "12," por "0".
 */
const ImovibInputRow: React.FC<ImovibInputRowProps> = ({ label, desc, value, onChange, onCommit, unidade = '%', step = '0.01', title }) => {
    const [texto, setTexto] = useState<string>(String(value));
    const [editando, setEditando] = useState(false);
    // Valor de quando o campo ganhou o foco: sair sem mudar não grava. Comparar
    // com `value` não serve — o pai o atualiza a cada tecla (onChange).
    const valorAoFocar = useRef(value);

    // Só quando o VALOR muda por fora (recarga do estudo) e ninguém está digitando.
    // Reagir também à saída do campo (`editando` → false) punha de volta o valor
    // antigo do pai até a recarga chegar: o usuário via 0 e achava que não gravou.
    const editandoRef = useRef(false);
    editandoRef.current = editando;
    useEffect(() => {
        if (!editandoRef.current) setTexto(String(value));
    }, [value]);

    return (
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-[10px] border border-slate-100 hover:border-slate-300 transition-colors group">
            <div className="flex-1 pr-4">
                <span className="text-sm font-semibold text-slate-800 block mb-0.5">{label}</span>
                {desc && <span className="text-xs text-slate-500 block">{desc}</span>}
            </div>
            <div className="relative w-36 shrink-0">
                <input
                    type="number"
                    value={texto}
                    title={title}
                    onFocus={() => { valorAoFocar.current = value; setEditando(true); }}
                    onChange={(e) => {
                        setTexto(e.target.value);
                        const n = parseFloat(e.target.value);
                        if (!Number.isNaN(n)) onChange?.(n);
                    }}
                    onBlur={() => {
                        setEditando(false);
                        const n = parseFloat(texto) || 0;
                        setTexto(String(n));
                        onChange?.(n);
                        if (n !== valorAoFocar.current) onCommit(n);
                    }}
                    step={step}
                    aria-label={label}
                    className="w-full h-9 pr-14 pl-4 bg-white border border-slate-200 rounded-[6px] text-sm font-medium text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right transition-all"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400 pointer-events-none">{unidade}</span>
            </div>
        </div>
    );
};

export default ImovibInputRow;
