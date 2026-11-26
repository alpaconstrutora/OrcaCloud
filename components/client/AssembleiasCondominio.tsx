// components/client/AssembleiasCondominio.tsx
// Portal do Cliente › Condomínio › sub-aba "Assembleias" (Task A8).
// Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md (R2, R3, R5, R9,
// "Desenho › Telas › Portal do Cliente").
//
// O que esta tela faz: lista as assembleias convocadas, instaladas e encerradas dos
// condomínios do cliente; aberta uma, mostra os dados, o link, a pauta e UMA CÉDULA
// POR UNIDADE em que ele é proprietário (R2). Encerrada: o resultado de cada item, o
// voto da unidade e "Baixar ata".
//
// Regras que moram aqui (testadas em __tests__/condominioPortalCliente.test.ts e
// __tests__/components/assembleiasCondominioPortal.test.tsx):
//   • Botão desligado SEMPRE diz o motivo, em texto visível: encerrada → "Votação
//     encerrada."; sem sessão (link sem login, gestor espiando) → "Entre com e-mail e
//     senha para votar."; impedida → o texto do banco (R3). O banco recusa do mesmo
//     jeito — a tela só não deixa a pessoa descobrir clicando.
//   • Trocar um voto já dado pede confirmação (R5: vale o último até o encerramento).
//   • Percentual do resultado é sobre o TOTAL DA ASSEMBLEIA (soma das frações de todas
//     as unidades participantes, inclusive ausentes e impedidas — R8), o mesmo
//     denominador da ata: `percentualDoTotal(fracao, total)` da A5.
//
// ⚠️ Vocabulário coral (§24), como o resto da aba — ver o cabeçalho de CondominioTab.tsx.
// Este arquivo NÃO importa CondominioTab (ele é quem importa este).
import React from 'react';
import { Gavel, ChevronLeft, ChevronRight, ExternalLink, Download, Info, Check } from 'lucide-react';
import type {
    PortalAssembleia, PortalItemAssembleia, PortalUnidadeAssembleia, PortalVotoAssembleia,
} from '../../services/clientPortalService';
import type { ApuracaoItem, OpcaoVoto, OrigemVoto, ResultadoItem } from '../../services/condominioAssembleiaService';
import {
    ROTULO_TIPO, ROTULO_STATUS, ROTULO_QUORUM, ROTULO_RESULTADO, rotuloOpcao, dataHoraBrasilia, percentualDoTotal,
} from '../../utils/assembleiaTextos';
import { ChoiceButton, SoftButton, PortalLoading } from '../portal/PortalKit';
import { useConfirm } from '../ui/confirm';

// ─── regras puras ────────────────────────────────────────────────────────────

/** O motivo do banco vem com inicial maiúscula ("Cota de 10/2026 vencida em …");
 *  depois de dois-pontos, no meio da frase, vai em minúscula. */
const minusculaInicial = (t: string) => (t ? t.charAt(0).toLocaleLowerCase('pt-BR') + t.slice(1) : t);

/** Por que a cédula desta unidade não aceita voto agora — ou null se aceita.
 *  `podeGravar` = a tela tem quem grave (falso na prévia do gestor, sem `onVotar`).
 *  A prévia vem ANTES da sessão: o gestor espiando também tem `sessaoValida=false`,
 *  e "Entre com e-mail e senha" seria o motivo errado para ele. */
export function motivoDaCedulaDesligada(
    a: PortalAssembleia, u: PortalUnidadeAssembleia, podeGravar: boolean,
): string | null {
    if (a.status === 'ENCERRADA') return 'Votação encerrada.';
    if (!podeGravar) return 'Prévia do portal: o voto é dado pelo condômino.';
    if (!a.sessaoValida) return 'Entre com e-mail e senha para votar.';
    if (u.impedida) return `Unidade impedida de votar: ${minusculaInicial(u.impedida.replace(/\.$/, ''))}.`;
    return null;
}

