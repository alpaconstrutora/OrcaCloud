// services/condominioAssembleiaService.ts
// Assembleias do condomínio — o lado do GESTOR (app).
// Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md (R1–R10, Task A4).
//
// Onde mora cada coisa:
//   • Rascunho e pauta se editam pela TABELA (RLS do conjunto de orgs). O app só
//     tem privilégio de gravar 7 colunas de condominio_assembleias (A2, decisão 1);
//     status, retrato, quórum, ata, org e autoria são do banco.
//   • Toda transição (convocar, cancelar, presença, instalar, voto presencial,
//     encerrar, ata, marcar impedida — A10) é RPC SECURITY DEFINER: a regra (estado, R3, R6–R9) está no
//     banco, não aqui. Este arquivo só chama e traduz o erro.
//   • `OperacoesAssembleia` é a porta da tela de condução. A fase B (síndico pelo
//     Portal do Síndico) implementa a MESMA interface com as RPCs dele — a tela
//     não sabe quem conduz.
//
// Organização: não se grava organization_id — o gatilho do banco põe
// fn_org_do_condominio(empreendimento) (REGRA #5 no banco).

import { supabase } from '../lib/supabase';

// ─── tipos (colunas/JSON das A1–A3 em camelCase) ─────────────────────────────

export type StatusAssembleia = 'RASCUNHO' | 'CONVOCADA' | 'INSTALADA' | 'ENCERRADA' | 'CANCELADA';
export type TipoAssembleia = 'AGO' | 'AGE';
export type TipoItem = 'APROVACAO' | 'ESCOLHA';
export type Quorum = 'MAIORIA_PRESENTES' | 'MAIORIA_ABSOLUTA' | 'DOIS_TERCOS' | 'UNANIMIDADE';
export type ResultadoItem = 'APROVADO' | 'REJEITADO' | 'QUORUM_NAO_ATINGIDO' | 'SEM_DECISAO';
export type PresencaAssembleia = 'PRESENCIAL' | 'PROCURADOR';
export type OrigemVoto = 'PORTAL' | 'PRESENCIAL';
export type PapelCondutor = 'GESTOR' | 'SINDICO';
/** APROVACAO: SIM | NAO | ABSTENCAO. ESCOLHA: uma das `opcoes` do item ou ABSTENCAO. */
export type OpcaoVoto = string;

/**
 * De onde vem o impedimento (A10): MANUAL = o gestor marcou à mão, com motivo livre (vale
 * sobre a regra); AUTOMATICA = cota vencida e não paga (R3).
 */
export type OrigemImpedimento = 'MANUAL' | 'AUTOMATICA';

/** Unidade impedida AGORA. AUTOMATICA: motivo = 'Cota de MM/AAAA vencida em DD/MM/AAAA'. */
export interface ImpedimentoUnidade {
    unitId: string;
    motivo: string;
    origem: OrigemImpedimento;
}

/** Impedida gravada no instante de Instalar (quorum_instalacao.impedidas). */
export interface ImpedidaNaInstalacao {
    unitId: string;
    rotulo: string | null;
    motivo: string;
    origem: OrigemImpedimento;
}

/** condominio_assembleias.quorum_instalacao — gravado em Instalar e nunca refeito (R6). */
export interface QuorumInstalacao {
    convocacao: 1 | 2;
    total: number;
    presentesFracao: number;
    presentesUnidades: number;
    impedidas: ImpedidaNaInstalacao[];
    em: string;
    /**
     * A10: o condomínio tinha cota cobrada pelo app na instalação? false = a regra automática
     * não tinha o que conferir e as impedidas foram indicadas pelo gestor (a ata diz isso).
     * null = não gravado.
     */
    cotasConferidas: boolean | null;
}

