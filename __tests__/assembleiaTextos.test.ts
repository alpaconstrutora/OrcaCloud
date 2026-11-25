/**
 * Textos e modelos da assembleia (Task A5): convocação (corpo do aviso), cancelamento,
 * edital e ata. Modelo puro — o PDF (A6) só desenha o que sai daqui.
 *
 * O que estes testes travam:
 *   • fuso: 19h de Brasília não vira 22h nem o dia anterior (o CI roda em UTC);
 *   • peso em % do TOTAL da assembleia (Bella Vista soma 0,01 → 1/8 = 12,50%);
 *   • as duas "presenças" com rótulos diferentes (instalação exclui impedidas;
 *     a apuração conta quem participou da votação, inclusive impedida);
 *   • a ata imprime quem confirmou a entrega do edital e quando (R4);
 *   • nome nulo de quem instalou nunca vira "null".
 */
import { describe, it, expect } from 'vitest';
import {
    ASSUNTOS_COMUNS, ROTULO_OPCAO, ROTULO_QUORUM, ROTULO_RESULTADO, ROTULO_STATUS,
    INSTRUCOES_VOTO, dataHoraBrasilia, percentualDoTotal, textoConvocacao, textoCancelamento,
    montarEdital, montarAta,
} from '../utils/assembleiaTextos';
import type { Assembleia, ItemAssembleia, Retrato } from '../services/condominioAssembleiaService';

// ─── fixtures ────────────────────────────────────────────────────────────────

const assembleia = (extra: Partial<Assembleia> = {}): Assembleia => ({
    id: 'a1', organizationId: 'o1', empreendimentoId: 'e1', tipo: 'AGO',
    titulo: 'Prestação de contas 2026', local: 'Salão de festas', linkTransmissao: 'https://meet.exemplo/abc',
    primeiraConvocacaoEm: '2026-12-10T22:00:00Z', segundaConvocacaoEm: '2026-12-10T22:30:00Z',
    status: 'CONVOCADA', convocadaEm: '2026-11-25T15:00:00Z', avisoId: 'av1', editalEntregueEm: null,
    instaladaEm: null, instaladaConvocacao: null, quorumInstalacao: null, presidenteNome: null,
    secretarioNome: null, observacaoGeral: null, encerradaEm: null, retrato: null, ataDocumentoId: null,
    canceladaEm: null, motivoCancelamento: null, createdBy: null,
    createdAt: '2026-11-20T12:00:00Z', updatedAt: '2026-11-20T12:00:00Z',
    ...extra,
});

const itens: ItemAssembleia[] = [
    {
        id: 'i2', assembleiaId: 'a1', ordem: 2, titulo: 'Eleição do síndico', descricao: null,
        tipo: 'ESCOLHA', opcoes: ['Ana', 'Bruno'], quorum: 'MAIORIA_PRESENTES', assunto: 'ELEGER_SINDICO', deliberacao: null,
    },
    {
        id: 'i1', assembleiaId: 'a1', ordem: 1, titulo: 'Aprovação das contas', descricao: 'Balancete de 2026',
        tipo: 'APROVACAO', opcoes: null, quorum: 'MAIORIA_PRESENTES', assunto: 'APROVAR_CONTAS', deliberacao: null,
    },
    {
        id: 'i3', assembleiaId: 'a1', ordem: 3, titulo: 'Cobertura da piscina', descricao: null,
        tipo: 'APROVACAO', opcoes: null, quorum: 'DOIS_TERCOS', assunto: 'OBRA_VOLUPTUARIA', deliberacao: null,
    },
];

// 8 unidades de 0,00125 (soma 0,01 — Bella Vista).
const F = 0.00125;
const unidade = (n: number, extra: Partial<Retrato['unidades'][number]> = {}): Retrato['unidades'][number] => ({
    unitId: `u${n}`, rotulo: `Apto ${n}0${n}`, proprietario: `Proprietário ${n}`, fracao: F,
    presenca: null, procurador: null, procuracaoDocumentoId: null, presencaEm: null,
    votouPeloPortal: false, impedidaNaInstalacao: false, ...extra,
});

