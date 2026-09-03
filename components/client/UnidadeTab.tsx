// components/client/UnidadeTab.tsx
// Portal do Cliente › aba "Dados da Unidade".
// Plano: docs/planos/2026-09-03-portal-cliente-aba-dados-da-unidade.md
//
// POR QUE ESTA ABA EXISTE: o comprador de um apartamento e o locatário de uma
// sala não tinham NENHUMA tela no portal com a ficha do próprio imóvel. O
// Financeiro mostra as parcelas, Contratos mostra o contrato — metragem, fração
// ideal, pavimento, matrícula e características não apareciam em lugar nenhum.
//
// O QUE ELA NÃO REPETE: parcelas (Financeiro), contrato e minuta (Contratos),
// andamento da obra (Obra). Dois caminhos para o mesmo dado é como nasce
// divergência. Aqui fica só a ficha do imóvel e um resumo curto da negociação
// que dá acesso a ele.
//
// NÃO CONFUNDIR com a aba "Condomínio": lá a unidade vem de `unit_occupancies`
// (onde a pessoa mora/ocupa hoje); aqui vem de `commercial_deals` (o que ela
// comprou ou alugou). Um cliente pode ter as duas, e elas não coincidem.
//
// ⚠️ ESCALA DE RADIUS: `rounded-[2.5rem]` (§16 deprecated), de propósito. O
// Portal do Cliente inteiro está na escala antiga, `CondominioTab` inclusive.
// Card compacto entre duas abas de 2.5rem lê como bug, e o §16 também proíbe
// misturar as duas escalas na mesma tela. Migrar o portal inteiro é item
// separado — e continua pendente.
import React from 'react';
import {
    Home, Ruler, BedDouble, MapPin, ScrollText, Handshake, Building2,
} from 'lucide-react';
import type {
    PortalUnidades, PortalUnidadeNegociada, PortalUnidadeNegociacao,
} from '../../services/clientPortalService';

// ── Vocabulário do banco em português de gente ──────────────────────────────

const STATUS_NEGOCIACAO: Record<string, string> = {
    IN_NEGOTIATION: 'Em negociação',
    PENDING: 'Em andamento',
    WAITING_PAYMENT: 'Aguardando pagamento',
    RESERVA: 'Reservada',
    CONTRATO: 'Em contrato',
    ASSINATURA: 'Em assinatura',
    COMPLETED: 'Concluída',
};

/** §8 — status como texto colorido, sem pílula. */
const COR_STATUS: Record<string, string> = {
    COMPLETED: 'text-emerald-700',
    CONTRATO: 'text-blue-700',
    ASSINATURA: 'text-blue-700',
    RESERVA: 'text-amber-700',
    WAITING_PAYMENT: 'text-amber-700',
    IN_NEGOTIATION: 'text-indigo-600',
    PENDING: 'text-gray-500',
};

const TIPO_NEGOCIACAO: Record<string, string> = {
    SALE: 'Compra', RENTAL: 'Locação', SERVICE: 'Serviço',
};

const PAVIMENTO_TIPO: Record<string, string> = {
    SUBSOLO: 'Subsolo', TERREO: 'Térreo', MEZANINO: 'Mezanino', TIPO: 'Tipo',
    COBERTURA: 'Cobertura', TECNICO: 'Técnico', GARAGEM: 'Garagem', OUTRO: 'Outro',
};

// Códigos de `commercial_properties` — MESMOS rótulos de PropertyModal.tsx e
// BrokerDevelopments.tsx, para o cliente não ler "APARTMENT"/"FULL" cru.
// ⚠️ Sem os sufixos internos de precificação ("Norte (Melhor)", "Vista Plena
// (++)"): aquilo é vocabulário do motor hedônico, não do comprador.
const TIPO_IMOVEL: Record<string, string> = {
    APARTMENT: 'Apartamento', HOUSE: 'Casa', LAND: 'Terreno / Lote',
    COMMERCIAL: 'Comercial', BUILDING: 'Edifício',
};
const FINALIDADE: Record<string, string> = {
    SALE: 'Venda', RENTAL: 'Locação', BOTH: 'Venda e locação',
};
const POSICAO: Record<string, string> = { FRONT: 'Frente', LATERAL: 'Lateral', BACK: 'Fundos' };
const VISTA: Record<string, string> = { NONE: 'Sem vista', PARTIAL: 'Vista parcial', FULL: 'Vista plena' };
const ORIENTACAO: Record<string, string> = { NORTH: 'Norte', EAST: 'Leste', WEST: 'Oeste', SOUTH: 'Sul' };

