// utils/assembleiaTextos.ts
// Textos e modelos da assembleia do condomínio (Task A5): convocação (corpo do aviso
// do mural), cancelamento, EDITAL e ATA. Plano:
// docs/planos/2026-11-25-condominio-assembleias-votacoes.md (R4, R8, R9).
//
// POR QUE MÓDULO PURO: o PDF (services/assembleiaPdf.ts, A6) só desenha o que sai
// daqui, e a tela (A7) manda textoConvocacao/textoCancelamento como corpo do aviso.
// Tudo testável sem navegador (__tests__/assembleiaTextos.test.ts).
//
// Regras que moram aqui:
//   • Hora sempre no fuso America/Sao_Paulo (o CI roda em UTC: 19h de Brasília não
//     pode virar 22h nem o dia anterior).
//   • Peso em % do TOTAL DA ASSEMBLEIA (soma das frações participantes), nunca a
//     fração crua: no Bella Vista a soma é 0,01, então 0,00125 = 12,50% (1/8).
//   • Duas "presenças" diferentes, com rótulos diferentes na ata:
//       - quórum de instalação (gravado em Instalar, EXCLUI impedidas — R3/R6);
//       - participaram da votação (fn_assembleia_apurar: presença ou voto pelo
//         portal, INCLUSIVE impedida).
//   • Nenhum texto imprime "null": nome ausente cai num rótulo neutro.
//   • A ata leva nomes (presença, anexo de votos) — é para o PDF do gestor. O portal
//     não depende destes modelos para nada.

import type {
    Assembleia, ItemAssembleia, OpcaoVoto, OrigemVoto, PapelCondutor, Quorum, Retrato, RetratoUnidade,
    ResultadoItem, StatusAssembleia, TipoAssembleia, TipoItem, AutorAssembleia,
} from '../services/condominioAssembleiaService';
import { fmtCnpj } from './format';

// ─── rótulos ─────────────────────────────────────────────────────────────────

export const ROTULO_TIPO: Record<TipoAssembleia, string> = {
    AGO: 'Assembleia Geral Ordinária',
    AGE: 'Assembleia Geral Extraordinária',
};

export const ROTULO_TIPO_ITEM: Record<TipoItem, string> = {
    APROVACAO: 'Aprovação',
    ESCOLHA: 'Escolha',
};

export const ROTULO_QUORUM: Record<Quorum, string> = {
    MAIORIA_PRESENTES: 'Maioria dos presentes',
    MAIORIA_ABSOLUTA: 'Maioria absoluta',
    DOIS_TERCOS: '2/3 dos condôminos',
    UNANIMIDADE: 'Unanimidade',
};

/** Como o quórum decide (R8) — vai ao lado do rótulo no edital e na ata. */
export const REGRA_QUORUM: Record<Quorum, string> = {
    MAIORIA_PRESENTES: 'Sim acima de Não entre os que votaram; abstenção não entra (CC arts. 1.352 e 1.353)',
    MAIORIA_ABSOLUTA: 'Sim acima de 50% do total das frações (CC arts. 1.341 II e 1.349)',
    DOIS_TERCOS: 'Sim de pelo menos 2/3 do total das frações (CC arts. 1.341 I, 1.342 e 1.351)',
    UNANIMIDADE: 'Sim de todas as unidades participantes (CC art. 1.343)',
};

export const ROTULO_RESULTADO: Record<ResultadoItem, string> = {
    APROVADO: 'Aprovado',
    REJEITADO: 'Rejeitado',
    QUORUM_NAO_ATINGIDO: 'Quórum não atingido',
    SEM_DECISAO: 'Sem decisão',
};

export const ROTULO_STATUS: Record<StatusAssembleia, string> = {
    RASCUNHO: 'Rascunho',
    CONVOCADA: 'Convocada',
    INSTALADA: 'Instalada',
    ENCERRADA: 'Encerrada',
    CANCELADA: 'Cancelada',
};

/** Opções fixas da cédula. Opção de ESCOLHA é o próprio texto cadastrado. */
export const ROTULO_OPCAO: Record<'SIM' | 'NAO' | 'ABSTENCAO', string> = {
    SIM: 'Sim',
    NAO: 'Não',
    ABSTENCAO: 'Abstenção',
};

export const rotuloOpcao = (op: OpcaoVoto): string =>
    (ROTULO_OPCAO as Record<string, string>)[op] ?? op;