export interface Assembleia {
    id: string;
    organizationId: string;
    empreendimentoId: string;
    tipo: TipoAssembleia;
    titulo: string;
    local: string | null;
    linkTransmissao: string | null;
    /** timestamptz (ISO). Nulas no rascunho; Convocar exige as duas. */
    primeiraConvocacaoEm: string | null;
    segundaConvocacaoEm: string | null;
    status: StatusAssembleia;
    convocadaEm: string | null;
    avisoId: string | null;
    editalEntregueEm: string | null;
    instaladaEm: string | null;
    instaladaConvocacao: 1 | 2 | null;
    quorumInstalacao: QuorumInstalacao | null;
    presidenteNome: string | null;
    secretarioNome: string | null;
    observacaoGeral: string | null;
    encerradaEm: string | null;
    /** Gravado ao encerrar; a ata sai daqui. */
    retrato: Retrato | null;
    ataDocumentoId: string | null;
    canceladaEm: string | null;
    motivoCancelamento: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ItemAssembleia {
    id: string;
    assembleiaId: string;
    ordem: number;
    titulo: string;
    descricao: string | null;
    tipo: TipoItem;
    /** Só ESCOLHA (≥ 2, sem repetição, sem Abstenção). APROVACAO: null. */
    opcoes: string[] | null;
    quorum: Quorum;
    /** Assunto comum escolhido ao criar (sugere o quórum — A5). */
    assunto: string | null;
    deliberacao: string | null;
}

export interface UnidadeNaAssembleia {
    id: string;
    assembleiaId: string;
    unitId: string;
    /** Fração ideal CONGELADA na convocação (R1). */
    fracao: number;
    unidadeRotulo: string | null;
    proprietarioNome: string | null;
    presenca: PresencaAssembleia | null;
    procuradorNome: string | null;
    procuracaoDocumentoId: string | null;
    presencaEm: string | null;
    /** null até Instalar. */
    impedidaNaInstalacao: boolean | null;
    /** A10: motivo do impedimento marcado à mão (null = sem marca). */
    impedimentoManual: string | null;
    impedimentoManualEm: string | null;
}

export interface VotoAssembleia {
    id: string;
    assembleiaId: string;
    itemId: string;
    unitId: string;
    opcao: OpcaoVoto;
    origem: OrigemVoto;
    /** Quem votou pelo portal. */
    clientId: string | null;
    /** Quem lançou o voto presencial. */
    lancadoPor: string | null;
    votadoEm: string;
}

/** Soma de uma opção: fração (numeric exato no banco) e nº de unidades. */
export interface SomaOpcao {
    fracao: number;
    unidades: number;
}

export interface ApuracaoItem {
    itemId: string;
    ordem: number;
    titulo: string;
    tipo: TipoItem;
    quorum: Quorum;
    porOpcao: Record<OpcaoVoto, SomaOpcao>;
    resultado: ResultadoItem;
    /** Só ESCOLHA com vencedora única; senão null. */
    vencedora: string | null;
}

/** fn_assembleia_apurar. total = soma das frações de TODAS as unidades (R8). */
export interface Apuracao {
    total: number;
    presentesFracao: number;
    presentesUnidades: number;
    itens: ApuracaoItem[];
}

/** Quem agiu (evento INSTALADA): nome de profiles (gestor) ou clients (síndico). */
export interface AutorAssembleia {
    id: string | null;
    papel: PapelCondutor;
    em: string;
    nome: string | null;
}

export interface RetratoCabecalho {
    assembleiaId: string;
    empreendimentoId: string;
    condominio: string | null;
    condominioCnpj: string | null;
    tipo: TipoAssembleia;
    titulo: string;
    local: string | null;
    linkTransmissao: string | null;
    primeiraConvocacaoEm: string | null;
    segundaConvocacaoEm: string | null;
    convocadaEm: string | null;
    editalEntregueEm: string | null;
    instaladaEm: string | null;
    convocacao: 1 | 2 | null;
    presidente: string | null;
    secretario: string | null;
    instaladaPor: AutorAssembleia | null;
    /** Mesmo autor de instaladaPor, com `em` = edital_entregue_em. */
    editalConfirmadoPor: AutorAssembleia | null;
    quorumInstalacao: QuorumInstalacao | null;
    observacaoGeral: string | null;
    encerradaEm: string;
    encerradaPor: string | null;
    encerradaPorPapel: PapelCondutor;
}

export interface RetratoUnidade {
    unitId: string;
    rotulo: string | null;
    proprietario: string | null;
    fracao: number;
    presenca: PresencaAssembleia | null;
    procurador: string | null;
    procuracaoDocumentoId: string | null;
    presencaEm: string | null;
    votouPeloPortal: boolean;
    impedidaNaInstalacao: boolean | null;
}

export interface RetratoVoto {
    itemId: string;
    unitId: string;
    opcao: OpcaoVoto;
    origem: OrigemVoto;
    votadoEm: string;
    clientId: string | null;
    lancadoPor: string | null;
}

/** condominio_assembleias.retrato = apuração + cabeçalho + presença + votos (A2, _assembleia_encerrar). */
export interface Retrato extends Apuracao {
    cabecalho: RetratoCabecalho;
    /** { id do item: deliberação } — só os itens que têm texto. */
    deliberacoes: Record<string, string>;
    unidades: RetratoUnidade[];
    votos: RetratoVoto[];
    impedidasNaInstalacao: ImpedidaNaInstalacao[];
}

/** Voto que existia antes do lançado (para o histórico e a confirmação R7). */
export interface VotoAnterior {
    opcao: OpcaoVoto;
    origem: OrigemVoto;
    votadoEm: string;
    clientId: string | null;
    lancadoPor: string | null;
}

export interface ResultadoConvocar {
    /** Unidades que entraram (com fração ideal). */
    unidades: number;
    /** Rótulos das que ficaram fora por falta de fração (R1). */
    fora: string[];
    avisoId: string;
}

export interface ResultadoCancelar {
    status: 'CANCELADA';
    avisoId: string;
}

export interface ResultadoPresenca {
    unitId: string;
    presenca: PresencaAssembleia | null;
    procurador: string | null;
    procuracaoDocumentoId: string | null;
}

export interface ResultadoVotoLancado {
    votoId: string;
    itemId: string;
    unitId: string;
    opcao: OpcaoVoto;
    origem: 'PRESENCIAL';
    anterior: VotoAnterior | null;
}

/** A10: resultado de marcar (motivo) / desmarcar (null) a unidade impedida. */
export interface ResultadoMarcarImpedida {
    unitId: string;
    motivo: string | null;
    em: string | null;
}

export interface DadosInstalacao {
    convocacao: 1 | 2;
    presidente: string;
    secretario: string;
    /** "Confirmo que o edital foi entregue a todas as unidades" (R4). */
    editalEntregue: boolean;
}

export interface AssembleiaCarregada {
    assembleia: Assembleia;
    itens: ItemAssembleia[];
    unidades: UnidadeNaAssembleia[];
    votos: VotoAssembleia[];
}

/**
 * A condução da assembleia. O gestor implementa com as RPCs condominio_assembleia_*;
 * a fase B (síndico) implementa a mesma interface com as RPCs da porta dele.
 */
export interface OperacoesAssembleia {
    convocar(id: string, corpoAviso: string): Promise<ResultadoConvocar>;
    cancelar(id: string, motivo: string, corpoAviso: string): Promise<ResultadoCancelar>;
    /** `presenca` null remove a presença (recusado se a unidade já votou na sala). */
    registrarPresenca(id: string, unitId: string, presenca: PresencaAssembleia | null,
                      procurador?: string | null, procuracaoId?: string | null): Promise<ResultadoPresenca>;
    instalar(id: string, dados: DadosInstalacao): Promise<QuorumInstalacao>;
    lancarVoto(itemId: string, unitId: string, opcao: OpcaoVoto): Promise<ResultadoVotoLancado>;
    /** `deliberacoes` = { id do item: texto }; item fora do objeto fica como está. */
    encerrar(id: string, deliberacoes: Record<string, string | null>, observacao: string | null): Promise<Retrato>;
    vincularAta(id: string, documentoId: string): Promise<{ ataDocumentoId: string }>;
    apuracao(id: string): Promise<Apuracao>;
    /** Unidades impedidas AGORA (R3) — a tela de presença mostra o motivo e a origem. */
    impedimentos(id: string): Promise<ImpedimentoUnidade[]>;
    /**
     * A10: marca a unidade como impedida (motivo obrigatório) ou desmarca (`motivo` null).
     * Só CONVOCADA/INSTALADA; impede presença e voto daqui em diante (voto já dado vale).
     */
    marcarImpedida(id: string, unitId: string, motivo: string | null): Promise<ResultadoMarcarImpedida>;
    /** A10: o condomínio tem cota cobrada pelo app? false = a tela avisa (a inadimplência não é conferida). */
    cotasConferidas(id: string): Promise<boolean>;
    carregar(id: string): Promise<AssembleiaCarregada>;
}

// ─── tradução de erro ────────────────────────────────────────────────────────

export interface ErroDoBanco {
    code?: string;
    hint?: string;
    details?: string;
    message: string;
}

/** Erro já traduzido; guarda code/hint/details para a tela decidir (ex.: hint 'estado'). */
export class ErroAssembleia extends Error {
    code?: string;
    hint?: string;
    details?: string;
    constructor(e: ErroDoBanco) {
        super(traduzirErroAssembleia(e));
        this.name = 'ErroAssembleia';
        this.code = e.code;
        this.hint = e.hint;
        this.details = e.details;
    }
}

/** Uma frase por HINT levantado nas migrations A1–A3 e B1 (conferido por grep no teste). */
const FRASE_DO_HINT: Record<string, string> = {
    antes_do_horario: 'Ainda não chegou o horário desta convocação.',
    assembleia_travada: 'Esta assembleia não aceita mais mudanças neste estado.',
    convocacao_invalida: 'Escolha em qual convocação a assembleia se instala: 1ª ou 2ª.',
    deliberacoes_invalidas: 'As deliberações enviadas não estão no formato esperado.',
    documento_invalido: 'A ata tem de ser um documento da categoria Ata deste condomínio.',
    edital_nao_confirmado: 'Confirme que o edital foi entregue a todas as unidades.',
    estado: 'Esta ação não vale no estado atual da assembleia.',
    item_fora: 'Há deliberação para um item que não é desta assembleia.',
    nao_encontrada: 'Assembleia ou item da pauta não encontrado.',
    opcao_invalida: 'Opção de voto inválida para este item.',
    papel_invalido: 'Papel inválido para conduzir a assembleia.',
    presenca_invalida: 'Presença inválida: escolha na sala ou por procurador.',
    primeira_no_passado: 'A 1ª convocação tem de ser marcada para o futuro.',
    procuracao_invalida: 'Presença por procurador exige o nome do procurador e a procuração anexada aos documentos do condomínio.',
    sem_corpo: 'O texto do aviso de convocação é obrigatório.',
    sem_datas: 'Informe a data e a hora da 1ª e da 2ª convocação antes de convocar.',
    sem_itens: 'A pauta precisa de pelo menos 1 item para convocar.',
    sem_mesa: 'Informe o presidente e o secretário da mesa.',
    sem_motivo: 'Informe o motivo.',
    motivo_longo: 'O motivo do impedimento pode ter até 200 caracteres.',
    sem_presenca: 'Registre a presença da unidade antes de lançar o voto presencial.',
    sem_quorum_primeira: 'Presentes não somam metade das frações: só é possível instalar em 2ª convocação.',
    sem_unidades: 'Nenhuma unidade deste condomínio tem fração ideal: preencha as frações antes de convocar.',
    tem_voto_presencial: 'Esta unidade já tem voto lançado na sala: a presença dela não pode ser removida.',
    unidade_fora: 'Esta unidade não participa da assembleia.',
    unidade_impedida: 'Unidade impedida de votar.',
    sem_direito_de_voto: 'Só o proprietário da unidade, com login próprio, pode votar.',
    // Fase B (B1) — a porta do síndico e a pauta gravada por ela.
    itens_invalidos: 'A pauta não está no formato esperado: envie a lista de itens.',
    sindico_sem_sessao: 'Para conduzir a assembleia, entre no Portal do Síndico com seu e-mail e senha.',
    sindico_sem_acesso: 'Acesso de síndico não reconhecido: o link expirou ou o mandato não está vigente. Fale com a administradora.',
    sindico_fora_do_mandato: 'Este condomínio não está no seu mandato de síndico.',
};

/** Excluir o aviso da convocação ou a ata (ON DELETE SET NULL) — a frase do banco é a certa. */
const MSG_AVISO_OU_ATA_DA_ASSEMBLEIA =
    'Este aviso ou documento pertence a uma assembleia convocada e não pode ser excluído.';

/** CHECKs sem HINT (23514 cru, em inglês). */
const FRASE_DO_CHECK: Array<[string, string]> = [
    ['condominio_assembleias_segunda_depois_da_primeira', 'A 2ª convocação tem de ser depois da 1ª.'],
    ['condominio_assembleia_itens_tipo_opcoes',
        'Item de escolha precisa de pelo menos 2 opções diferentes (sem "Abstenção", que já vem na cédula) '
        + 'e quórum de maioria dos presentes.'],
];

export function traduzirErroAssembleia(e: ErroDoBanco): string {
    const hint = e.hint ?? '';
    if (hint === 'assembleia_travada' && e.message === MSG_AVISO_OU_ATA_DA_ASSEMBLEIA) return e.message;
    if (hint === 'unidade_impedida') {
        return e.details ? `Unidade impedida de votar: ${e.details}` : FRASE_DO_HINT.unidade_impedida;
    }
    // 'estado': o banco já diz em que estado ela está ("já foi encerrada") — é o que
    // o segundo clique em Encerrar precisa ler.
    if (hint === 'estado') return e.message || FRASE_DO_HINT.estado;
    // 'sem_motivo' vale para cancelar e para marcar impedida (A10): a frase do banco diz qual.
    if (hint === 'sem_motivo') return e.message?.startsWith('Informe o motivo') ? e.message : FRASE_DO_HINT.sem_motivo;
    if (hint && FRASE_DO_HINT[hint]) return FRASE_DO_HINT[hint];
    if (e.code === '42501') return 'Sem permissão neste condomínio.';
    for (const [restricao, frase] of FRASE_DO_CHECK) {
        if (e.message?.includes(restricao)) return frase;
    }
    return e.message;
}

function falhar(error: ErroDoBanco): never {
    throw new ErroAssembleia(error);
}

// ─── conversão linha → tipo ──────────────────────────────────────────────────

type Linha = Record<string, any>;

/** numeric chega como number ou string, conforme o caminho; jsonb como number. */
const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v));

