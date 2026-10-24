import React from 'react';
import { HandCoins, Search } from 'lucide-react';
import {
    CardHeader, PortalCard, PortalEmpty, PortalTabs, StatusPill, Td, TextLinkButton, Th, fmtBRLCents, fmtDate, type PillTone,
} from '../portal/PortalKit';
import { usePersistedState } from '../ui/TableUtils';
import { origemLabel } from '../../utils/origemLabel';
import { rotuloDeDespesa, rotuloDeFornecedor } from '../../utils/despesaCondominio';
import {
    ROTULO_SITUACAO, motivoNaoAltera, motivoNaoBaixa, motivoNaoDesfazBaixa, motivoNaoRecebe, situacaoDoTitulo,
    type SituacaoDoTitulo, type TituloDoCondominio,
} from '../../utils/financeiroDoSindico';
import type { DocumentoDoTitulo } from '../../services/sindicoPortalService';

/**
 * Portal do Síndico › Financeiro — a tabela de títulos (a pagar OU a receber).
 * Plano: docs/planos/2026-10-24-portal-sindico-financeiro.md
 *
 * Desenho do Parceiro › Financeiro (`components/partner/PartnerPortalFinanceiro.tsx`,
 * PortalKit §24): abas de filtro por situação com contagem, pílula de status.
 * As ações da linha (Pagar · Editar · Cancelar) só existem em Contas a pagar;
 * desligadas, o motivo vem no `title` do invólucro — o do botão desligado não
 * aparece em todo navegador.
 */

const PILL: Record<SituacaoDoTitulo, PillTone> = { PAGO: 'good', VENCIDO: 'accent', EM_ABERTO: 'neutral', CANCELADO: 'muted' };

const FILTROS = [
    { id: 'todos', label: 'Todos', fn: (_s: SituacaoDoTitulo) => true },
    { id: 'abertos', label: 'Em aberto', fn: (s: SituacaoDoTitulo) => s === 'EM_ABERTO' || s === 'VENCIDO' },
    { id: 'vencidos', label: 'Vencidos', fn: (s: SituacaoDoTitulo) => s === 'VENCIDO' },
    { id: 'pagos', label: 'Pagos', fn: (s: SituacaoDoTitulo) => s === 'PAGO' },
    { id: 'cancelados', label: 'Cancelados', fn: (s: SituacaoDoTitulo) => s === 'CANCELADO' },
] as const;
type FiltroId = typeof FILTROS[number]['id'];

export interface AcoesDaTabela {
    /** Motivo de nada poder ser gravado neste condomínio (prévia, link sem login, sem org própria). */
    motivoDoCondominio: (condominioId: string) => string | null;
    /** Pagar (a pagar) ou receber (a receber) — o painel decide pelo sentido do título. */
    onBaixar: (t: TituloDoCondominio) => void;
    /** Desfazer a baixa (G2a). */
    onDesfazer: (t: TituloDoCondominio) => void;
    /** Só a pagar (lançamento manual). */
    onEditar?: (t: TituloDoCondominio) => void;
    onCancelar?: (t: TituloDoCondominio) => void;
}

interface Props {
    tipo: 'pagar' | 'receber';
    titulos: TituloDoCondominio[];
    hoje: string;
    competenciaRotulo: string;
    documentos: Record<string, DocumentoDoTitulo>;
    /** Nome do condomínio por id — a coluna só aparece com mais de um. */
    nomeDoCondominio: Map<string, string>;
    abrindoDocumento: string | null;
    onAbrirDocumento: (t: TituloDoCondominio) => void;
    acoes?: AcoesDaTabela;
    direita?: React.ReactNode;
}

const Acao: React.FC<{ motivo: string | null; onClick: () => void; children: React.ReactNode }> = ({ motivo, onClick, children }) => (
    <span title={motivo ?? undefined} className={motivo ? 'cursor-not-allowed' : undefined}>
        <TextLinkButton onClick={onClick} disabled={!!motivo} className={motivo ? 'pointer-events-none text-gray-300 disabled:opacity-100' : ''}>
            {children}
        </TextLinkButton>
    </span>
);