const retrato = (cab: Partial<Retrato['cabecalho']> = {}): Retrato => ({
    total: 0.01,
    // participaram da votação: u1..u6 + u7 (impedida que votou pelo portal) = 7
    presentesFracao: 7 * F,
    presentesUnidades: 7,
    itens: [
        {
            itemId: 'i1', ordem: 1, titulo: 'Aprovação das contas', tipo: 'APROVACAO', quorum: 'MAIORIA_PRESENTES',
            porOpcao: { SIM: { fracao: 4 * F, unidades: 4 }, NAO: { fracao: F, unidades: 1 }, ABSTENCAO: { fracao: F, unidades: 1 } },
            resultado: 'APROVADO', vencedora: null,
        },
        {
            itemId: 'i2', ordem: 2, titulo: 'Eleição do síndico', tipo: 'ESCOLHA', quorum: 'MAIORIA_PRESENTES',
            porOpcao: { Ana: { fracao: 2 * F, unidades: 2 }, Bruno: { fracao: 3 * F, unidades: 3 }, ABSTENCAO: { fracao: F, unidades: 1 } },
            resultado: 'APROVADO', vencedora: 'Bruno',
        },
        {
            itemId: 'i3', ordem: 3, titulo: 'Cobertura da piscina', tipo: 'APROVACAO', quorum: 'DOIS_TERCOS',
            porOpcao: { SIM: { fracao: 4 * F, unidades: 4 }, NAO: { fracao: 2 * F, unidades: 2 }, ABSTENCAO: { fracao: 0, unidades: 0 } },
            resultado: 'QUORUM_NAO_ATINGIDO', vencedora: null,
        },
    ],
    cabecalho: {
        assembleiaId: 'a1', empreendimentoId: 'e1', condominio: 'Residencial Bella Vista',
        condominioCnpj: '12345678000190', tipo: 'AGO', titulo: 'Prestação de contas 2026',
        local: 'Salão de festas', linkTransmissao: 'https://meet.exemplo/abc',
        primeiraConvocacaoEm: '2026-12-10T22:00:00Z', segundaConvocacaoEm: '2026-12-10T22:30:00Z',
        convocadaEm: '2026-11-25T15:00:00Z', editalEntregueEm: '2026-12-10T22:31:00Z',
        instaladaEm: '2026-12-10T22:32:00Z', convocacao: 2, presidente: 'Carlos Lima', secretario: 'Daniela Souza',
        instaladaPor: { id: 'p1', papel: 'GESTOR', em: '2026-12-10T22:32:00Z', nome: 'Gestora Fernanda' },
        editalConfirmadoPor: { id: 'p1', papel: 'GESTOR', em: '2026-12-10T22:31:00Z', nome: 'Gestora Fernanda' },
        quorumInstalacao: {
            convocacao: 2, total: 0.01, presentesFracao: 6 * F, presentesUnidades: 6,
            impedidas: [{ unitId: 'u7', rotulo: 'Apto 707', motivo: 'Cota de 10/2026 vencida em 10/11/2026' }],
            em: '2026-12-10T22:32:00Z',
        },
        observacaoGeral: 'Sem mais.', encerradaEm: '2026-12-11T00:15:00Z', encerradaPor: 'p1', encerradaPorPapel: 'GESTOR',
        ...cab,
    },
    deliberacoes: { i1: 'Contas aprovadas com ressalva do item 4.' },
    unidades: [
        unidade(1, { presenca: 'PRESENCIAL' }),
        unidade(2, { presenca: 'PROCURADOR', procurador: 'Maria Procuradora', procuracaoDocumentoId: 'd2' }),
        unidade(3, { votouPeloPortal: true }),
        unidade(4, { votouPeloPortal: true }),
        unidade(5, { presenca: 'PRESENCIAL' }),
        unidade(6, { presenca: 'PRESENCIAL', votouPeloPortal: true }),
        unidade(7, { votouPeloPortal: true, impedidaNaInstalacao: true }),
        unidade(8),
    ],
    votos: [
        { itemId: 'i1', unitId: 'u1', opcao: 'SIM', origem: 'PRESENCIAL', votadoEm: '2026-12-10T23:00:00Z', clientId: null, lancadoPor: 'p1' },
        { itemId: 'i1', unitId: 'u2', opcao: 'NAO', origem: 'PRESENCIAL', votadoEm: '2026-12-10T23:00:00Z', clientId: null, lancadoPor: 'p1' },
        { itemId: 'i1', unitId: 'u3', opcao: 'SIM', origem: 'PORTAL', votadoEm: '2026-12-01T12:00:00Z', clientId: 'c3', lancadoPor: null },
        { itemId: 'i2', unitId: 'u3', opcao: 'Bruno', origem: 'PORTAL', votadoEm: '2026-12-01T12:00:00Z', clientId: 'c3', lancadoPor: null },
    ],
    impedidasNaInstalacao: [{ unitId: 'u7', rotulo: 'Apto 707', motivo: 'Cota de 10/2026 vencida em 10/11/2026' }],
});

const condominio = { nome: 'Residencial Bella Vista', cnpj: '12345678000190' };

