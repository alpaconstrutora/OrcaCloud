/**
 * Harness: prova visual do seletor Crescente/Decrescente ao lado do "Agrupar"
 * (docs/planos/2026-10-21-receber-agrupar-ordem-dos-grupos.md).
 *
 * As peças são as de PRODUÇÃO, sem mock — `useAgrupamento`, `AgruparControles`,
 * `LinhaDeGrupo` e `agruparRecebiveis`, ligadas como em ContasReceberManager.tsx.
 * Só as linhas são fabricadas.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import { useAgrupamento } from '../../../hooks/useAgrupamento';
import { AgruparControles, LinhaDeGrupo } from '../../../components/ui/Agrupamento';
import { agruparRecebiveis, OPCOES_AGRUPAR_RECEBIVEL, type CampoAgruparRecebivel, type LinhaAgrupavel } from '../../../utils/recebivelGrupos';
import { entradasDaPagina } from '../../../utils/agruparLinhas';
import { formatMoney } from '../../../components/ui/Format';

const STATUS_LABEL: Record<string, string> = {
    PREVISTO: 'Previsto', EMITIDO: 'Emitido', ENVIADO: 'Enviado', RECEBIDO: 'Recebido',
    PARCIAL: 'Parcial', VENCIDO: 'Vencido', RENEGOCIADO: 'Renegociado', CANCELADO: 'Cancelado',
};

type Linha = LinhaAgrupavel & { id: string; description: string };
const l = (id: string, party_name: string | undefined, effective_status: string, due_date: string, amount: number): Linha =>
    ({ id, description: `Parcela ${id}`, party_name, effective_status, due_date, amount } as Linha);

const LINHAS: Linha[] = [
    l('01', 'Maria Souza', 'PREVISTO', '2026-11-10', 1200),
    l('02', 'Bruno Lima', 'RECEBIDO', '2026-09-10', 850),
    l('03', 'Ângela Prado', 'VENCIDO', '2026-08-10', 430),
    l('04', 'Maria Souza', 'RECEBIDO', '2026-10-10', 1200),
    l('05', undefined, 'PREVISTO', '2026-12-10', 300),
    l('06', 'Construtora Zeta', 'PREVISTO', '2026-11-25', 9800),
    l('07', 'Bruno Lima', 'VENCIDO', '2026-08-25', 850),
];

function Harness() {
    const agrupamento = useAgrupamento<Exclude<CampoAgruparRecebivel, 'none'>>('harnessReceberOrdem:groupBy');
    const { campo, direcao, agrupando, recolhidos } = agrupamento;
    const grupos = agruparRecebiveis(LINHAS, campo, STATUS_LABEL, direcao);
    const entradas = entradasDaPagina(grupos, agrupando ? recolhidos : new Set<string>());

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-2 border-b border-gray-100 bg-white">
                <div className="flex flex-col md:flex-row gap-2.5 items-center" data-toolbar>
                    <input placeholder="Buscar…" className="flex-1 w-full h-9 pl-3 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium" />
                    <AgruparControles
                        opcoes={OPCOES_AGRUPAR_RECEBIVEL}
                        campo={campo}
                        onCampo={agrupamento.setCampo}
                        direcao={direcao}
                        onDirecao={agrupamento.setDirecao}
                        chavesDosGrupos={grupos.map(g => g.key)}
                        algumRecolhido={recolhidos.size > 0}
                        onAlternarTodos={agrupamento.alternarTodos}
                        title="Agrupar os títulos"
                    />
                </div>
            </div>
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                        <th className="px-6 py-2 border-r border-gray-100">Descrição</th>
                        <th className="px-6 py-2 border-r border-gray-100">Cliente / Parte</th>
                        <th className="px-6 py-2 border-r border-gray-100">Status</th>
                        <th className="px-6 py-2 border-r border-gray-100">Vencimento</th>
                        <th className="px-6 py-2">Valor</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {entradas.map(e => {
                        if (e.tipo === 'grupo') {
                            if (!agrupando) return null;
                            return <LinhaDeGrupo key={`g-${e.grupo.key}`} grupo={e.grupo} recolhido={e.recolhido} continua={e.continua} colSpan={5} onAlternar={agrupamento.alternar} />;
                        }
                        const r = e.item;
                        return (
                            <tr key={r.id}>
                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-gray-700">{r.description}</td>
                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-gray-700">{r.party_name ?? '—'}</td>
                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-gray-700">{STATUS_LABEL[r.effective_status]}</td>
                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm text-gray-700">{r.due_date}</td>
                                <td className="px-6 py-2.5 text-sm font-medium text-gray-800">{formatMoney(r.amount)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