/** O rótulo do catálogo, ou o código cru. Nunca "—" para valor presente: o tipo
 *  de imóvel vem de `property_types` (catálogo editável pelo usuário), então
 *  código fora do mapa é esperado, não erro. */
const rotulo = (mapa: Record<string, string>, v: string | null | undefined) =>
    v ? (mapa[v] ?? v) : '—';

// ── Formatação ──────────────────────────────────────────────────────────────

/** Meio-dia de âncora: `new Date('2026-09-03')` cru volta um dia em fuso
 *  negativo, e o Brasil inteiro está em fuso negativo. */
const data = (iso: string | null) =>
    iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—';

const numero = (v: number | null | undefined, sufixo = '') =>
    v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${sufixo}`;

const texto = (v: string | null | undefined) => (v && v.trim()) || '—';

/** COM centavos, ao contrário do `fmtBRL` do app (que arredonda para inteiro).
 *  Aqui o número é o que a pessoa paga: o rateio de um contrato multi-unidade dá
 *  R$ 1.517,26, e mostrar "R$ 1.517" faz o cliente conferir contra o boleto e
 *  achar divergência onde não há. */
const moeda = (v: number | null | undefined) =>
    v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A fração vem em decimal e é lida em porcentagem. 4 casas porque é o que a
 *  convenção registra — arredondar faria a soma das unidades não fechar 100%.
 *  Exportada para teste: já houve erro de escala de 100× neste domínio
 *  (frações salvas como 0,0833 em campo de %). */
export function fracaoParaPercentual(v: number | null | undefined): string {
    if (v == null) return '—';
    return `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`;
}

/** `0` é TÉRREO, valor legítimo — nunca "—". Aplicar o padrão dos campos
 *  vizinhos (`|| '—'`, `NULLIF(x,0)`) come o térreo, e o sintoma parece dado
 *  faltando em vez de bug. Exportada para teste por isso mesmo. */
export function rotuloPavimento(
    pavimento: number | null | undefined,
    tipo: string | null | undefined,
): string {
    const nomeDoTipo = tipo ? (PAVIMENTO_TIPO[tipo] ?? tipo) : null;
    if (pavimento == null) return nomeDoTipo ?? '—';
    if (pavimento === 0) return nomeDoTipo ?? 'Térreo';
    return nomeDoTipo ? `${pavimento}º (${nomeDoTipo})` : `${pavimento}º`;
}

/**
 * O valor que a unidade mostra, e o rótulo certo para ele.
 *
 * ⚠️ Locação é MENSAL (`aluguelMensal`, derivado de `installment_value`), venda
 * é o valor da unidade no contrato. Trocar um pelo outro erra por um fator de
 * `installments` e o número continua plausível na tela — foi exatamente essa a
 * armadilha que custou duas rodadas de correção no módulo Locações.
 * Exportada para teste.
 */
export function valorDaUnidade(n: PortalUnidadeNegociacao): { rotulo: string; valor: string } {
    if (n.tipo === 'RENTAL') {
        // ⚠️ O "/mês" é FIXO, e não derivado de `billing_cycle`. `installment_value`
        // é, por definição do tipo (`PropertyDeal`), o valor MENSAL do contrato;
        // `billing_cycle` diz com que frequência se FATURA, e no banco está
        // pouco confiável (2 contratos marcados "Anual" com 36 e 60 parcelas —
        // 36 anos de locação não existe). Ler o rótulo daquele campo escrevia
        // "R$ 1.517,26/ano" num aluguel mensal de verdade. A periodicidade de
        // faturamento aparece como campo próprio, dita pelo que ela é.
        return { rotulo: 'Aluguel contratado', valor: n.aluguelMensal == null ? '—' : `${moeda(n.aluguelMensal)}/mês` };
    }
    return { rotulo: 'Valor da unidade', valor: moeda(n.valorUnidade) };
}

/** Endereço em uma linha. Cadastro antigo só tem o campo livre. */
export function enderecoEmLinha(e: PortalUnidadeNegociada['endereco']): string {
    const rua = [e.logradouro, e.numero].filter(Boolean).join(', ');
    const partes = [rua, e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join(' - '), e.cep]
        .map(p => (p || '').trim())
        .filter(Boolean);
    if (partes.length) return partes.join(' · ');
    return (e.livre || '').trim() || '—';
}

// ── Blocos de apresentação ──────────────────────────────────────────────────

const VAZIO = '—';

/** `cor` só para o único campo semântico da ficha (a situação da negociação) —
 *  §8: texto colorido, sem pílula. */
interface ItemCampo { rotulo: string; valor: string; cor?: string }

/**
 * Uma seção de campos. **Some inteira quando nenhum campo tem valor** — na
 * primeira versão, um imóvel de locação (que não tem unidade de empreendimento
 * vinculada) rendia duas seções completas só de traços: "Características" com
 * quatro "—" e "Registro do imóvel" com três. Parede de traço não informa nada
 * e faz a tela parecer quebrada.
 *
 * Dentro de uma seção que sobrevive, o campo vazio CONTINUA aparecendo com o
 * traço: ali ele informa — diz que o dado existe no cadastro e está em branco,
 * que é o que faz o cliente pedir o complemento.
 */
const Secao: React.FC<{
    icone: React.ReactNode;
    titulo: string;
    itens?: ItemCampo[];
    colunas?: string;
    children?: React.ReactNode;
}> = ({ icone, titulo, itens = [], colunas = 'grid-cols-2 lg:grid-cols-4', children }) => {
    const temCampo = itens.some(i => i.valor !== VAZIO);
    if (!temCampo && !children) return null;

    return (
        <div className="pt-5 mt-5 border-t border-gray-100 first:pt-0 first:mt-0 first:border-t-0">
            <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-3">{icone} {titulo}</p>
            {temCampo && (
                <div className={`grid ${colunas} gap-4`}>
                    {itens.map(i => (
                        <div key={i.rotulo}>
                            <p className="text-xs text-gray-400">{i.rotulo}</p>
                            <p className={`text-sm font-medium mt-0.5 ${i.cor ?? 'text-gray-700'}`}>{i.valor}</p>
                        </div>
                    ))}
                </div>
            )}
            {children}
        </div>
    );
};

interface Props {
    dados: PortalUnidades;
    loading: boolean;
    /** A barra de abas do desktop, injetada pela tela dona (§19.3). */
    desktopTabsBar?: React.ReactNode;
}

const UnidadeTab: React.FC<Props> = ({ dados, loading, desktopTabsBar }) => {
    if (loading) {
        return (
            <div className="animate-in fade-in duration-300">
                {desktopTabsBar}
                <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100">
                    <div className="animate-pulse space-y-4">
                        <div className="h-6 bg-gray-100 rounded w-1/3" />
                        <div className="h-24 bg-gray-50 rounded-[1.5rem]" />
                        <div className="h-24 bg-gray-50 rounded-[1.5rem]" />
                    </div>
                </div>
            </div>
        );
    }

    // §12 — estado vazio que DIZ o que houve. A aba pode estar habilitada para
    // quem ainda não tem negociação fechada; tela em branco deixaria a pessoa
    // achando que o sistema quebrou.
    if (!dados.unidades.length) {
        return (
            <div className="animate-in fade-in duration-300">
                {desktopTabsBar}
                <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100 text-center">
                    <div className="w-14 h-14 rounded-[1rem] bg-gray-50 flex items-center justify-center mx-auto mb-4">
                        <Home className="w-7 h-7 text-gray-300" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Nenhuma unidade vinculada</h3>
                    <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">
                        Ainda não há imóvel vinculado ao seu cadastro por uma compra ou
                        locação. Assim que a negociação for registrada, a ficha completa
                        da unidade aparece aqui. Se isso não estiver certo, fale com a
                        nossa equipe.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            {desktopTabsBar}

            {dados.unidades.map((u: PortalUnidadeNegociada) => {
                const n = u.negociacao;
                const { rotulo: rotuloValor, valor } = valorDaUnidade(n);
                const subtitulo = [u.empreendimento, u.torre].filter(Boolean).join(' · ');

                return (
                    <div key={u.propertyId} className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
                        {/* ── Cabeçalho da unidade ── */}
                        <div className="bg-gradient-to-br from-[#0c1a6e] via-blue-800 to-blue-600 px-6 md:px-10 py-6">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2.5">
                                        <Home className="w-5 h-5 text-blue-200" />
                                        <h2 className="text-xl md:text-2xl font-black text-white leading-tight">{u.unidade}</h2>
                                    </div>
                                    <p className="text-blue-200 text-sm font-medium mt-1 flex items-center gap-1.5">
                                        {subtitulo && <Building2 className="w-3.5 h-3.5" />}
                                        {subtitulo || rotulo(TIPO_IMOVEL, u.tipoImovel)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-blue-200 text-xs">{rotuloValor}</p>
                                    <p className="text-lg md:text-xl font-black text-white">{valor}</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 md:p-8">
                            <Secao
                                icone={<Home className="w-3.5 h-3.5" />}
                                titulo="Identificação"
                                itens={[
                                    { rotulo: 'Empreendimento', valor: texto(u.empreendimento) },
                                    { rotulo: 'Torre / bloco', valor: texto(u.torre) },
                                    { rotulo: 'Pavimento', valor: rotuloPavimento(u.pavimento, u.pavimentoTipo) },
                                    { rotulo: 'Tipologia', valor: texto(u.tipologia) },
                                    { rotulo: 'Tipo de imóvel', valor: rotulo(TIPO_IMOVEL, u.tipoImovel) },
                                    { rotulo: 'Finalidade', valor: rotulo(FINALIDADE, u.finalidade) },
                                    { rotulo: 'Posição', valor: rotulo(POSICAO, u.posicao) },
                                    { rotulo: 'Vista', valor: rotulo(VISTA, u.vista) },
                                ]}
                            />

                            <Secao
                                icone={<Ruler className="w-3.5 h-3.5" />}
                                titulo="Áreas e fração ideal"
                                itens={[
                                    { rotulo: 'Área privativa', valor: numero(u.areaPrivativa, ' m²') },
                                    { rotulo: 'Área comum', valor: numero(u.areaComum, ' m²') },
                                    { rotulo: 'Área total', valor: numero(u.areaTotal, ' m²') },
                                    { rotulo: 'Área real total (NBR 12721)', valor: numero(u.areaRealNbr, ' m²') },
                                    { rotulo: 'Fração ideal', valor: fracaoParaPercentual(u.fracaoIdeal) },
                                    { rotulo: 'Milésimos', valor: numero(u.fracaoMilesimos) },
                                    { rotulo: 'Fonte da fração', valor: texto(u.fracaoFonte) },
                                    { rotulo: 'Orientação solar', valor: rotulo(ORIENTACAO, u.orientacaoSolar) },
                                ]}
                            />

                            <Secao
                                icone={<BedDouble className="w-3.5 h-3.5" />}
                                titulo="Características"
                                itens={[
                                    { rotulo: 'Dormitórios', valor: numero(u.dormitorios) },
                                    { rotulo: 'Suítes', valor: numero(u.suites) },
                                    { rotulo: 'Banheiros', valor: numero(u.banheiros) },
                                    { rotulo: 'Vagas de garagem', valor: numero(u.vagas) },
                                ]}
                            >
                                {u.caracteristicas.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {u.caracteristicas.map((c, i) => (
                                            <span key={`${c}-${i}`} className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-[6px] px-2.5 py-1">
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </Secao>

                            {enderecoEmLinha(u.endereco) !== VAZIO && (
                                <Secao icone={<MapPin className="w-3.5 h-3.5" />} titulo="Endereço">
                                    <p className="text-sm font-medium text-gray-700">{enderecoEmLinha(u.endereco)}</p>
                                </Secao>
                            )}

                            <Secao
                                icone={<ScrollText className="w-3.5 h-3.5" />}
                                titulo="Registro do imóvel"
                                colunas="grid-cols-2 lg:grid-cols-3"
                                itens={[
                                    { rotulo: 'Matrícula', valor: texto(u.matricula) },
                                    { rotulo: 'Cartório de registro', valor: texto(u.cartorio) },
                                    { rotulo: 'Inscrição de IPTU', valor: texto(u.inscricaoIptu) },
                                ]}
                            />

                            {/* Resumo curto de propósito: parcelas moram no Financeiro e o
                                contrato em Contratos. Aqui só o que amarra a unidade a você. */}
                            <Secao
                                icone={<Handshake className="w-3.5 h-3.5" />}
                                titulo="Sua negociação"
                                itens={[
                                    { rotulo: 'Tipo', valor: TIPO_NEGOCIACAO[n.tipo] ?? n.tipo },
                                    {
                                        rotulo: 'Situação',
                                        valor: STATUS_NEGOCIACAO[n.status] ?? n.status,
                                        cor: COR_STATUS[n.status],
                                    },
                                    { rotulo: 'Data', valor: data(n.data) },
                                    { rotulo: 'Contrato', valor: texto(n.contrato ?? n.codigo) },
                                    { rotulo: rotuloValor, valor },
                                    ...(n.tipo === 'RENTAL' ? [
                                        { rotulo: 'Vigência até', valor: data(n.vigenciaFim) },
                                        // "de faturamento" no rótulo de propósito: é a
                                        // frequência da COBRANÇA, não a unidade do valor
                                        // acima (que é sempre mensal).
                                        { rotulo: 'Periodicidade de faturamento', valor: texto(n.periodicidade) },
                                        { rotulo: 'Índice de reajuste', valor: texto(n.indiceReajuste) },
                                    ] : []),
                                ]}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default UnidadeTab;