const TabelaTitulosDoSindico: React.FC<Props> = ({
    tipo, titulos, hoje, competenciaRotulo, documentos, nomeDoCondominio, abrindoDocumento, onAbrirDocumento, acoes, direita,
}) => {
    const [filtro, setFiltro] = React.useState<FiltroId>('todos');
    const [busca, setBusca] = usePersistedState<string>(`sindicoPortal:financeiro:${tipo}:busca`, '');
    const multi = nomeDoCondominio.size > 1;

    // Vencimento crescente (a RPC já ordena; aqui garante para quem filtra/costura).
    const linhas = React.useMemo(() => [...titulos].sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map(t => ({
        t,
        situacao: situacaoDoTitulo(t, hoje),
        descricao: rotuloDeDespesa(t.descricao, t.credor) ?? (tipo === 'pagar' ? 'Despesa sem descrição' : 'Receita sem descrição'),
        credor: rotuloDeFornecedor(t.credor, null) ?? '—',
    })), [titulos, hoje, tipo]);

    const termo = busca.trim().toLowerCase();
    const buscadas = termo
        ? linhas.filter(l => [l.descricao, l.credor, origemLabel(l.t.origem), documentos[l.t.id]?.codigo ?? '', documentos[l.t.id]?.nome ?? '']
            .some(v => v.toLowerCase().includes(termo)))
        : linhas;
    const ativo = FILTROS.find(f => f.id === filtro) ?? FILTROS[0];
    const visiveis = buscadas.filter(l => ativo.fn(l.situacao));
    const total = visiveis.reduce((s, l) => s + (Number(l.t.valor) || 0), 0);
    const colunas = 6 + (multi ? 1 : 0) + (acoes ? 1 : 0);

    return (
        <PortalCard className="overflow-hidden">
            <CardHeader
                title={tipo === 'pagar' ? 'Contas a pagar' : 'Contas a receber'}
                subtitle={`Vencendo ou pagas em ${competenciaRotulo}, mais as em atraso de antes`}
                right={direita}
            />
            <div className="px-5 pb-3">
                <div className="relative max-w-sm">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="search"
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        placeholder={tipo === 'pagar' ? 'Buscar por descrição, credor, documento…' : 'Buscar por descrição, pagador…'}
                        aria-label="Buscar"
                        className="w-full h-9 pl-9 pr-3 bg-white border border-[#ECECEF] rounded-[8px] text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E1553C]/20 focus:border-[#E1553C]"
                    />
                </div>
            </div>
            <PortalTabs
                tabs={FILTROS.map(f => ({ id: f.id, label: f.label, count: buscadas.filter(l => f.fn(l.situacao)).length }))}
                active={filtro}
                onChange={id => setFiltro(id as FiltroId)}
            />
            <div className="overflow-x-auto">
                <table className="w-full min-w-[860px]">
                    <thead>
                        <tr className="border-b border-[#ECECEF]">
                            <Th>Vencimento</Th>
                            <Th>Descrição</Th>
                            <Th>{tipo === 'pagar' ? 'Credor' : 'Pagador'}</Th>
                            {multi && <Th>Condomínio</Th>}
                            <Th>Documento</Th>
                            <Th className="text-right">Valor</Th>
                            <Th>Situação</Th>
                            {acoes && <Th>Ações</Th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F4F4F6]">
                        {visiveis.length === 0 ? (
                            <tr>
                                <td colSpan={colunas}>
                                    <PortalEmpty
                                        icon={<HandCoins className="w-9 h-9" />}
                                        title={linhas.length === 0
                                            ? (tipo === 'pagar' ? `Nenhuma conta a pagar em ${competenciaRotulo}` : `Nenhuma conta a receber em ${competenciaRotulo}`)
                                            : termo ? 'Nenhum resultado' : 'Nenhuma conta neste filtro'}
                                        subtitle={linhas.length === 0 && tipo === 'receber'
                                            ? 'As cotas aparecem aqui quando a cobrança do rateio é emitida.'
                                            : termo ? 'Tente ajustar a busca.' : undefined}
                                    />
                                </td>
                            </tr>
                        ) : visiveis.map(({ t, situacao, descricao, credor }) => {
                            const doc = documentos[t.id];
                            const geral = acoes?.motivoDoCondominio(t.condominioId) ?? null;
                            return (
                                <tr key={t.id} className="hover:bg-gray-50/70 transition-colors">
                                    <Td className="text-[#8A8F9A] whitespace-nowrap">{fmtDate(t.vencimento)}</Td>
                                    <Td className="text-[#1F2430] max-w-[280px]">
                                        <span className="block truncate" title={descricao}>{descricao}</span>
                                        <span className="block text-[11px] text-gray-400 truncate">
                                            {[origemLabel(t.origem), doc?.codigo ? `nº ${doc.codigo}` : null, t.lancadoPeloSindico ? 'lançado por você' : null]
                                                .filter(Boolean).join(' · ')}
                                        </span>
                                    </Td>
                                    <Td className="max-w-[220px]"><span className="block truncate" title={credor}>{credor}</span></Td>
                                    {multi && <Td className="text-[#8A8F9A] whitespace-nowrap">{nomeDoCondominio.get(t.condominioId) ?? '—'}</Td>}
                                    <Td className="max-w-[180px]">
                                        {!doc?.nome ? <span className="text-[#8A8F9A]">—</span>
                                            : abrindoDocumento === t.id ? <span className="text-[#8A8F9A]">Abrindo…</span>
                                                : (
                                                    <TextLinkButton onClick={() => onAbrirDocumento(t)} title={`Abrir ${doc.nome}`} className="max-w-full">
                                                        <span className="truncate">{doc.nome}</span>
                                                    </TextLinkButton>
                                                )}
                                    </Td>
                                    <Td className="text-right text-[#1F2430] font-medium tabular-nums whitespace-nowrap">{fmtBRLCents(Number(t.valor) || 0)}</Td>
                                    <Td className="whitespace-nowrap">
                                        <StatusPill tone={PILL[situacao]}>{ROTULO_SITUACAO[situacao]}</StatusPill>
                                        {situacao === 'PAGO' && t.pagoEm && <span className="block text-[11px] text-gray-400 mt-0.5">em {fmtDate(t.pagoEm)}</span>}
                                    </Td>
                                    {acoes && (
                                        <Td className="whitespace-nowrap">
                                            <span className="inline-flex items-center gap-3">
                                                {/* Com baixa, o lugar de "Pagar/Receber" vira "Desfazer" (G2a). */}
                                                {situacao === 'PAGO'
                                                    ? <Acao motivo={geral ?? motivoNaoDesfazBaixa(t)} onClick={() => acoes.onDesfazer(t)}>Desfazer</Acao>
                                                    : <Acao motivo={geral ?? (tipo === 'receber' ? motivoNaoRecebe(t) : motivoNaoBaixa(t))} onClick={() => acoes.onBaixar(t)}>
                                                        {tipo === 'receber' ? 'Receber' : 'Pagar'}
                                                    </Acao>}
                                                {acoes.onEditar && <Acao motivo={geral ?? motivoNaoAltera(t)} onClick={() => acoes.onEditar?.(t)}>Editar</Acao>}
                                                {acoes.onCancelar && <Acao motivo={geral ?? motivoNaoAltera(t)} onClick={() => acoes.onCancelar?.(t)}>Cancelar</Acao>}
                                            </span>
                                        </Td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                    {visiveis.length > 0 && (
                        <tfoot>
                            <tr className="border-t border-[#ECECEF] bg-gray-50/60">
                                <Td colSpan={4 + (multi ? 1 : 0)} className="text-[#8A8F9A]">
                                    {visiveis.length} {visiveis.length === 1 ? 'conta' : 'contas'}
                                </Td>
                                <Td className="text-right text-[#1F2430] font-semibold tabular-nums whitespace-nowrap">{fmtBRLCents(total)}</Td>
                                <Td colSpan={1 + (acoes ? 1 : 0)}>{null}</Td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </PortalCard>
    );
};

export default TabelaTitulosDoSindico;