/** Todo texto (string) dentro do modelo, para conferir que nenhum diz "null". */
const textosDe = (v: unknown): string[] =>
    typeof v === 'string' ? [v]
        : Array.isArray(v) ? v.flatMap(textosDe)
            : v && typeof v === 'object' ? Object.values(v).flatMap(textosDe) : [];

// ─── básicos ─────────────────────────────────────────────────────────────────

describe('rótulos e assuntos comuns', () => {
    it('ROTULO_OPCAO', () => {
        expect(ROTULO_OPCAO.SIM).toBe('Sim');
        expect(ROTULO_OPCAO.NAO).toBe('Não');
        expect(ROTULO_OPCAO.ABSTENCAO).toBe('Abstenção');
    });

    it('rótulos de quórum, resultado e status cobrem todo valor', () => {
        for (const q of ['MAIORIA_PRESENTES', 'MAIORIA_ABSOLUTA', 'DOIS_TERCOS', 'UNANIMIDADE'] as const) {
            expect(ROTULO_QUORUM[q]).toBeTruthy();
        }
        expect(ROTULO_RESULTADO.QUORUM_NAO_ATINGIDO).toBe('Quórum não atingido');
        for (const r of ['APROVADO', 'REJEITADO', 'SEM_DECISAO'] as const) expect(ROTULO_RESULTADO[r]).toBeTruthy();
        for (const s of ['RASCUNHO', 'CONVOCADA', 'INSTALADA', 'ENCERRADA', 'CANCELADA'] as const) {
            expect(ROTULO_STATUS[s]).toBeTruthy();
        }
    });

    it('ASSUNTOS_COMUNS sugere o quórum da R8', () => {
        const q = (rotulo: string) => ASSUNTOS_COMUNS.find(a => a.rotulo === rotulo);
        expect(q('Aprovar contas')?.quorum).toBe('MAIORIA_PRESENTES');
        expect(q('Orçamento')?.quorum).toBe('MAIORIA_PRESENTES');
        expect(q('Eleger síndico')).toMatchObject({ quorum: 'MAIORIA_PRESENTES', tipo: 'ESCOLHA' });
        expect(q('Obra útil')?.quorum).toBe('MAIORIA_ABSOLUTA');
        expect(q('Destituir síndico')?.quorum).toBe('MAIORIA_ABSOLUTA');
        for (const r of ['Obra voluptuária', 'Acréscimo às partes comuns', 'Alterar convenção', 'Mudar destinação']) {
            expect(q(r)?.quorum).toBe('DOIS_TERCOS');
        }
        expect(q('Novo pavimento')?.quorum).toBe('UNANIMIDADE');
        expect(q('Outro assunto')?.quorum).toBe('MAIORIA_PRESENTES');
        expect(new Set(ASSUNTOS_COMUNS.map(a => a.id)).size).toBe(ASSUNTOS_COMUNS.length);
    });
});

describe('dataHoraBrasilia', () => {
    it('UTC → Brasília', () => {
        expect(dataHoraBrasilia('2026-12-10T22:00:00Z')).toBe('10/12/2026 às 19:00');
    });
    it('-03:00 não vira 22h nem o dia anterior', () => {
        expect(dataHoraBrasilia('2026-12-10T19:00:00-03:00')).toBe('10/12/2026 às 19:00');
        expect(dataHoraBrasilia('2026-12-10T00:30:00-03:00')).toBe('10/12/2026 às 00:30');
    });
});

describe('percentualDoTotal', () => {
    it('Bella Vista: 0,00125 de 0,01 = 12,50%', () => {
        expect(percentualDoTotal(0.00125, 0.01)).toBe('12,50%');
    });
    it('total zero não divide por zero', () => {
        expect(percentualDoTotal(0, 0)).toBe('0,00%');
    });
});

// ─── convocação e cancelamento ───────────────────────────────────────────────