const ROTULO_ORIGEM: Record<OrigemVoto, string> = { PORTAL: 'portal', PRESENCIAL: 'sala' };

const ROTULO_PAPEL: Record<PapelCondutor, string> = { GESTOR: 'gestor', SINDICO: 'síndico' };

// ─── assuntos comuns (R8) ────────────────────────────────────────────────────

export interface AssuntoComum {
    /** Gravado em condominio_assembleia_itens.assunto. */
    id: string;
    rotulo: string;
    quorum: Quorum;
    tipo: TipoItem;
}

export const ASSUNTOS_COMUNS: AssuntoComum[] = [
    { id: 'APROVAR_CONTAS', rotulo: 'Aprovar contas', quorum: 'MAIORIA_PRESENTES', tipo: 'APROVACAO' },
    { id: 'ORCAMENTO', rotulo: 'Orçamento', quorum: 'MAIORIA_PRESENTES', tipo: 'APROVACAO' },
    { id: 'ELEGER_SINDICO', rotulo: 'Eleger síndico', quorum: 'MAIORIA_PRESENTES', tipo: 'ESCOLHA' },
    { id: 'OBRA_UTIL', rotulo: 'Obra útil', quorum: 'MAIORIA_ABSOLUTA', tipo: 'APROVACAO' },
    { id: 'DESTITUIR_SINDICO', rotulo: 'Destituir síndico', quorum: 'MAIORIA_ABSOLUTA', tipo: 'APROVACAO' },
    { id: 'OBRA_VOLUPTUARIA', rotulo: 'Obra voluptuária', quorum: 'DOIS_TERCOS', tipo: 'APROVACAO' },
    { id: 'ACRESCIMO_PARTES_COMUNS', rotulo: 'Acréscimo às partes comuns', quorum: 'DOIS_TERCOS', tipo: 'APROVACAO' },
    { id: 'ALTERAR_CONVENCAO', rotulo: 'Alterar convenção', quorum: 'DOIS_TERCOS', tipo: 'APROVACAO' },
    { id: 'MUDAR_DESTINACAO', rotulo: 'Mudar destinação', quorum: 'DOIS_TERCOS', tipo: 'APROVACAO' },
    { id: 'NOVO_PAVIMENTO', rotulo: 'Novo pavimento', quorum: 'UNANIMIDADE', tipo: 'APROVACAO' },
    { id: 'OUTRO', rotulo: 'Outro assunto', quorum: 'MAIORIA_PRESENTES', tipo: 'APROVACAO' },
];

// ─── texto fixo (R4, CC 1.354-A §1º e §2º) ───────────────────────────────────

export const INSTRUCOES_VOTO =
    'O voto pode ser dado pelo Portal do Cliente › Condomínio › Assembleias, com e-mail e senha, '
    + 'desde esta convocação até o encerramento da assembleia, e pode ser alterado até lá; vale o último '
    + 'voto registrado da unidade, pelo portal ou na reunião. A administração não responde por falhas de '
    + 'equipamento ou de conexão dos condôminos (CC art. 1.354-A §2º).';

/** Só no edital (documento formal): instalação e impedimento. */
const REGRA_INSTALACAO =
    'Em 1ª convocação, a assembleia se instala com condôminos que representem pelo menos metade das '
    + 'frações ideais; em 2ª convocação, com qualquer número (CC arts. 1.352 e 1.353).';
const REGRA_IMPEDIMENTO =
    'A unidade com cota condominial vencida e não paga no momento do voto não vota nem conta como presente '
    + '(CC art. 1.335, III).';

// ─── formatação ──────────────────────────────────────────────────────────────