/** As opções da cédula (R8): aprovação = Sim/Não/Abstenção; escolha = as cadastradas + Abstenção. */
export function opcoesDaCedula(item: PortalItemAssembleia): OpcaoVoto[] {
    return item.tipo === 'APROVACAO'
        ? ['SIM', 'NAO', 'ABSTENCAO']
        : [...(item.opcoes ?? []), 'ABSTENCAO'];
}

/** O voto recém-gravado aplicado no estado local (§22) — sem mutar o anterior. */
export function aplicarVotoLocal(
    assembleias: PortalAssembleia[], itemId: string, unitId: string, voto: PortalVotoAssembleia,
): PortalAssembleia[] {
    return assembleias.map(a => (!a.itens.some(i => i.id === itemId) ? a : {
        ...a,
        minhasUnidades: a.minhasUnidades.map(u => (u.unitId !== unitId ? u : {
            ...u, votos: { ...u.votos, [itemId]: voto },
        })),
    }));
}

export interface LinhaResultado {
    opcao: OpcaoVoto;
    rotulo: string;
    unidades: number;
    /** % do TOTAL da assembleia (R8, como na ata); '—' se o total não veio. */
    percentual: string;
}

/** Uma linha por opção da cédula, na ordem da cédula. Denominador = `total` da
 *  assembleia (soma das frações de TODAS as participantes, inclusive ausentes e
 *  impedidas) — o mesmo da ata. Sem total (> 0), '—': nunca um número inventado. */
export function linhasDoResultado(r: ApuracaoItem, total: number, item?: PortalItemAssembleia): LinhaResultado[] {
    const ordem = item ? opcoesDaCedula(item) : [];
    const extras = Object.keys(r.porOpcao).filter(op => !ordem.includes(op));
    return [...ordem, ...extras].map(op => {
        const soma = r.porOpcao[op] ?? { fracao: 0, unidades: 0 };
        return {
            opcao: op,
            rotulo: rotuloOpcao(op),
            unidades: soma.unidades,
            percentual: total > 0 ? percentualDoTotal(soma.fracao, total) : '—',
        };
    });
}

// ─── rótulos da tela ─────────────────────────────────────────────────────────

/** "votado em <data> (portal|na reunião)" — texto do plano para a cédula. */
const ORIGEM_NA_CEDULA: Record<OrigemVoto, string> = { PORTAL: 'portal', PRESENCIAL: 'na reunião' };
const votadoEm = (v: PortalVotoAssembleia) => `votado em ${dataHoraBrasilia(v.votadoEm)} (${ORIGEM_NA_CEDULA[v.origem] ?? v.origem})`;

/** §8 — status em texto colorido, sem pílula. */
const COR_STATUS: Record<PortalAssembleia['status'], string> = {
    CONVOCADA: 'text-blue-600',
    INSTALADA: 'text-emerald-600',
    ENCERRADA: 'text-gray-600',
};
const DICA_STATUS: Record<PortalAssembleia['status'], string> = {
    CONVOCADA: 'votação aberta',
    INSTALADA: 'reunião em andamento, votação aberta',
    ENCERRADA: 'votação encerrada',
};

const COR_RESULTADO: Record<ResultadoItem, string> = {
    APROVADO: 'text-emerald-600',
    REJEITADO: 'text-red-600',
    QUORUM_NAO_ATINGIDO: 'text-amber-600',
    SEM_DECISAO: 'text-gray-600',
};

const quando = (iso: string | null) => (iso ? dataHoraBrasilia(iso) : 'a definir');
const unidadesTxt = (n: number) => (n === 1 ? '1 unidade' : `${n} unidades`);

// ─── peças ───────────────────────────────────────────────────────────────────

const Descricao: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="flex items-center gap-2 text-sm text-gray-500 mb-5">
        <span className="text-[#E1553C]"><Gavel className="w-4 h-4" /></span>
        {children}
    </p>
);

const Campo: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
    <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-500">{rotulo}</p>
        <p className="text-sm text-gray-900 break-words">{children}</p>
    </div>
);

const TituloSecao: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-3">{children}</h3>
);

/** Motivo visível de um botão desligado (nunca só no `title`). */
const Motivo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="flex items-start gap-1.5 text-sm text-gray-700">
        <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
        <span>{children}</span>
    </p>
);