function quorumInstalacaoDe(q: Linha | null | undefined): QuorumInstalacao | null {
    if (!q) return null;
    return {
        convocacao: Number(q.convocacao) as 1 | 2,
        total: num(q.total),
        presentesFracao: num(q.presentesFracao),
        presentesUnidades: num(q.presentesUnidades),
        impedidas: impedidasDe(q.impedidas),
        em: q.em,
        cotasConferidas: typeof q.cotasConferidas === 'boolean' ? q.cotasConferidas : null,
    };
}

/** Sem `origem` gravada, a impedida é a da regra automática (a única antes da A10). */
function impedidasDe(lista: unknown): ImpedidaNaInstalacao[] {
    return ((lista ?? []) as Linha[]).map(i => ({
        unitId: i.unitId,
        rotulo: i.rotulo ?? null,
        motivo: i.motivo,
        origem: i.origem === 'MANUAL' ? 'MANUAL' : 'AUTOMATICA',
    }));
}

function apuracaoDe(a: Linha): Apuracao {
    return {
        total: num(a.total),
        presentesFracao: num(a.presentesFracao),
        presentesUnidades: num(a.presentesUnidades),
        itens: ((a.itens ?? []) as Linha[]).map(i => ({
            itemId: i.itemId,
            ordem: Number(i.ordem),
            titulo: i.titulo,
            tipo: i.tipo,
            quorum: i.quorum,
            porOpcao: Object.fromEntries(Object.entries((i.porOpcao ?? {}) as Record<string, Linha>)
                .map(([op, s]) => [op, { fracao: num(s.fracao), unidades: num(s.unidades) }])),
            resultado: i.resultado,
            vencedora: i.vencedora ?? null,
        })),
    };
}

