import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useStore } from '../../store/useStore';
import { useCargaVigente } from '../../hooks/useCargaVigente';
import {
    listarSemClassificacao, type LancamentoSemClassificacao, type MotivoSemClassificacao,
} from '../../services/semClassificacaoService';
import type { EscopoControladoria } from './escopo';
import { FalhaDeCarga } from './EstadosDaCarga';

// "Sem Classificação" vira aviso com caminho (PRODUCT.md, princípio 5: "todo número
// de análise leva à ação"). Antes era a última linha da DRE, em âmbar, com a
// orientação só num `title` — e na crítica de 14/11/2026 ela valia −R$ 7.619,
// MAIS que o próprio resultado (−R$ 5.021). Decisão do usuário (passo 3): aviso no
// topo + lista em gaveta, só leitura, com atalhos para onde se resolve.

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');

const MOTIVO: Record<MotivoSemClassificacao, { rotulo: string; comoResolver: string }> = {
    sem_categoria: {
        rotulo: 'Sem plano de contas',
        comoResolver: 'Defina o plano de contas no título de origem (Contas a Pagar, Boletos, lançamento manual).',
    },
    categoria_inexistente: {
        rotulo: 'Categoria que não existe no plano',
        comoResolver: 'O lançamento traz um nome de categoria que o plano de contas da organização não tem. Cadastre-a no Plano de Contas com o grupo da DRE, ou troque o plano de contas no título.',
    },
    categoria_sem_grupo: {
        rotulo: 'Categoria sem grupo da DRE',
        comoResolver: 'A categoria existe no Plano de Contas, mas sem grupo da DRE. Defina o grupo nela e todos os lançamentos dela entram no resultado.',
    },
};

/** Aviso + gaveta. Some quando não há nada sem classificação no recorte. */
export const AvisoSemClassificacao: React.FC<{
    organizationId: string | null;
    escopo: EscopoControladoria;
    /** Valor da linha "Sem Classificação" no realizado do relatório (com sinal). */
    realizado: number;
    /** Idem, no previsto (pendente). */
    previsto?: number;
}> = ({ organizationId, escopo, realizado, previsto = 0 }) => {
    const [aberto, setAberto] = React.useState(false);
    if (realizado === 0 && previsto === 0) return null;

    const frase = realizado !== 0
        ? <><strong className="font-semibold">{brl(realizado)}</strong> do realizado {previsto !== 0 && <>(e {brl(previsto)} do previsto) </>}estão em lançamentos sem classificação e ficaram fora do resultado.</>
        : <><strong className="font-semibold">{brl(previsto)}</strong> do previsto estão em lançamentos sem classificação e ficarão fora do resultado.</>;

    return (
        <>
            <div role="status" className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-2 bg-amber-50 border border-amber-200 rounded-[10px] px-4 py-3 mb-3">
                <p className="flex items-start gap-2 text-sm text-amber-900 flex-1 min-w-0">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
                    <span>{frase}</span>
                </p>
                <button
                    type="button"
                    onClick={() => setAberto(true)}
                    className="shrink-0 h-9 px-3.5 rounded-[6px] bg-white border border-amber-300 text-amber-900 text-[13px] font-medium hover:bg-amber-100 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                >
                    Ver os lançamentos
                </button>
            </div>
            {aberto && (
                <GavetaSemClassificacao organizationId={organizationId} escopo={escopo} onClose={() => setAberto(false)} />
            )}
        </>
    );
};