type Votar = (itemId: string, unitId: string, opcao: OpcaoVoto) => Promise<void>;

/** Cédula de UMA unidade (R2): todos os itens da pauta, cada um com as opções. */
const Cedula: React.FC<{ assembleia: PortalAssembleia; unidade: PortalUnidadeAssembleia; onVotar?: Votar }> = ({ assembleia, unidade, onVotar }) => {
    const confirm = useConfirm();
    const [gravando, setGravando] = React.useState<string | null>(null);
    const [erro, setErro] = React.useState<string | null>(null);
    const motivo = motivoDaCedulaDesligada(assembleia, unidade, !!onVotar);
    const rotulo = unidade.rotulo || 'sem identificação';

    const votar = async (item: PortalItemAssembleia, opcao: OpcaoVoto) => {
        if (motivo || !onVotar || gravando) return;
        const atual = unidade.votos[item.id];
        if (atual?.opcao === opcao) return;
        if (atual) {
            const ok = await confirm({
                title: 'Trocar o voto?',
                message: `A unidade ${rotulo} votou "${rotuloOpcao(atual.opcao)}" em "${item.titulo}" (${votadoEm(atual)}). `
                    + `Trocar para "${rotuloOpcao(opcao)}"? Vale o último voto registrado até o encerramento da assembleia.`,
                variant: 'warning',
                confirmLabel: 'Trocar voto',
            });
            if (!ok) return;
        }
        setErro(null);
        setGravando(item.id);
        try {
            await onVotar(item.id, unidade.unitId, opcao);
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível registrar o voto.');
        } finally {
            setGravando(null);
        }
    };

    const desligado = !!motivo || !!gravando;

    return (
        <div data-tour="condominio-assembleia-cedula" data-testid={`cedula-${unidade.unitId}`} className="rounded-[10px] border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h4 className="text-base font-bold text-gray-900">Unidade {rotulo}</h4>
            </div>
            {motivo && <Motivo>{motivo}</Motivo>}
            {!motivo && gravando && <Motivo>Registrando o voto...</Motivo>}

            <div className="space-y-4">
                {[...assembleia.itens].sort((x, y) => x.ordem - y.ordem).map(item => {
                    const voto = unidade.votos[item.id];
                    return (
                        <div key={item.id} role="group" aria-label={item.titulo} data-testid={`item-${item.id}`} className="space-y-1.5">
                            <p className="text-sm font-medium text-gray-900">{item.ordem}. {item.titulo}</p>
                            <div className="flex flex-wrap gap-2">
                                {opcoesDaCedula(item).map(op => (
                                    <ChoiceButton
                                        key={op}
                                        selected={voto?.opcao === op}
                                        disabled={desligado}
                                        title={motivo ?? undefined}
                                        onClick={() => votar(item, op)}
                                    >
                                        {voto?.opcao === op && <Check className="w-3.5 h-3.5" />}
                                        {rotuloOpcao(op)}
                                    </ChoiceButton>
                                ))}
                            </div>
                            <p className="text-sm text-gray-600">{voto ? votadoEm(voto) : 'sem voto registrado'}</p>
                        </div>
                    );
                })}
            </div>

            {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
    );
};

/** Resultado de um item (R9) — só na encerrada. */
const ResultadoDoItem: React.FC<{ r: ApuracaoItem; total: number; item?: PortalItemAssembleia }> = ({ r, total, item }) => {
    const titulo = r.tipo === 'ESCOLHA' && r.vencedora ? `Vencedora: ${r.vencedora}` : ROTULO_RESULTADO[r.resultado];
    return (
        <div data-tour="condominio-assembleia-resultado" data-testid={`resultado-${r.itemId}`} className="mt-2 rounded-[10px] bg-gray-50/60 border border-gray-100 p-3 space-y-1.5">
            <p className={`text-sm font-semibold ${COR_RESULTADO[r.resultado] ?? 'text-gray-600'}`}>{titulo}</p>
            <ul className="space-y-0.5">
                {linhasDoResultado(r, total, item).map(l => (
                    <li key={l.opcao} className="text-sm text-gray-700">
                        {l.rotulo}: {unidadesTxt(l.unidades)} · {l.percentual}
                    </li>
                ))}
            </ul>
        </div>
    );
};

/** Abre a ata pelo MESMO resolvedor dos Documentos do condomínio. A aba nasce no
 *  clique (window.open depois de await é bloqueado como pop-up). */
const BaixarAta: React.FC<{ ataId: string | null; onResolverDocumento?: (id: string) => Promise<string> }> = ({ ataId, onResolverDocumento }) => {
    const [abrindo, setAbrindo] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const motivo = !ataId
        ? 'A ata ainda não foi publicada.'
        : !onResolverDocumento ? 'A ata abre pelo portal do condômino.' : null;

    const abrir = async () => {
        if (!ataId || !onResolverDocumento) return;
        setErro(null);
        setAbrindo(true);
        const janela = window.open('', '_blank');
        try {
            const url = await onResolverDocumento(ataId);
            if (janela) janela.location.href = url;
            else window.open(url, '_blank', 'noopener');
        } catch (e: any) {
            janela?.close();
            setErro(e?.message || 'Não foi possível abrir a ata.');
        } finally {
            setAbrindo(false);
        }
    };

    return (
        <div data-tour="condominio-assembleia-ata" className="flex flex-col items-end gap-1.5">
            <SoftButton onClick={abrir} disabled={!!motivo || abrindo} title={motivo ?? undefined}>
                <Download className="w-4 h-4" />
                {abrindo ? 'Abrindo...' : 'Baixar ata'}
            </SoftButton>
            {motivo && <p className="text-sm text-gray-600">{motivo}</p>}
            {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
    );
};

const DetalheDaAssembleia: React.FC<{
    a: PortalAssembleia;
    multi: boolean;
    onVoltar: () => void;
    onVotar?: Votar;
    onResolverDocumento?: (id: string) => Promise<string>;
}> = ({ a, multi, onVoltar, onVotar, onResolverDocumento }) => {
    const itens = [...a.itens].sort((x, y) => x.ordem - y.ordem);
    const resultadoDe = (id: string) => a.resultado?.find(r => r.itemId === id);

    return (
        <div className="space-y-8">
            <div className="space-y-4">
                <button type="button" onClick={onVoltar} className="inline-flex items-center gap-1 text-[13px] font-medium text-[#C24428] hover:text-[#E1553C]">
                    <ChevronLeft className="w-4 h-4" /> Assembleias
                </button>
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-gray-900">{a.titulo}</h3>
                        <p className="text-sm mt-0.5">
                            <span className={COR_STATUS[a.status]}>{ROTULO_STATUS[a.status]}</span>
                            <span className="text-gray-500"> · {DICA_STATUS[a.status]}{multi ? ` · ${a.condominioNome}` : ''}</span>
                        </p>
                    </div>
                    {a.status === 'ENCERRADA' && <BaixarAta ataId={a.ataDocumentoId} onResolverDocumento={onResolverDocumento} />}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    <Campo rotulo="Tipo">{ROTULO_TIPO[a.tipo] ?? a.tipo}</Campo>
                    <Campo rotulo="Local">{a.local || '—'}</Campo>
                    <Campo rotulo="1ª convocação">{quando(a.primeiraConvocacaoEm)}</Campo>
                    <Campo rotulo="2ª convocação">{quando(a.segundaConvocacaoEm)}</Campo>
                    {a.linkTransmissao && (
                        <div className="space-y-1.5 sm:col-span-2">
                            <p className="text-xs font-semibold text-slate-500">Link de transmissão</p>
                            <a href={a.linkTransmissao} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-[#C24428] hover:text-[#E1553C] break-all">
                                {a.linkTransmissao} <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            </a>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <TituloSecao>{a.status === 'ENCERRADA' ? 'Pauta e resultado' : 'Pauta'}</TituloSecao>
                <ol className="space-y-4">
                    {itens.map(item => {
                        const r = resultadoDe(item.id);
                        return (
                            <li key={item.id}>
                                <p className="text-sm font-semibold text-gray-900">{item.ordem}. {item.titulo}</p>
                                {item.descricao && <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-line">{item.descricao}</p>}
                                <p className="text-sm text-gray-500 mt-0.5">Quórum: {ROTULO_QUORUM[item.quorum] ?? item.quorum}</p>
                                {r && <ResultadoDoItem r={r} total={a.total} item={item} />}
                            </li>
                        );
                    })}
                </ol>
                {a.status === 'ENCERRADA' && a.resultado && (
                    <p className="text-sm text-gray-500">
                        Percentual sobre o total das frações ideais das unidades participantes (inclusive ausentes e impedidas), como na ata. O voto de cada unidade está na ata.
                    </p>
                )}
            </div>

            <div className="space-y-4">
                <TituloSecao>{a.minhasUnidades.length > 1 ? 'Suas cédulas' : 'Sua cédula'}</TituloSecao>
                {a.minhasUnidades.length === 0 ? (
                    <Motivo>
                        Você não consta como proprietário de nenhuma unidade desta assembleia: só o proprietário vota pela unidade.
                    </Motivo>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {a.minhasUnidades.map(u => (
                            <Cedula key={u.unitId} assembleia={a} unidade={u} onVotar={onVotar} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── painel ──────────────────────────────────────────────────────────────────

export const PainelAssembleias: React.FC<{
    assembleias: PortalAssembleia[];
    multi: boolean;
    /** Grava o voto pela sessão. Sem ele (prévia) a cédula fica desligada, dizendo por quê. */
    onVotar?: Votar;
    /** O mesmo resolvedor dos Documentos do condomínio — a ata é um deles. */
    onResolverDocumento?: (documentoId: string) => Promise<string>;
    /** A RPC das assembleias ainda não respondeu: sem isto, a aba diria
     *  "Nenhuma assembleia convocada" a quem tem assembleia. */
    carregando?: boolean;
}> = ({ assembleias, multi, onVotar, onResolverDocumento, carregando = false }) => {
    const [abertaId, setAbertaId] = React.useState<string | null>(null);
    // Derivada da lista: depois do voto o pai troca o array e o detalhe acompanha.
    const aberta = abertaId ? assembleias.find(a => a.id === abertaId) ?? null : null;

    if (aberta) {
        return (
            <DetalheDaAssembleia
                a={aberta}
                multi={multi}
                onVoltar={() => setAbertaId(null)}
                onVotar={onVotar}
                onResolverDocumento={onResolverDocumento}
            />
        );
    }

    return (
        <div>
            <Descricao>Assembleias do condomínio: pauta, voto pelo portal e resultado</Descricao>
            {carregando && assembleias.length === 0 ? (
                <PortalLoading label="Carregando assembleias..." />
            ) : assembleias.length === 0 ? (
                <div className="text-center py-12">
                    <span className="inline-block text-gray-300 mb-4"><Gavel className="w-12 h-12" /></span>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma assembleia convocada</h3>
                    <p className="text-sm text-gray-500 max-w-md mx-auto">
                        Quando a administração convocar uma assembleia, a pauta e a cédula aparecem aqui.
                    </p>
                </div>
            ) : (
                <div data-tour="condominio-assembleias-lista" className="space-y-2">
                    {assembleias.map(a => (
                        <button
                            key={a.id}
                            type="button"
                            data-tour="condominio-assembleia"
                            onClick={() => setAbertaId(a.id)}
                            className="w-full text-left flex items-center justify-between gap-3 rounded-[10px] border border-gray-100 p-4 hover:border-[#F3D9D1] hover:bg-[#FDEDE8]/40 transition-all"
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{a.titulo}</p>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    {ROTULO_TIPO[a.tipo] ?? a.tipo} · {quando(a.primeiraConvocacaoEm)}
                                    {multi ? ` · ${a.condominioNome}` : ''}
                                </p>
                            </div>
                            <span className="flex items-center gap-2 shrink-0 text-sm">
                                <span className={COR_STATUS[a.status]}>{ROTULO_STATUS[a.status]}</span>
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PainelAssembleias;