function retratoDe(r: Linha | null | undefined): Retrato | null {
    if (!r) return null;
    const c = (r.cabecalho ?? {}) as Linha;
    return {
        ...apuracaoDe(r),
        cabecalho: { ...(c as RetratoCabecalho), quorumInstalacao: quorumInstalacaoDe(c.quorumInstalacao) },
        deliberacoes: (r.deliberacoes ?? {}) as Record<string, string>,
        unidades: ((r.unidades ?? []) as Linha[]).map(u => ({ ...(u as RetratoUnidade), fracao: num(u.fracao) })),
        votos: (r.votos ?? []) as RetratoVoto[],
        impedidasNaInstalacao: impedidasDe(r.impedidasNaInstalacao),
    };
}

const COLS_ASSEMBLEIA =
    'id, organization_id, empreendimento_id, tipo, titulo, local, link_transmissao, primeira_convocacao_em, '
    + 'segunda_convocacao_em, status, convocada_em, aviso_id, edital_entregue_em, instalada_em, instalada_convocacao, '
    + 'quorum_instalacao, presidente_nome, secretario_nome, observacao_geral, encerrada_em, retrato, ata_documento_id, '
    + 'cancelada_em, motivo_cancelamento, created_by, created_at, updated_at';
const COLS_ITEM = 'id, assembleia_id, ordem, titulo, descricao, tipo, opcoes, quorum, assunto, deliberacao';
const COLS_UNIDADE =
    'id, assembleia_id, unit_id, fracao, unidade_rotulo, proprietario_nome, presenca, procurador_nome, '
    + 'procuracao_documento_id, presenca_em, impedida_na_instalacao, impedimento_manual, impedimento_manual_em';
