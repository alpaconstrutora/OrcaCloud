import React from 'react';
import { ChevronRight } from 'lucide-react';
import { usePersistedState } from '../ui/TableUtils';

/**
 * Seção recolhível que mora ACIMA da tabela (guia §6.14, pedido de 24/11/2026: "pare de colocar
 * coisas abaixo de tabelas — o usuário não vai ver nada no fim de tabela"). Recolhida, é uma
 * linha só: título + resumo com a contagem, à vista antes da primeira linha da tabela. Aberta,
 * mostra o conteúdo no lugar. A escolha fica guardada por seção (`chave`).
 */
export function SecaoRecolhivel({ chave, icone, titulo, resumo, acoes, children }: {
    chave: string;
    icone: React.ReactNode;
    titulo: string;
    resumo: React.ReactNode;
    /** Botões à direita do título (ex.: Recalcular) — fora do botão de abrir/fechar. */
    acoes?: React.ReactNode;
    children: React.ReactNode;
}) {
    const [aberta, setAberta] = usePersistedState<boolean>(`conciliacao:secao:${chave}:aberta`, false);
    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5">
                <button
                    type="button"
                    onClick={() => setAberta(!aberta)}
                    aria-expanded={aberta}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                >
                    <ChevronRight className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${aberta ? 'rotate-90' : ''}`} />
                    {icone}
                    <h3 className="text-sm font-semibold text-gray-900 shrink-0">{titulo}</h3>
                    <span className="text-sm text-gray-500 truncate">· {resumo}</span>
                </button>
                {acoes}
            </div>
            {aberta && <div className="border-t border-gray-100">{children}</div>}
        </div>
    );
}