const DATA_HORA_SP = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** '10/12/2026 às 19:00' no fuso de Brasília, qualquer que seja o fuso da máquina. */
export function dataHoraBrasilia(iso: string): string {
    const p = Object.fromEntries(DATA_HORA_SP.formatToParts(new Date(iso)).map(x => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
}

const dataHoraOu = (iso: string | null | undefined, falta = 'a definir'): string =>
    iso ? dataHoraBrasilia(iso) : falta;

const PCT = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Peso em % do total da assembleia: percentualDoTotal(0.00125, 0.01) = '12,50%'. */
export function percentualDoTotal(fracao: number, total: number): string {
    const v = total > 0 ? (fracao / total) * 100 : 0;
    return `${PCT.format(v)}%`;
}

const texto = (v: string | null | undefined): string | null => {
    const t = (v ?? '').trim();
    return t === '' ? null : t;
};

const ou = (v: string | null | undefined, falta = '—'): string => texto(v) ?? falta;

/** "por Fulano" / "pelo gestor" / "pelo síndico" — nunca "por null". */
function porQuem(autor: AutorAssembleia | null | undefined): string | null {
    if (!autor) return null;
    const nome = texto(autor.nome);
    if (nome) return `por ${nome}`;
    return `pelo ${ROTULO_PAPEL[autor.papel] ?? 'gestor'}`;
}

const ordenar = (itens: ItemAssembleia[]) => [...itens].sort((a, b) => a.ordem - b.ordem);

// ─── convocação e cancelamento (corpo do aviso do mural) ─────────────────────

/** Corpo do aviso ASSEMBLEIA (R4): tipo, 1ª e 2ª convocação, local, link, pauta e instruções. */
export function textoConvocacao(a: Assembleia, itens: ItemAssembleia[], condominioNome: string): string {
    const tipo = ROTULO_TIPO[a.tipo];
    const linhas: string[] = [];
    linhas.push(`${tipo} (${a.tipo}) — ${a.titulo}`);
    linhas.push('');
    linhas.push(
        `Ficam os condôminos do ${ou(condominioNome, 'condomínio')} convocados para a ${tipo}, `
        + `em 1ª convocação em ${dataHoraOu(a.primeiraConvocacaoEm)} e, não havendo quórum, `
        + `em 2ª convocação em ${dataHoraOu(a.segundaConvocacaoEm)}.`);
    linhas.push('');
    linhas.push(`1ª convocação: ${dataHoraOu(a.primeiraConvocacaoEm)}`);
    linhas.push(`2ª convocação: ${dataHoraOu(a.segundaConvocacaoEm)}`);
    if (texto(a.local)) linhas.push(`Local: ${texto(a.local)}`);
    if (texto(a.linkTransmissao)) linhas.push(`Transmissão: ${texto(a.linkTransmissao)}`);
    linhas.push('');
    linhas.push('Pauta:');
    ordenar(itens).forEach((it, i) => {
        linhas.push(`${i + 1}. ${it.titulo}${texto(it.descricao) ? ` — ${texto(it.descricao)}` : ''}`);
        if (it.tipo === 'ESCOLHA' && it.opcoes?.length) linhas.push(`   Opções: ${it.opcoes.join(', ')}`);
        linhas.push(`   Quórum: ${ROTULO_QUORUM[it.quorum]}`);
    });
    linhas.push('');
    linhas.push(INSTRUCOES_VOTO);
    return linhas.join('\n');
}

/** Corpo do aviso de cancelamento (R10). */
export function textoCancelamento(a: Assembleia, motivo: string): string {
    const m = (motivo ?? '').trim();
    const comPonto = /[.!?]$/.test(m) ? m : `${m}.`;
    return `A assembleia ${a.tipo} "${a.titulo}" marcada para ${dataHoraOu(a.primeiraConvocacaoEm)} `
        + `foi cancelada. Motivo: ${comPonto}`;
}

// ─── edital ──────────────────────────────────────────────────────────────────

export interface CondominioDoDocumento {
    nome: string;
    cnpj: string | null;
}

export interface LinhaPauta {
    numero: number;
    titulo: string;
    descricao: string | null;
    tipo: string;
    /** Só ESCOLHA; vazio na aprovação (a cédula é Sim · Não · Abstenção). */
    opcoes: string[];
    quorum: string;
    regraQuorum: string;
}

export interface EditalModelo {
    titulo: string;
    condominio: { nome: string; cnpj: string };
    tipo: string;
    tituloAssembleia: string;
    primeiraConvocacao: string;
    segundaConvocacao: string;
    local: string;
    link: string | null;
    abertura: string;
    pauta: LinhaPauta[];
    instrucoes: string;
    regras: string[];
    emitidoEm: string | null;
    assinatura: string;
}

const cnpjOu = (v: string | null | undefined): string => (texto(v) ? fmtCnpj(v) : 'não informado');

export function montarEdital(a: Assembleia, itens: ItemAssembleia[], condominio: CondominioDoDocumento): EditalModelo {
    const tipo = ROTULO_TIPO[a.tipo];
    const nome = ou(condominio.nome, 'Condomínio');
    return {
        titulo: `Edital de convocação — ${tipo}`,
        condominio: { nome, cnpj: cnpjOu(condominio.cnpj) },
        tipo,
        tituloAssembleia: a.titulo,
        primeiraConvocacao: dataHoraOu(a.primeiraConvocacaoEm),
        segundaConvocacao: dataHoraOu(a.segundaConvocacaoEm),
        local: ou(a.local, texto(a.linkTransmissao) ? 'somente por transmissão' : 'a definir'),
        link: texto(a.linkTransmissao),
        abertura:
            `Ficam os condôminos do ${nome} convocados para a ${tipo} — ${a.titulo}, em 1ª convocação em `
            + `${dataHoraOu(a.primeiraConvocacaoEm)} e, não havendo quórum, em 2ª convocação em `
            + `${dataHoraOu(a.segundaConvocacaoEm)}, para deliberar sobre a seguinte ordem do dia:`,
        pauta: ordenar(itens).map((it, i) => ({
            numero: i + 1,
            titulo: it.titulo,
            descricao: texto(it.descricao),
            tipo: ROTULO_TIPO_ITEM[it.tipo],
            opcoes: it.tipo === 'ESCOLHA' ? [...(it.opcoes ?? [])] : [],
            quorum: ROTULO_QUORUM[it.quorum],
            regraQuorum: REGRA_QUORUM[it.quorum],
        })),
        instrucoes: INSTRUCOES_VOTO,
        regras: [REGRA_INSTALACAO, REGRA_IMPEDIMENTO],
        emitidoEm: a.convocadaEm ? dataHoraBrasilia(a.convocadaEm) : null,
        assinatura: `A administração do ${nome}`,
    };
}

// ─── ata (R9) ────────────────────────────────────────────────────────────────

export interface LinhaPresencaAta {
    unidade: string;
    nome: string;
    peso: string;
    /** 'sala' | 'procurador: <nome>' | 'portal' | 'sala e portal' | 'procurador: <nome> e portal'. */
    forma: string;
}

export interface OpcaoApuradaAta {
    opcao: string;
    percentual: string;
    unidades: number;
}

export interface ItemAta {
    numero: number;
    titulo: string;
    tipo: string;
    quorumExigido: string;
    opcoes: OpcaoApuradaAta[];
    semVoto: { percentual: string; unidades: number };
    /** Aprovação: rótulo do resultado. Escolha com vencedora: 'Vencedora: <opção>'. */
    resultado: string;
    vencedora: string | null;
    deliberacao: string | null;
}

export interface LinhaAnexoAta {
    item: number;
    itemTitulo: string;
    unidade: string;
    nome: string;
    voto: string;
    /** 'portal' | 'sala' | '—' (sem voto). */
    origem: string;
    votadoEm: string | null;
}

export interface MedidaPresenca {
    rotulo: string;
    percentual: string;
    unidades: number;
    totalUnidades: number;
    explicacao: string;
}

export interface AtaModelo {
    titulo: string;
    cabecalho: {
        condominio: string;
        cnpj: string;
        tipo: string;
        tituloAssembleia: string;
        /** Data e hora em que se instalou (a reunião). */
        dataHora: string;
        local: string;
        link: string | null;
        /** '2ª convocação (marcada para 10/12/2026 às 19:30)'. */
        convocacao: string;
        presidente: string;
        secretario: string;
    };
    /** 'Instalada em 2ª convocação em … por …' — nunca "null". */
    instalacao: string;
    editalConfirmacao: string;
    quorumInstalacao: MedidaPresenca;
    participaramDaVotacao: MedidaPresenca;
    presenca: LinhaPresencaAta[];
    ausentes: { unidade: string; nome: string }[];
    impedidas: { unidade: string; motivo: string }[];
    procuracoes: { unidade: string; procurador: string; documentoId: string | null }[];
    ordemDoDia: string[];
    itens: ItemAta[];
    observacaoGeral: string | null;
    encerramento: string;
    assinaturas: { papel: string; nome: string }[];
    /** Voto de cada unidade em cada item (uma linha por unidade × item). */
    anexo: LinhaAnexoAta[];
}

const rotuloUnidade = (u: Pick<RetratoUnidade, 'rotulo' | 'unitId'> | undefined, unitId: string): string =>
    ou(u?.rotulo, `Unidade ${unitId.slice(0, 8)}`);

function formaDaPresenca(u: RetratoUnidade): string | null {
    const sala = u.presenca === 'PRESENCIAL' ? 'sala'
        : u.presenca === 'PROCURADOR' ? `procurador: ${ou(u.procurador, 'nome não informado')}`
            : null;
    if (sala && u.votouPeloPortal) return `${sala} e portal`;
    if (sala) return sala;
    if (u.votouPeloPortal) return 'portal';
    return null;
}

const ORDEM_APROVACAO = ['SIM', 'NAO', 'ABSTENCAO'];

export function montarAta(retrato: Retrato, a: Assembleia, condominio: CondominioDoDocumento): AtaModelo {
    const c = retrato.cabecalho;
    const total = retrato.total;
    const tipoAss = c.tipo ?? a.tipo;
    const tipo = ROTULO_TIPO[tipoAss];
    const totalUnidades = retrato.unidades.length;
    const porUnidade = new Map(retrato.unidades.map(u => [u.unitId, u]));

    const convocacaoN = c.convocacao ?? a.instaladaConvocacao;
    const marcada = convocacaoN === 1 ? c.primeiraConvocacaoEm : convocacaoN === 2 ? c.segundaConvocacaoEm : null;
    const convocacao = convocacaoN
        ? `${convocacaoN}ª convocação${marcada ? ` (marcada para ${dataHoraBrasilia(marcada)})` : ''}`
        : 'não informada';
    const instaladaEm = c.instaladaEm ?? a.instaladaEm;
    const quem = porQuem(c.instaladaPor);

    // Confirmação de entrega do edital (R4) — autor e data gravados em Instalar.
    const editalEm = c.editalConfirmadoPor?.em ?? c.editalEntregueEm;
    const quemEdital = porQuem(c.editalConfirmadoPor);
    const editalConfirmacao = editalEm
        ? `Entrega do edital a todas as unidades confirmada${quemEdital ? ` ${quemEdital}` : ''} em ${dataHoraBrasilia(editalEm)}.`
        : 'Entrega do edital a todas as unidades: confirmação não registrada.';

    // Duas presenças: instalação (sem impedidas, gravada e nunca refeita) × votação.
    const qi = c.quorumInstalacao;
    const quorumInstalacao: MedidaPresenca = {
        rotulo: 'Quórum de instalação (presentes aptos)',
        percentual: percentualDoTotal(qi?.presentesFracao ?? 0, qi?.total ?? total),
        unidades: qi?.presentesUnidades ?? 0,
        totalUnidades,
        explicacao: 'Unidades presentes na sala, por procurador ou com voto pelo portal no instante da instalação, '
            + 'sem as impedidas (CC art. 1.335, III).',
    };
    const participaramDaVotacao: MedidaPresenca = {
        rotulo: 'Participaram da votação',
        percentual: percentualDoTotal(retrato.presentesFracao, total),
        unidades: retrato.presentesUnidades,
        totalUnidades,
        explicacao: 'Unidades com presença registrada ou voto pelo portal até o encerramento, inclusive as que '
            + 'estavam impedidas na instalação.',
    };

    const presenca: LinhaPresencaAta[] = [];
    const ausentes: AtaModelo['ausentes'] = [];
    for (const u of retrato.unidades) {
        const forma = formaDaPresenca(u);
        const unidade = rotuloUnidade(u, u.unitId);
        const nome = ou(u.proprietario);
        if (forma) presenca.push({ unidade, nome, peso: percentualDoTotal(u.fracao, total), forma });
        else ausentes.push({ unidade, nome });
    }

    const impedidasFonte = retrato.impedidasNaInstalacao?.length
        ? retrato.impedidasNaInstalacao : (qi?.impedidas ?? []);
    const impedidas = impedidasFonte.map(i => ({
        unidade: ou(i.rotulo, rotuloUnidade(porUnidade.get(i.unitId), i.unitId)),
        motivo: ou(i.motivo, 'cota vencida'),
    }));

    const procuracoes = retrato.unidades
        .filter(u => u.presenca === 'PROCURADOR')
        .map(u => ({
            unidade: rotuloUnidade(u, u.unitId),
            procurador: ou(u.procurador, 'nome não informado'),
            documentoId: u.procuracaoDocumentoId ?? null,
        }));

    const itensOrdenados = [...retrato.itens].sort((x, y) => x.ordem - y.ordem);

    const itens: ItemAta[] = itensOrdenados.map((it, i) => {
        const chaves = Object.keys(it.porOpcao);
        const ordem = it.tipo === 'APROVACAO'
            ? [...ORDEM_APROVACAO, ...chaves.filter(k => !ORDEM_APROVACAO.includes(k))]
            // Escolha: o jsonb não guarda a ordem cadastrada — da mais votada para a
            // menos (empate pelo nome), Abstenção por último.
            : [
                ...chaves.filter(k => k !== 'ABSTENCAO').sort((x, y) =>
                    (it.porOpcao[y].fracao - it.porOpcao[x].fracao) || x.localeCompare(y, 'pt-BR')),
                'ABSTENCAO',
            ];
        const opcoes = ordem.map(op => {
            const s = it.porOpcao[op] ?? { fracao: 0, unidades: 0 };
            return { opcao: rotuloOpcao(op), percentual: percentualDoTotal(s.fracao, total), unidades: s.unidades };
        });
        const somaFr = Object.values(it.porOpcao).reduce((s, o) => s + o.fracao, 0);
        const somaUn = Object.values(it.porOpcao).reduce((s, o) => s + o.unidades, 0);
        const vencedora = it.tipo === 'ESCOLHA' ? (it.vencedora ?? null) : null;
        return {
            numero: i + 1,
            titulo: it.titulo,
            tipo: ROTULO_TIPO_ITEM[it.tipo],
            quorumExigido: `${ROTULO_QUORUM[it.quorum]} — ${REGRA_QUORUM[it.quorum]}`,
            opcoes,
            semVoto: {
                percentual: percentualDoTotal(Math.max(total - somaFr, 0), total),
                unidades: Math.max(totalUnidades - somaUn, 0),
            },
            resultado: vencedora ? `Vencedora: ${vencedora}` : ROTULO_RESULTADO[it.resultado],
            vencedora,
            deliberacao: texto(retrato.deliberacoes?.[it.itemId]),
        };
    });

    const votoDe = new Map(retrato.votos.map(v => [`${v.itemId}|${v.unitId}`, v]));
    const anexo: LinhaAnexoAta[] = [];
    itensOrdenados.forEach((it, i) => {
        for (const u of retrato.unidades) {
            const v = votoDe.get(`${it.itemId}|${u.unitId}`);
            anexo.push({
                item: i + 1,
                itemTitulo: it.titulo,
                unidade: rotuloUnidade(u, u.unitId),
                nome: ou(u.proprietario),
                voto: v ? rotuloOpcao(v.opcao) : 'Sem voto',
                origem: v ? ROTULO_ORIGEM[v.origem] : '—',
                votadoEm: v ? dataHoraBrasilia(v.votadoEm) : null,
            });
        }
    });

    const presidente = ou(c.presidente ?? a.presidenteNome);
    const secretario = ou(c.secretario ?? a.secretarioNome);

    return {
        titulo: `Ata da ${tipo}`,
        cabecalho: {
            condominio: ou(c.condominio ?? condominio.nome, 'Condomínio'),
            cnpj: cnpjOu(c.condominioCnpj ?? condominio.cnpj),
            tipo,
            tituloAssembleia: c.titulo ?? a.titulo,
            dataHora: dataHoraOu(instaladaEm, 'não informada'),
            local: ou(c.local ?? a.local, texto(c.linkTransmissao ?? a.linkTransmissao) ? 'somente por transmissão' : '—'),
            link: texto(c.linkTransmissao ?? a.linkTransmissao),
            convocacao,
            presidente,
            secretario,
        },
        instalacao: `Instalada em ${convocacao}`
            + `${instaladaEm ? ` em ${dataHoraBrasilia(instaladaEm)}` : ''}${quem ? ` ${quem}` : ''}, `
            + `com presidente ${presidente} e secretário ${secretario}.`,
        editalConfirmacao,
        quorumInstalacao,
        participaramDaVotacao,
        presenca,
        ausentes,
        impedidas,
        procuracoes,
        ordemDoDia: itensOrdenados.map((it, i) => `${i + 1}. ${it.titulo}`),
        itens,
        observacaoGeral: texto(c.observacaoGeral ?? a.observacaoGeral),
        encerramento:
            `Nada mais havendo a tratar, a assembleia foi encerrada em ${dataHoraOu(c.encerradaEm, 'data não informada')}. `
            + 'A apuração acima é o registro gravado pelo sistema no encerramento, e esta ata vai assinada pelo '
            + 'presidente e pelo secretário.',
        assinaturas: [
            { papel: 'Presidente', nome: presidente },
            { papel: 'Secretário', nome: secretario },
        ],
        anexo,
    };
}