const COLS_VOTO = 'id, assembleia_id, item_id, unit_id, opcao, origem, client_id, lancado_por, votado_em';

function assembleiaDe(l: Linha): Assembleia {
    return {
        id: l.id,
        organizationId: l.organization_id,
        empreendimentoId: l.empreendimento_id,
        tipo: l.tipo,
        titulo: l.titulo,
        local: l.local ?? null,
        linkTransmissao: l.link_transmissao ?? null,
        primeiraConvocacaoEm: l.primeira_convocacao_em ?? null,
        segundaConvocacaoEm: l.segunda_convocacao_em ?? null,
        status: l.status,
        convocadaEm: l.convocada_em ?? null,
        avisoId: l.aviso_id ?? null,
        editalEntregueEm: l.edital_entregue_em ?? null,
        instaladaEm: l.instalada_em ?? null,
        instaladaConvocacao: l.instalada_convocacao ?? null,
        quorumInstalacao: quorumInstalacaoDe(l.quorum_instalacao),
        presidenteNome: l.presidente_nome ?? null,
        secretarioNome: l.secretario_nome ?? null,
        observacaoGeral: l.observacao_geral ?? null,
        encerradaEm: l.encerrada_em ?? null,
        retrato: retratoDe(l.retrato),
        ataDocumentoId: l.ata_documento_id ?? null,
        canceladaEm: l.cancelada_em ?? null,
        motivoCancelamento: l.motivo_cancelamento ?? null,
        createdBy: l.created_by ?? null,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
    };
}

