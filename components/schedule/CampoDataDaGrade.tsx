import React from 'react';

/**
 * Data editável dentro da grade do Planejamento (Tabela e Gantt).
 *
 * 21/11/2026 — *"Padronizar fonte. Exemplo data de inicio e data de termino com tamanhos
 * diferentes."* O `<input type="date">` nativo desenhava "01/08/2026" + ícone em 14px, ao lado
 * do Término em texto 12px ("27/11/26"), e cortava o ano na coluna de 86px. Aqui a célula
 * mostra a data como TEXTO, no mesmo tamanho e formato das outras células, e o campo nativo
 * fica por cima, sempre invisível: o clique abre o calendário (`showPicker`); com foco (teclado),
 * a célula ganha o contorno azul e as setas/dígitos mudam a data, que o texto acompanha.
 */
export default function CampoDataDaGrade({ value, texto, onChange, className = '', title = 'Alterar data' }: {
    /** `YYYY-MM-DD` (o que o `<input type="date">` entende). */
    value: string;
    /** A data já formatada, como as outras células da mesma grade a mostram. */
    texto: string;
    onChange: (valor: string) => void;
    className?: string;
    title?: string;
}) {
    return (
        <div className={`relative w-full rounded focus-within:ring-1 focus-within:ring-blue-300 ${className}`}>
            <span className="block text-center text-xs font-medium text-gray-600 rounded px-1 py-0.5 hover:bg-blue-50">{texto || '-'}</span>
            <input
                type="date"
                aria-label={title}
                title={title}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onClick={(e) => {
                    try { e.currentTarget.showPicker?.(); } catch { /* sem gesto válido: segue digitando */ }
                }}
                className="absolute inset-0 w-full h-full cursor-pointer opacity-0 border-none text-xs outline-none"
            />
        </div>
    );
}