describe('textoConvocacao', () => {
    const t = textoConvocacao(assembleia(), itens, 'Residencial Bella Vista');

    it('traz as duas datas, local, link e o condomínio', () => {
        expect(t).toContain('10/12/2026 às 19:00');
        expect(t).toContain('10/12/2026 às 19:30');
        expect(t).toContain('Salão de festas');
        expect(t).toContain('https://meet.exemplo/abc');
        expect(t).toContain('Residencial Bella Vista');
        expect(t).toContain('Assembleia Geral Ordinária');
    });

    it('pauta numerada pela ordem, com o quórum', () => {
        const p1 = t.indexOf('1. Aprovação das contas');
        const p2 = t.indexOf('2. Eleição do síndico');
        const p3 = t.indexOf('3. Cobertura da piscina');
        expect(p1).toBeGreaterThan(-1);
        expect(p2).toBeGreaterThan(p1);
        expect(p3).toBeGreaterThan(p2);
        expect(t).toContain('Ana, Bruno');
        expect(t).toContain(ROTULO_QUORUM.DOIS_TERCOS);
    });

    it('parágrafo fixo de instruções (CC art. 1.354-A §2º)', () => {
        expect(t).toContain('art. 1.354-A');
        expect(t).toContain(INSTRUCOES_VOTO);
        expect(INSTRUCOES_VOTO).toBe(
            'O voto pode ser dado pelo Portal do Cliente › Condomínio › Assembleias, com e-mail e senha, '
            + 'desde esta convocação até o encerramento da assembleia, e pode ser alterado até lá; vale o último '
            + 'voto registrado da unidade, pelo portal ou na reunião. A administração não responde por falhas de '
            + 'equipamento ou de conexão dos condôminos (CC art. 1.354-A §2º).');
    });

    it('nunca imprime "null"', () => {
        const s = textoConvocacao(assembleia({ local: null, linkTransmissao: null }), itens, 'X');
        expect(s).not.toContain('null');
        expect(s).not.toContain('undefined');
    });
});

describe('textoCancelamento', () => {
    it('tipo, título, data da 1ª e motivo', () => {
        const t = textoCancelamento(assembleia(), 'Falta de luz no salão.');
        expect(t).toBe('A assembleia AGO "Prestação de contas 2026" marcada para 10/12/2026 às 19:00 foi cancelada. '
            + 'Motivo: Falta de luz no salão.');
    });
    it('motivo sem ponto final ganha o ponto', () => {
        expect(textoCancelamento(assembleia(), '  chuva  ')).toMatch(/Motivo: chuva\.$/);
    });
});

// ─── edital ──────────────────────────────────────────────────────────────────

describe('montarEdital', () => {
    const e = montarEdital(assembleia(), itens, condominio);

    it('condomínio com CNPJ formatado e as duas convocações', () => {
        expect(e.condominio.nome).toBe('Residencial Bella Vista');
        expect(e.condominio.cnpj).toBe('12.345.678/0001-90');
        expect(e.primeiraConvocacao).toBe('10/12/2026 às 19:00');
        expect(e.segundaConvocacao).toBe('10/12/2026 às 19:30');
    });

    it('pauta em ordem, com quórum e opções', () => {
        expect(e.pauta.map(p => p.numero)).toEqual([1, 2, 3]);
        expect(e.pauta[0].titulo).toBe('Aprovação das contas');
        expect(e.pauta[1].opcoes).toEqual(['Ana', 'Bruno']);
        expect(e.pauta[2].quorum).toBe(ROTULO_QUORUM.DOIS_TERCOS);
    });

    it('instruções do voto pelo portal', () => {
        expect(e.instrucoes).toBe(INSTRUCOES_VOTO);
    });
});

// ─── ata ─────────────────────────────────────────────────────────────────────

