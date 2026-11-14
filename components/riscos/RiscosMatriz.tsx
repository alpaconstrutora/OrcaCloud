import React from 'react';
import { Grid2x2, ShieldAlert, X } from 'lucide-react';
import type { ProjectRisk, RiskMatrixConfig } from '../../types/risk';
import { RISK_ROTULO } from '../../types/risk';
import { COR_CELULA_NIVEL, COR_TEXTO_NIVEL, nivelDaPontuacao, riscoAtivo } from '../../utils/riskScoring';
import { nivelNaOrg } from '../../utils/riskPainel';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { usePersistedState } from '../ui/TableUtils';
import { MatrizCalor } from './MatrizCalor';
import { NivelTexto, ROTULO_PROBABILIDADE } from './riscosUi';

/**
 * Aba Matriz (F1.9): mapa de calor 5×5 dos riscos ATIVOS, inerente ou residual,
 * pintado pelas faixas da organização (`COR_CELULA_NIVEL`). Clicar numa célula
 * recorta a lista abaixo; clicar de novo tira o recorte.
 *
 * Risco com gatilho crítico fica na célula da PONTUAÇÃO dele (o mapa é posição), e
 * a lista mostra o nível já escalado para crítico — a nota abaixo do mapa diz isso.
 */
type Leitura = 'inerente' | 'residual';

const COLUNAS: StandardTableColumn[] = [
    { key: 'codigo', label: 'Código', sortable: true, width: 100 },
    { key: 'titulo', label: 'Título', sortable: true, width: 320 },
    { key: 'escopo', label: 'Escopo / obra', sortable: true, width: 220 },
    { key: 'pi', label: 'P × I', sortable: true, width: 110, align: 'right' },
    { key: 'nivel', label: 'Nível', sortable: true, width: 150 },
    { key: 'dono', label: 'Dono', sortable: true, width: 170 },
];

interface Props {
    riscos: ProjectRisk[];
    carregando: boolean;
    /** Faixas que pintam as CÉLULAS: as da organização do topo; em "Todas", as padrão. */
    faixasDoMapa: RiskMatrixConfig;
    faixasPorOrg: Record<string, RiskMatrixConfig>;
    emTodas: boolean;
    rotuloEscopo: (r: ProjectRisk) => string;
    onAbrir: (r: ProjectRisk) => void;
}