function itemDe(l: Linha): ItemAssembleia {
    return {
        id: l.id,
        assembleiaId: l.assembleia_id,
        ordem: Number(l.ordem),
        titulo: l.titulo,
        descricao: l.descricao ?? null,
        tipo: l.tipo,
        opcoes: l.opcoes ?? null,
        quorum: l.quorum,
        assunto: l.assunto ?? null,
        deliberacao: l.deliberacao ?? null,
    };
}

function unidadeDe(l: Linha): UnidadeNaAssembleia {
    return {
        id: l.id,
        assembleiaId: l.assembleia_id,
        unitId: l.unit_id,
        fracao: num(l.fracao),
        unidadeRotulo: l.unidade_rotulo ?? null,
        proprietarioNome: l.proprietario_nome ?? null,
        presenca: l.presenca ?? null,
        procuradorNome: l.procurador_nome ?? null,
        procuracaoDocumentoId: l.procuracao_documento_id ?? null,
        presencaEm: l.presenca_em ?? null,
        impedidaNaInstalacao: l.impedida_na_instalacao ?? null,
        impedimentoManual: l.impedimento_manual ?? null,
        impedimentoManualEm: l.impedimento_manual_em ?? null,
    };
}

function votoDe(l: Linha): VotoAssembleia {
    return {
        id: l.id,
        assembleiaId: l.assembleia_id,
        itemId: l.item_id,
        unitId: l.unit_id,
        opcao: l.opcao,
        origem: l.origem,
        clientId: l.client_id ?? null,
        lancadoPor: l.lancado_por ?? null,
        votadoEm: l.votado_em,
    };
}

// ─── operações do gestor (RPCs) ──────────────────────────────────────────────

async function chamar<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) falhar(error);
    return data as T;
}

