import React from 'react';
import { BadgeCheck } from 'lucide-react';
import type { ProjectRisk, RiskMatrixConfig } from '../../types/risk';
import { exigeAprovacao } from '../../utils/riskFase2';
import {
    faixasDe, nivelNaOrg, nivelPendenteDaAlcada, riscosParaAprovacao, ROTULO_SITUACAO_ALCADA, type SituacaoNaFila,
} from '../../utils/riskPainel';
import { pontuacaoVigente } from '../../utils/riskScoring';
import { FilterPopover } from '../ui/FilterPopover';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { usePersistedState } from '../ui/TableUtils';
import { NivelTexto } from './riscosUi';
import type { SecaoFicha } from './RiscoFicha';

/**
 * Aba Aprovações (F2.3): a fila do módulo — riscos aguardando aprovação e os que EXIGEM
 * aprovação e ainda não foram enviados (ou foram reprovados). Decisão de desenho do plano:
 * risco tem fila própria aqui; a fila geral (`fn_approval_action_queue`) fica para depois.
 * UI_PATTERNS §3: "revisar fila de aprovações = lista + lateral" — o clique abre a ficha,
 * onde estão o motivo, a cadeia e os botões.
 */
type Linha = { risco: ProjectRisk; situacao: SituacaoNaFila };

const COR_SITUACAO: Record<SituacaoNaFila, string> = {
    pendente: 'text-amber-700', falta_enviar: 'text-orange-700', reprovado: 'text-red-700',
};
const ORDEM_SITUACAO: Record<SituacaoNaFila, number> = { pendente: 0, reprovado: 1, falta_enviar: 2 };

const COLUNAS: StandardTableColumn[] = [
    { key: 'codigo', label: 'Código', sortable: true, width: 100 },
    { key: 'titulo', label: 'Título', sortable: true, width: 280 },
    { key: 'escopo', label: 'Escopo / obra', sortable: true, width: 220 },
    { key: 'nivel', label: 'Nível', sortable: true, width: 140 },
    { key: 'situacao', label: 'Situação', sortable: true, width: 230 },
    { key: 'motivo', label: 'Por que exige', sortable: true, width: 280 },
    { key: 'dono', label: 'Dono', sortable: true, width: 170 },
];

interface Props {
    riscos: ProjectRisk[];
    faixasPorOrg: Record<string, RiskMatrixConfig>;
    carregando: boolean;
    rotuloEscopo: (r: ProjectRisk) => string;
    onAbrir: (r: ProjectRisk, secao?: SecaoFicha) => void;
}

/** "Aguardando aprovação · nível 1 de 2" — o texto que a célula mostra (e que a busca procura). */
export function textoDaSituacao(l: Linha): string {
    if (l.situacao !== 'pendente') return ROTULO_SITUACAO_ALCADA[l.situacao];
    const { nivel, de } = nivelPendenteDaAlcada(l.risco);
    return `${ROTULO_SITUACAO_ALCADA.pendente} · nível ${nivel} de ${de}`;
}

const motivoCurto = (r: ProjectRisk, faixas: RiskMatrixConfig) =>
    (exigeAprovacao(r, faixas).motivo ?? '').replace(/^Exige aprovação: /, '').replace(/\.$/, '');

export const RiscosAprovacoesAba: React.FC<Props> = ({ riscos, faixasPorOrg, carregando, rotuloEscopo, onAbrir }) => {
    const [filtro, setFiltro] = usePersistedState<'' | SituacaoNaFila>('riscos:aprovacoes:situacao', '');
    const fila = React.useMemo(() => riscosParaAprovacao(riscos, faixasPorOrg), [riscos, faixasPorOrg]);
    const linhas = React.useMemo(() => (filtro ? fila.filter(l => l.situacao === filtro) : fila), [fila, filtro]);
    const motivo = React.useCallback((r: ProjectRisk) => motivoCurto(r, faixasDe(faixasPorOrg, r.organization_id)), [faixasPorOrg]);

    return (
        <StandardTable<Linha>
            storageKey="riscos:aprovacoes:tabela"
            columns={COLUNAS}
            rows={linhas}
            rowKey={l => l.risco.id}
            loading={carregando}
            pagination={{ defaultPageSize: 100 }}
            searchText={l => `${l.risco.codigo} ${l.risco.titulo} ${rotuloEscopo(l.risco)} ${l.risco.owner_nome ?? ''} ${textoDaSituacao(l)} ${motivo(l.risco)}`}
            searchPlaceholder="Buscar por código, título, obra, dono ou situação..."
            defaultSort={{ column: 'situacao', direction: 'asc' }}
            filters={
                <FilterPopover<'' | SituacaoNaFila> label="Situação" value={filtro} onChange={setFiltro}
                    options={[{ value: '', label: 'Todas' }, ...(Object.keys(ROTULO_SITUACAO_ALCADA) as SituacaoNaFila[]).map(s => ({ value: s, label: ROTULO_SITUACAO_ALCADA[s] }))]} />
            }
            sortValue={(k, l) => {
                const r = l.risco;
                switch (k) {
                    case 'codigo': return r.numero;
                    case 'escopo': return rotuloEscopo(r);
                    case 'nivel': return (r.gatilho_critico ? 100 : 0) + (pontuacaoVigente(r) ?? -1);
                    case 'situacao': return ORDEM_SITUACAO[l.situacao] * 1000 + r.numero;
                    case 'motivo': return motivo(r);
                    case 'dono': return r.owner_nome ?? '';
                    default: return r.titulo;
                }
            }}
            onRowClick={l => onAbrir(l.risco, 'ficha')}
            rowLabel={l => `${l.risco.codigo}: ${l.risco.titulo}. ${textoDaSituacao(l)}. Abrir a ficha`}
            renderCell={(k, l) => {
                const r = l.risco;
                switch (k) {
                    case 'codigo': return <span className="whitespace-nowrap text-sm font-normal text-gray-600">{r.codigo}</span>;
                    case 'titulo': return <span className="block truncate text-sm font-normal text-gray-700" title={r.titulo}>{r.titulo}</span>;
                    case 'escopo': { const t = rotuloEscopo(r); return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{t}</span>; }
                    case 'nivel': return <NivelTexto nivel={nivelNaOrg(r, faixasPorOrg)} gatilho={r.gatilho_critico} />;
                    case 'situacao': { const t = textoDaSituacao(l); return <span className={`block truncate text-sm font-normal ${COR_SITUACAO[l.situacao]}`} title={t}>{t}</span>; }
                    case 'motivo': { const t = motivo(r); return <span className="block truncate text-sm font-normal text-gray-700" title={t}>{t || '—'}</span>; }
                    case 'dono': return <span className="block truncate text-sm font-normal text-gray-700" title={r.owner_nome ?? undefined}>{r.owner_nome || '—'}</span>;
                    default: return null;
                }
            }}
            // Sem coluna "Ações" de propósito (§9.1): a única ação é abrir a ficha, onde se envia,
            // aprova ou reprova — e o clique na linha já faz isso.
            empty={fila.length === 0
                ? { icon: <BadgeCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nada para aprovar', subtitle: 'Risco com estratégia "aceitar" ou crítico (gatilho ou pontuação) aparece aqui até ser aprovado.' }
                : { icon: <BadgeCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum risco nesta situação', subtitle: 'Troque o filtro de situação ou mude a busca.' }}
        />
    );
};

export default RiscosAprovacoesAba;