export const RiscosMatriz: React.FC<Props> = ({ riscos, carregando, faixasDoMapa, faixasPorOrg, emTodas, rotuloEscopo, onAbrir }) => {
    const [leitura, setLeitura] = usePersistedState<Leitura>('riscos:matriz:leitura', 'inerente');
    const [celula, setCelula] = React.useState<{ probabilidade: number; impacto: number } | null>(null);

    const pi = React.useCallback((r: ProjectRisk) => leitura === 'inerente'
        ? { p: r.inerente_probabilidade, i: r.inerente_impacto }
        : { p: r.residual_probabilidade, i: r.residual_impacto }, [leitura]);

    const ativos = React.useMemo(() => riscos.filter(riscoAtivo), [riscos]);
    const avaliados = React.useMemo(() => ativos.filter(r => { const x = pi(r); return x.p != null && x.i != null; }), [ativos, pi]);
    const contagem = React.useMemo(() => {
        const m = new Map<string, number>();
        for (const r of avaliados) { const x = pi(r); const k = `${x.p}-${x.i}`; m.set(k, (m.get(k) ?? 0) + 1); }
        return m;
    }, [avaliados, pi]);
    const linhas = React.useMemo(() => (celula
        ? avaliados.filter(r => { const x = pi(r); return x.p === celula.probabilidade && x.i === celula.impacto; })
        : avaliados), [avaliados, celula, pi]);
    const semLeitura = ativos.length - avaliados.length;
    const comGatilho = avaliados.filter(r => r.gatilho_critico).length;

    const f = faixasDoMapa;
    const faixaTexto = [
        { n: 'baixo' as const, de: 1, ate: f.limite_medio - 1 },
        { n: 'medio' as const, de: f.limite_medio, ate: f.limite_alto - 1 },
        { n: 'alto' as const, de: f.limite_alto, ate: f.limite_critico - 1 },
        { n: 'critico' as const, de: f.limite_critico, ate: 25 },
    ];

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Mapa de calor · riscos ativos</h2>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {avaliados.length} de {ativos.length} ativos têm avaliação {leitura}.
                            {semLeitura > 0 && ` ${semLeitura} ainda sem avaliação ${leitura} não aparecem no mapa.`}
                        </p>
                    </div>
                    {/* Alternador do §19.1 (trilho bg-gray-50 p-1, botões h-7). */}
                    <div className="flex items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1" role="group" aria-label="Leitura do mapa">
                        {(['inerente', 'residual'] as Leitura[]).map(l => (
                            <button key={l} type="button" aria-pressed={leitura === l} onClick={() => { setLeitura(l); setCelula(null); }}
                                className={`px-3 h-7 rounded-[6px] text-sm font-medium transition-all ${leitura === l ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}>
                                {l === 'inerente' ? 'Inerente' : 'Residual'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="max-w-2xl">
                    <MatrizCalor
                        tamanho="amplo"
                        ariaLabel={`Mapa de calor da avaliação ${leitura}: probabilidade nas colunas, impacto nas linhas`}
                        contagem={(p, i) => contagem.get(`${p}-${i}`) ?? 0}
                        corDaCelula={(p, i, n) => `${COR_CELULA_NIVEL[nivelDaPontuacao(p * i, f)]} ${n ? 'text-gray-900' : 'text-gray-400'}`}
                        tituloDaCelula={(p, i, n) => `Probabilidade ${p} (${ROTULO_PROBABILIDADE[p]}) × impacto ${i} = ${p * i}, ${RISK_ROTULO.nivel[nivelDaPontuacao(p * i, f)].toLowerCase()}: ${n} risco${n === 1 ? '' : 's'}${n ? '. Clique para ver.' : ''}`}
                        rotuloImpacto={i => <>Impacto {i}</>}
                        rotuloProbabilidade={p => <span title={ROTULO_PROBABILIDADE[p]}>{p}</span>}
                        onSelecionar={(p, i) => setCelula(c => (c?.probabilidade === p && c?.impacto === i ? null : { probabilidade: p, impacto: i }))}
                        selecionada={celula}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {faixaTexto.map(x => (
                        <span key={x.n} className="inline-flex items-center gap-1.5">
                            <span className={`w-3 h-3 rounded-[2px] border border-gray-200 ${COR_CELULA_NIVEL[x.n]}`} aria-hidden="true" />
                            <span className={COR_TEXTO_NIVEL[x.n]}>{RISK_ROTULO.nivel[x.n]}</span>
                            <span className="text-gray-500">{x.de}–{x.ate}</span>
                        </span>
                    ))}
                </div>
                {emTodas && <p className="text-xs text-gray-500">Em "Todas as organizações", as células usam as faixas padrão; o nível de cada risco na lista usa as faixas da organização dele.</p>}
                {comGatilho > 0 && <p className="text-xs text-red-700">{comGatilho} risco{comGatilho === 1 ? '' : 's'} no mapa {comGatilho === 1 ? 'tem' : 'têm'} gatilho crítico: na lista {comGatilho === 1 ? 'aparece' : 'aparecem'} como crítico qualquer que seja a célula.</p>}
            </div>

            <section className="space-y-3" aria-labelledby="matriz-lista">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 id="matriz-lista" className="text-base font-semibold text-gray-900">
                        {celula ? `Probabilidade ${celula.probabilidade} × impacto ${celula.impacto}` : 'Todos os riscos do mapa'}
                        <span className="font-normal text-gray-500"> · {linhas.length} risco{linhas.length === 1 ? '' : 's'}</span>
                    </h2>
                    {celula && (
                        <button type="button" onClick={() => setCelula(null)} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                            <X className="w-3.5 h-3.5" /> Ver todos
                        </button>
                    )}
                </div>
                <StandardTable<ProjectRisk>
                    storageKey="riscos:matriz:lista"
                    columns={COLUNAS}
                    rows={linhas}
                    rowKey={r => r.id}
                    loading={carregando}
                    searchText={r => `${r.codigo} ${r.titulo} ${rotuloEscopo(r)} ${r.owner_nome ?? ''}`}
                    searchPlaceholder="Buscar nos riscos do mapa..."
                    defaultSort={{ column: 'pi', direction: 'desc' }}
                    onRowClick={onAbrir}
                    rowLabel={r => `${r.codigo}: ${r.titulo}. Abrir a ficha`}
                    sortValue={(k, r) => { const x = pi(r); return k === 'codigo' ? r.numero : k === 'pi' ? (x.p ?? 0) * (x.i ?? 0) : k === 'escopo' ? rotuloEscopo(r) : k === 'dono' ? r.owner_nome ?? '' : k === 'nivel' ? (x.p ?? 0) * (x.i ?? 0) + (r.gatilho_critico ? 100 : 0) : r.titulo; }}
                    renderCell={(k, r) => {
                        const x = pi(r);
                        switch (k) {
                            case 'codigo': return <span className="text-sm font-normal text-gray-600">{r.codigo}</span>;
                            case 'titulo': return <span className="block truncate text-sm font-normal text-gray-700" title={r.titulo}>{r.titulo}</span>;
                            case 'escopo': { const t = rotuloEscopo(r); return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{t}</span>; }
                            case 'pi': return <span className="text-sm font-normal text-gray-600">{x.p} × {x.i} = {(x.p ?? 0) * (x.i ?? 0)}</span>;
                            case 'nivel': return <NivelTexto nivel={nivelNaOrg(r, faixasPorOrg)} gatilho={r.gatilho_critico} />;
                            case 'dono': return <span className="block truncate text-sm font-normal text-gray-700" title={r.owner_nome ?? undefined}>{r.owner_nome || '—'}</span>;
                            default: return null;
                        }
                    }}
                    empty={{
                        icon: celula ? <Grid2x2 className="w-12 h-12 text-gray-300 mx-auto mb-4" /> : <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                        title: celula ? 'Nenhum risco nesta célula' : `Nenhum risco ativo com avaliação ${leitura}`,
                        subtitle: celula ? 'Escolha outra célula ou clique em "Ver todos".' : 'Registre a avaliação na ficha do risco, aba Avaliações.',
                    }}
                />
            </section>
        </div>
    );
};

export default RiscosMatriz;