export const operacoesDoGestor: OperacoesAssembleia = {
    async convocar(id, corpoAviso) {
        const r = await chamar<Linha>('condominio_assembleia_convocar', { p_assembleia: id, p_corpo_aviso: corpoAviso });
        return { unidades: num(r.unidades), fora: (r.fora ?? []) as string[], avisoId: r.avisoId };
    },

    async cancelar(id, motivo, corpoAviso) {
        return chamar<ResultadoCancelar>('condominio_assembleia_cancelar',
            { p_assembleia: id, p_motivo: motivo, p_corpo_aviso: corpoAviso });
    },

    async registrarPresenca(id, unitId, presenca, procurador, procuracaoId) {
        return chamar<ResultadoPresenca>('condominio_assembleia_registrar_presenca', {
            p_assembleia: id, p_unit: unitId, p_presenca: presenca,
            p_procurador: procurador ?? null, p_procuracao: procuracaoId ?? null,
        });
    },

    async instalar(id, { convocacao, presidente, secretario, editalEntregue }) {
        const q = await chamar<Linha>('condominio_assembleia_instalar', {
            p_assembleia: id, p_convocacao: convocacao, p_presidente: presidente,
            p_secretario: secretario, p_edital_entregue: editalEntregue,
        });
        return quorumInstalacaoDe(q)!;
    },

    async lancarVoto(itemId, unitId, opcao) {
        return chamar<ResultadoVotoLancado>('condominio_assembleia_lancar_voto',
            { p_item: itemId, p_unit: unitId, p_opcao: opcao });
    },

    async encerrar(id, deliberacoes, observacao) {
        const r = await chamar<Linha>('condominio_assembleia_encerrar',
            { p_assembleia: id, p_deliberacoes: deliberacoes, p_observacao: observacao });
        return retratoDe(r)!;
    },

    async vincularAta(id, documentoId) {
        return chamar<{ ataDocumentoId: string }>('condominio_assembleia_vincular_ata',
            { p_assembleia: id, p_documento: documentoId });
    },

    async apuracao(id) {
        return apuracaoDe(await chamar<Linha>('condominio_assembleia_apuracao', { p_assembleia: id }));
    },

    async impedimentos(id) {
        const lista = (await chamar<Linha[] | null>('condominio_assembleia_impedimentos', { p_assembleia: id })) ?? [];
        return lista.map(i => ({
            unitId: i.unitId, motivo: i.motivo, origem: i.origem === 'MANUAL' ? 'MANUAL' as const : 'AUTOMATICA' as const,
        }));
    },

    async marcarImpedida(id, unitId, motivo) {
        const r = await chamar<Linha>('condominio_assembleia_marcar_impedida',
            { p_assembleia: id, p_unit: unitId, p_motivo: motivo });
        return { unitId: r.unitId, motivo: r.motivo ?? null, em: r.em ?? null };
    },

    async cotasConferidas(id) {
        return (await chamar<boolean | null>('condominio_assembleia_cotas_conferidas', { p_assembleia: id })) === true;
    },

    async carregar(id) {
        // O gestor lê pelas tabelas (RLS do conjunto de orgs). O síndico (fase B) lê por RPC.
        const [a, itens, unidades, votos] = await Promise.all([
            supabase.from('condominio_assembleias').select(COLS_ASSEMBLEIA).eq('id', id).maybeSingle(),
            supabase.from('condominio_assembleia_itens').select(COLS_ITEM).eq('assembleia_id', id)
                .order('ordem', { ascending: true }),
            supabase.from('condominio_assembleia_unidades').select(COLS_UNIDADE).eq('assembleia_id', id)
                .order('unidade_rotulo', { ascending: true }),
            supabase.from('condominio_assembleia_votos').select(COLS_VOTO).eq('assembleia_id', id),
        ]);
        for (const r of [a, itens, unidades, votos]) if (r.error) falhar(r.error);
        if (!a.data) throw new Error('Assembleia não encontrada.');
        return {
            assembleia: assembleiaDe(a.data as Linha),
            itens: ((itens.data ?? []) as Linha[]).map(itemDe),
            unidades: ((unidades.data ?? []) as Linha[]).map(unidadeDe),
            votos: ((votos.data ?? []) as Linha[]).map(votoDe),
        };
    },
};

// ─── rascunho e pauta (tabela, RLS) ──────────────────────────────────────────

export interface DadosRascunho {
    /** Sem id = nova assembleia. */
    id?: string;
    empreendimentoId: string;
    tipo: TipoAssembleia;
    titulo: string;
    local?: string | null;
    linkTransmissao?: string | null;
    /** ISO com fuso (ex.: '2026-12-10T19:00:00-03:00') — timestamptz no banco. */
    primeiraConvocacaoEm?: string | null;
    segundaConvocacaoEm?: string | null;
}

export interface ItemRascunho {
    /** Item já salvo mantém o id (a pauta é reescrita, mas a chave da tela não muda). */
    id?: string;
    titulo: string;
    descricao?: string | null;
    tipo: TipoItem;
    opcoes?: string[] | null;
    quorum: Quorum;
    assunto?: string | null;
}

const textoOuNulo = (v: string | null | undefined): string | null => {
    const t = (v ?? '').trim();
    return t === '' ? null : t;
};

/** As MESMAS regras de fn_assembleia_opcoes_validas + o CHECK do item, ditas antes de gravar. */
function conferirItem(item: ItemRascunho, posicao: number): void {
    const n = `Item ${posicao}`;
    if (!item.titulo?.trim()) throw new Error(`${n}: informe o título.`);
    if (item.tipo === 'ESCOLHA') {
        const opcoes = item.opcoes ?? [];
        const limpas = opcoes.map(o => (o ?? '').trim());
        if (limpas.length < 2) throw new Error(`${n}: item de escolha precisa de pelo menos 2 opções.`);
        if (limpas.some(o => o === '')) throw new Error(`${n}: há opção em branco.`);
        if (limpas.some(o => ['ABSTENCAO', 'ABSTENÇÃO'].includes(o.toUpperCase()))) {
            throw new Error(`${n}: "Abstenção" já vem na cédula; não a cadastre como opção.`);
        }
        if (new Set(limpas.map(o => o.toLowerCase())).size !== limpas.length) {
            throw new Error(`${n}: há opções repetidas.`);
        }
        if (item.quorum !== 'MAIORIA_PRESENTES') {
            throw new Error(`${n}: item de escolha só se decide por maioria dos presentes.`);
        }
    }
}