const GavetaSemClassificacao: React.FC<{
    organizationId: string | null;
    escopo: EscopoControladoria;
    onClose: () => void;
}> = ({ organizationId, escopo, onClose }) => {
    const setActiveView = useStore(s => s.setActiveView);
    const setManagementTab = useStore(s => s.setManagementTab);
    const [itens, setItens] = React.useState<LancamentoSemClassificacao[] | null>(null);
    const [falhou, setFalhou] = React.useState(false);
    const [tentativa, setTentativa] = React.useState(0);
    const novaCarga = useCargaVigente();
    const { de, ate, regime, obraId } = escopo;

    React.useEffect(() => {
        const vigente = novaCarga();
        setItens(null);
        setFalhou(false);
        listarSemClassificacao({ organizationId, de, ate, regime, obraId: obraId || undefined })
            .then(r => { if (vigente()) setItens(r); })
            .catch(e => { if (vigente()) { setFalhou(true); console.error('[Sem classificação]', e); } });
    }, [novaCarga, organizationId, de, ate, regime, obraId, tentativa]);

    const porMotivo = React.useMemo(() => {
        const m = new Map<MotivoSemClassificacao, { n: number; categorias: Set<string> }>();
        for (const i of itens ?? []) {
            const g = m.get(i.motivo) ?? { n: 0, categorias: new Set<string>() };
            g.n++;
            if (i.categoria) g.categorias.add(i.categoria);
            m.set(i.motivo, g);
        }
        return m;
    }, [itens]);
    const totalRealizado = (itens ?? []).filter(i => i.realizado).reduce((s, i) => s + i.valor, 0);

    const irPara = (onde: 'plano' | 'pagar') => {
        onClose();
        if (onde === 'plano') { setManagementTab('plano_contas'); setActiveView('organization'); }
        else setActiveView('contas-a-pagar');
    };

    return (
        <Sheet open onClose={onClose} size="2xl">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Lançamentos sem classificação</SheetTitle>
                <SheetDescription>
                    {dataBR(de)} a {dataBR(ate)} · {regime === 'CAIXA' ? 'Caixa' : 'Competência'}.
                    {' '}Ficam fora do resultado da DRE até terem um plano de contas com grupo da DRE.
                </SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-5">
                {falhou ? (
                    <FalhaDeCarga oQue="os lançamentos sem classificação" onRetry={() => setTentativa(t => t + 1)} />
                ) : itens === null ? (
                    <div className="py-12 text-center text-sm text-gray-600" role="status">Carregando lançamentos…</div>
                ) : itens.length === 0 ? (
                    <div className="py-12 text-center text-sm text-gray-600">
                        Nenhum lançamento sem classificação neste recorte.
                    </div>
                ) : (
                    <>
                        {/* Por que cada grupo ficou de fora e o que fazer — o motivo decide a tela. */}
                        <ul className="space-y-3">
                            {(Object.keys(MOTIVO) as MotivoSemClassificacao[]).filter(k => porMotivo.has(k)).map(k => {
                                const g = porMotivo.get(k)!;
                                const nomes = [...g.categorias].slice(0, 4).map(n => `“${n}”`).join(', ');
                                return (
                                    <li key={k} className="text-sm text-gray-700">
                                        <span className="font-semibold text-gray-900">{MOTIVO[k].rotulo}</span>
                                        {' '}· {g.n} {g.n === 1 ? 'lançamento' : 'lançamentos'}
                                        {nomes && <> ({nomes}{g.categorias.size > 4 ? '…' : ''})</>}
                                        <span className="block text-gray-600 mt-0.5">{MOTIVO[k].comoResolver}</span>
                                    </li>
                                );
                            })}
                        </ul>

                        <div className="overflow-x-auto rounded-[10px] border border-gray-100">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                                        <th className="px-3 py-2 border-r border-gray-100">Data</th>
                                        {/* Origem e categoria na 2ª linha: na gaveta (2xl) seis colunas
                                            empurravam Valor para fora da vista. */}
                                        <th className="px-4 py-2 border-r border-gray-100">Lançamento</th>
                                        <th className="px-3 py-2 border-r border-gray-100 text-right">Valor</th>
                                        <th className="px-3 py-2">Situação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {itens.map(i => (
                                        <tr key={i.chave}>
                                            <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">{dataBR(i.data)}</td>
                                            <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 max-w-0 w-full">
                                                <span className="block truncate" title={i.descricao}>{i.descricao}</span>
                                                <span className="block truncate text-xs text-gray-600" title={`${i.origem} · ${i.categoria ?? 'sem plano de contas'}`}>
                                                    {i.origem} · {i.categoria ? `“${i.categoria}”` : 'sem plano de contas'}
                                                </span>
                                            </td>
                                            <td className={`px-3 py-2.5 border-r border-gray-100 text-sm font-medium text-right tabular-nums whitespace-nowrap ${i.valor < 0 ? 'text-red-700' : 'text-gray-800'}`}>{brl(i.valor)}</td>
                                            <td className={`px-3 py-2.5 text-sm font-normal whitespace-nowrap ${i.status === 'CONCILIATED' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                                {i.status === 'CONCILIATED' ? 'Conciliado' : 'Pendente'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-sm text-gray-600">
                            {itens.length} {itens.length === 1 ? 'lançamento' : 'lançamentos'}
                            {' '}· no realizado: <span className="font-medium text-gray-800 tabular-nums">{brl(totalRealizado)}</span>
                            {regime === 'CAIXA' && ' (Caixa conta só o conciliado; os pendentes estão no previsto)'}.
                        </p>
                    </>
                )}
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={() => irPara('plano')}
                    className="h-9 px-3.5 rounded-[6px] bg-white border border-gray-200 text-gray-700 text-[13px] font-medium hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    Abrir Plano de Contas
                </button>
                <button type="button" onClick={() => irPara('pagar')}
                    className="h-9 px-3.5 rounded-[6px] bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                    Abrir Contas a Pagar
                </button>
            </SheetFooter>
        </Sheet>
    );
};