describe('montarAta', () => {
    const ata = montarAta(retrato(), assembleia({ status: 'ENCERRADA' }), condominio);

    it('cabeçalho: condomínio, CNPJ, convocação em que se instalou, mesa', () => {
        expect(ata.cabecalho.condominio).toBe('Residencial Bella Vista');
        expect(ata.cabecalho.cnpj).toBe('12.345.678/0001-90');
        expect(ata.cabecalho.convocacao).toContain('2ª convocação');
        expect(ata.cabecalho.presidente).toBe('Carlos Lima');
        expect(ata.cabecalho.secretario).toBe('Daniela Souza');
    });

    it('lista presença com forma "procurador: <nome>", sala e portal', () => {
        const forma = (u: string) => ata.presenca.find(p => p.unidade === u)?.forma;
        expect(forma('Apto 202')).toBe('procurador: Maria Procuradora');
        expect(forma('Apto 101')).toBe('sala');
        expect(forma('Apto 303')).toBe('portal');
        expect(forma('Apto 606')).toBe('sala e portal');
        expect(ata.presenca.find(p => p.unidade === 'Apto 101')?.nome).toBe('Proprietário 1');
        expect(ata.presenca.find(p => p.unidade === 'Apto 101')?.peso).toBe('12,50%');
    });

    it('ausentes e impedidas na instalação', () => {
        expect(ata.ausentes.map(a => a.unidade)).toEqual(['Apto 808']);
        expect(ata.impedidas).toEqual([{ unidade: 'Apto 707', motivo: 'Cota de 10/2026 vencida em 10/11/2026' }]);
    });

    it('procuração listada', () => {
        expect(ata.procuracoes).toEqual([{ unidade: 'Apto 202', procurador: 'Maria Procuradora', documentoId: 'd2' }]);
    });

    it('as duas presenças com rótulos diferentes', () => {
        expect(ata.quorumInstalacao.rotulo).toBe('Quórum de instalação (presentes aptos)');
        expect(ata.quorumInstalacao.percentual).toBe('75,00%');
        expect(ata.quorumInstalacao.unidades).toBe(6);
        expect(ata.participaramDaVotacao.rotulo).toBe('Participaram da votação');
        expect(ata.participaramDaVotacao.percentual).toBe('87,50%');
        expect(ata.participaramDaVotacao.unidades).toBe(7);
        expect(ata.quorumInstalacao.rotulo).not.toBe(ata.participaramDaVotacao.rotulo);
    });

    it('imprime a confirmação de entrega do edital (quem e quando)', () => {
        expect(ata.editalConfirmacao).toBe(
            'Entrega do edital a todas as unidades confirmada por Gestora Fernanda em 10/12/2026 às 19:31.');
    });

    it('nome nulo de quem instalou cai no papel, nunca "null"', () => {
        const a2 = montarAta(retrato({
            instaladaPor: { id: 'p1', papel: 'GESTOR', em: '2026-12-10T22:32:00Z', nome: null },
            editalConfirmadoPor: { id: 'p1', papel: 'GESTOR', em: '2026-12-10T22:31:00Z', nome: null },
        }), assembleia(), condominio);
        expect(a2.editalConfirmacao).toContain('confirmada pelo gestor em 10/12/2026 às 19:31');
        expect(a2.instalacao).toContain('pelo gestor');
        expect(textosDe(a2).filter(x => /null|undefined/.test(x))).toEqual([]);
    });

    it('ordem do dia numerada', () => {
        expect(ata.ordemDoDia).toEqual(['1. Aprovação das contas', '2. Eleição do síndico', '3. Cobertura da piscina']);
    });

    it('por item: quórum exigido, % do total e nº de unidades por opção, deliberação', () => {
        const i1 = ata.itens[0];
        expect(i1.quorumExigido).toContain(ROTULO_QUORUM.MAIORIA_PRESENTES);
        expect(i1.opcoes).toEqual([
            { opcao: 'Sim', percentual: '50,00%', unidades: 4 },
            { opcao: 'Não', percentual: '12,50%', unidades: 1 },
            { opcao: 'Abstenção', percentual: '12,50%', unidades: 1 },
        ]);
        expect(i1.semVoto).toEqual({ percentual: '25,00%', unidades: 2 });
        expect(i1.resultado).toBe('Aprovado');
        expect(i1.deliberacao).toBe('Contas aprovadas com ressalva do item 4.');
    });

    it('"Quórum não atingido" e o quórum exigido', () => {
        const i3 = ata.itens[2];
        expect(i3.resultado).toBe('Quórum não atingido');
        expect(i3.quorumExigido).toContain(ROTULO_QUORUM.DOIS_TERCOS);
        expect(i3.deliberacao).toBeNull();
    });

    it('ESCOLHA mostra a vencedora (e a Abstenção por último)', () => {
        const i2 = ata.itens[1];
        expect(i2.vencedora).toBe('Bruno');
        expect(i2.resultado).toBe('Vencedora: Bruno');
        expect(i2.opcoes.map(o => o.opcao)).toEqual(['Bruno', 'Ana', 'Abstenção']);
    });

    it('anexo tem uma linha por unidade × item, com a origem do voto que valeu', () => {
        expect(ata.anexo).toHaveLength(8 * 3);
        const l = (item: number, u: string) => ata.anexo.find(x => x.item === item && x.unidade === u);
        expect(l(1, 'Apto 303')).toMatchObject({ voto: 'Sim', origem: 'portal' });
        expect(l(1, 'Apto 202')).toMatchObject({ voto: 'Não', origem: 'sala' });
        expect(l(2, 'Apto 303')).toMatchObject({ voto: 'Bruno', origem: 'portal' });
        expect(l(3, 'Apto 808')).toMatchObject({ voto: 'Sem voto', origem: '—' });
    });

    it('encerramento e assinaturas do presidente e do secretário', () => {
        expect(ata.encerramento).toContain('10/12/2026 às 21:15');
        expect(ata.assinaturas).toEqual([
            { papel: 'Presidente', nome: 'Carlos Lima' },
            { papel: 'Secretário', nome: 'Daniela Souza' },
        ]);
        expect(ata.observacaoGeral).toBe('Sem mais.');
    });
});