export const condominioAssembleiaService = {
    async listar(empreendimentoId: string): Promise<Assembleia[]> {
        const { data, error } = await supabase
            .from('condominio_assembleias')
            .select(COLS_ASSEMBLEIA)
            .eq('empreendimento_id', empreendimentoId)
            // Rascunho sem data no topo; depois a mais recente.
            .order('primeira_convocacao_em', { ascending: false, nullsFirst: true })
            .order('created_at', { ascending: false });
        if (error) falhar(error);
        return ((data ?? []) as Linha[]).map(assembleiaDe);
    },

    /** Cria ou atualiza o RASCUNHO. Só as 7 colunas que o app pode gravar (A2). */
    async salvarRascunho(dados: DadosRascunho): Promise<Assembleia> {
        const linha = {
            empreendimento_id: dados.empreendimentoId,
            tipo: dados.tipo,
            titulo: (dados.titulo ?? '').trim(),
            local: textoOuNulo(dados.local),
            link_transmissao: textoOuNulo(dados.linkTransmissao),
            primeira_convocacao_em: dados.primeiraConvocacaoEm ?? null,
            segunda_convocacao_em: dados.segundaConvocacaoEm ?? null,
        };
        const q = dados.id
            ? supabase.from('condominio_assembleias').update(linha).eq('id', dados.id)
            : supabase.from('condominio_assembleias').insert(linha);
        const { data, error } = await q.select(COLS_ASSEMBLEIA).single();
        if (error) falhar(error);
        return assembleiaDe(data as Linha);
    },

    /**
     * Reescreve a pauta do rascunho na ordem da lista (ordem 1..n).
     *
     * Apaga tudo e insere de novo porque UNIQUE(assembleia_id, ordem) não é
     * adiável: trocar `ordem` no lugar colide no meio do caminho. As duas
     * operações não são uma transação — por isso o item é conferido ANTES de
     * apagar, e, se a inserção falhar, a pauta anterior é devolvida.
     * Só vale em RASCUNHO (a trava do banco recusa nos outros estados).
     */
    async salvarItens(assembleiaId: string, itens: ItemRascunho[]): Promise<ItemAssembleia[]> {
        itens.forEach((it, i) => conferirItem(it, i + 1));

        const novas = itens.map((it, i) => ({
            ...(it.id ? { id: it.id } : {}),
            assembleia_id: assembleiaId,
            ordem: i + 1,
            titulo: it.titulo.trim(),
            descricao: textoOuNulo(it.descricao),
            tipo: it.tipo,
            opcoes: it.tipo === 'ESCOLHA' ? (it.opcoes ?? []).map(o => o.trim()) : null,
            quorum: it.quorum,
            assunto: textoOuNulo(it.assunto),
        }));

        const atual = await supabase.from('condominio_assembleia_itens').select(COLS_ITEM)
            .eq('assembleia_id', assembleiaId).order('ordem', { ascending: true });
        if (atual.error) falhar(atual.error);
        const anteriores = (atual.data ?? []) as Linha[];

        const apagou = await supabase.from('condominio_assembleia_itens').delete().eq('assembleia_id', assembleiaId);
        if (apagou.error) falhar(apagou.error);
        if (novas.length === 0) return [];

        const inseriu = await supabase.from('condominio_assembleia_itens').insert(novas).select(COLS_ITEM);
        if (inseriu.error) {
            if (anteriores.length > 0) {
                const devolveu = await supabase.from('condominio_assembleia_itens').insert(anteriores);
                if (devolveu.error) {
                    console.error('[assembleia] pauta anterior não foi devolvida:', devolveu.error.message);
                }
            }
            falhar(inseriu.error);
        }
        return ((inseriu.data ?? []) as Linha[]).map(itemDe).sort((a, b) => a.ordem - b.ordem);
    },

    /** Só rascunho se exclui (a trava recusa os outros estados). */
    async excluirRascunho(id: string): Promise<void> {
        const { data, error } = await supabase.from('condominio_assembleias').delete().eq('id', id).select('id');
        if (error) falhar(error);
        if (!data || (data as unknown[]).length === 0) {
            throw new Error('Rascunho não encontrado, ou sem permissão para excluí-lo.');
        }
    },
};
