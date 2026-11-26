// @vitest-environment jsdom
/**
 * Tela da assembleia (Task A7) — components/condominio/AssembleiaDetalheView.tsx.
 * Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md (R4, R6, R7, R9, R10).
 *
 * A tela recebe `ops: OperacoesAssembleia` (a porta da condução). Aqui o `ops` é
 * falso — a regra mora no banco (A2) e lá tem os próprios testes; o que se trava
 * aqui é o que só a TELA decide:
 *   • voto na sala sobre voto do portal pede confirmação antes de chamar o banco (R7);
 *   • Instalar exige a caixa do edital e a 1ª convocação diz por que está desligada (R4/R6);
 *   • Encerrar → retrato → ata em PDF → ops.enviarDocumento (ATA, visível no portal) →
 *     vincular; upload falho deixa "Gerar ata novamente" (R9). A org do upload é de quem
 *     implementa `ops` (B2) — o gestor a prova em condominioAssembleiaService.test.ts;
 *   • Convocar mostra quem fica fora e a antecedência, e manda o texto do A5 (R1/R4);
 *   • presença por procurador sobe a procuração antes de registrar (R7) — SEMPRE
 *     OUTRO e NUNCA visível no portal (B2: a tela fixa isso, não quem implementa `ops`);
 *   • Cancelar manda o texto de cancelamento do A5 (R10).
 *
 * B2: a tela não fala com serviço nenhum por fora de `ops` (catraca no fim do arquivo) —
 * os serviços abaixo continuam espiados só para provar que NÃO são chamados.
 *
 * O PDF é o de verdade (A6): edital e ata saem do jsPDF uma vez por esta tela. Só o
 * `doc.save` é trocado (o jsdom não baixa arquivo).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const { uploadDocumento, listAvisos, listDocumentos, abrirDocumento, listAllUnitsForEmpreendimento, salvos,
    salvarRascunho, salvarItens } = vi.hoisted(() => ({
    salvarRascunho: vi.fn(),
    salvarItens: vi.fn(),
    uploadDocumento: vi.fn(),
    listAvisos: vi.fn(),
    listDocumentos: vi.fn(),
    abrirDocumento: vi.fn(),
    listAllUnitsForEmpreendimento: vi.fn(),
    salvos: [] as { nome: string }[],
}));

vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../services/condominioComunicacaoService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../services/condominioComunicacaoService')>()),
    condominioComunicacaoService: { uploadDocumento, listAvisos, listDocumentos, abrirDocumento },
}));
// A gaveta de rascunho grava pela tabela (serviço); o resto do módulo (ErroAssembleia,
// operacoesDoGestor) é o real.
vi.mock('../services/condominioAssembleiaService', async (importOriginal) => {
    const orig = await importOriginal<typeof import('../services/condominioAssembleiaService')>();
    return { ...orig, condominioAssembleiaService: { ...orig.condominioAssembleiaService, salvarRascunho, salvarItens } };
});
vi.mock('../services/empreendimentoService', () => ({
    empreendimentoService: { listAllUnitsForEmpreendimento },
}));
// doc.save é da INSTÂNCIA do jsPDF (como em assembleiaPdf.test.ts): subclasse guarda o nome.
vi.mock('jspdf', async (importOriginal) => {
    const orig = await importOriginal<typeof import('jspdf')>();
    class jsPDF extends orig.jsPDF {
        constructor(...args: any[]) {
            super(...(args as []));
            (this as any).save = (nome: string) => { salvos.push({ nome }); };
        }
    }
    return { ...orig, jsPDF, default: jsPDF };
});
// O PDF é o real; o espião só deixa conferir que a tela o chamou.
vi.mock('../services/assembleiaPdf', async (importOriginal) => {
    const orig = await importOriginal<typeof import('../services/assembleiaPdf')>();
    return { ...orig, gerarAtaPdf: vi.fn(orig.gerarAtaPdf), baixarEditalPdf: vi.fn(orig.baixarEditalPdf) };
});

import { ConfirmProvider } from '../components/ui/confirm';
import AssembleiaDetalheView from '../components/condominio/AssembleiaDetalheView';
import AssembleiaSheet from '../components/condominio/AssembleiaSheet';
import { IdentificacaoSecao } from '../components/condominio/assembleia/SecoesDaAssembleia';
import { ErroAssembleia } from '../services/condominioAssembleiaService';
import { gerarAtaPdf, baixarEditalPdf } from '../services/assembleiaPdf';
import { textoCancelamento, textoConvocacao } from '../utils/assembleiaTextos';
import type {
    Apuracao, Assembleia, AssembleiaCarregada, ItemAssembleia, OperacoesAssembleia, Retrato,
    UnidadeNaAssembleia, VotoAssembleia,
} from '../services/condominioAssembleiaService';
import type { Empreendimento } from '../types/empreendimento';

// ─── fixture: 8 unidades de 0,00125 (soma 0,01, como o Bella Vista) ───────────

const E = {
    id: 'emp1', organization_id: 'org-construtora', condominio_org_id: 'org-condo',
    name: 'Bella Vista', code: 'BV',
    condominio_razao_social: 'Condomínio Residencial Bella Vista', condominio_cnpj: '12345678000190',
} as unknown as Empreendimento;
const NOME_CONDOMINIO = 'Condomínio Residencial Bella Vista';

const HORA = 3600_000;
const agoraMais = (ms: number) => new Date(Date.now() + ms).toISOString();

function assembleia(over: Partial<Assembleia> = {}): Assembleia {
    return {
        id: 'a1', organizationId: 'org-condo', empreendimentoId: 'emp1', tipo: 'AGO', titulo: 'AGO 2026',
        local: 'Salão de festas', linkTransmissao: null,
        primeiraConvocacaoEm: agoraMais(-HORA), segundaConvocacaoEm: agoraMais(-HORA / 2),
        status: 'CONVOCADA', convocadaEm: agoraMais(-10 * 24 * HORA), avisoId: 'av1', editalEntregueEm: null,
        instaladaEm: null, instaladaConvocacao: null, quorumInstalacao: null, presidenteNome: null,
        secretarioNome: null, observacaoGeral: null, encerradaEm: null, retrato: null, ataDocumentoId: null,
        canceladaEm: null, motivoCancelamento: null, createdBy: 'u-gestor',
        createdAt: '2026-11-20T12:00:00Z', updatedAt: '2026-11-20T12:00:00Z',
        ...over,
    };
}

const ITENS: ItemAssembleia[] = [
    { id: 'i1', assembleiaId: 'a1', ordem: 1, titulo: 'Aprovar contas de 2026', descricao: null, tipo: 'APROVACAO',
        opcoes: null, quorum: 'MAIORIA_PRESENTES', assunto: 'APROVAR_CONTAS', deliberacao: null },
    { id: 'i2', assembleiaId: 'a1', ordem: 2, titulo: 'Eleger síndico', descricao: null, tipo: 'ESCOLHA',
        opcoes: ['Ana', 'Bruno'], quorum: 'MAIORIA_PRESENTES', assunto: 'ELEGER_SINDICO', deliberacao: null },
];

/** `presentes` = quantas das 8 unidades estão marcadas na sala. */
function unidades(presentes: number): UnidadeNaAssembleia[] {
    return Array.from({ length: 8 }, (_, k) => ({
        id: `au${k + 1}`, assembleiaId: 'a1', unitId: `u${k + 1}`, fracao: 0.00125,
        unidadeRotulo: `Torre A — 10${k + 1}`, proprietarioNome: `Dono ${k + 1}`,
        presenca: k < presentes ? 'PRESENCIAL' as const : null, procuradorNome: null, procuracaoDocumentoId: null,
        presencaEm: k < presentes ? agoraMais(-HORA / 4) : null, impedidaNaInstalacao: null,
        impedimentoManual: null, impedimentoManualEm: null,
    }));
}

function carregada(a: Assembleia, presentes: number, votos: VotoAssembleia[] = []): AssembleiaCarregada {
    return { assembleia: a, itens: ITENS, unidades: a.status === 'RASCUNHO' ? [] : unidades(presentes), votos };
}

const apuracaoVazia: Apuracao = {
    total: 0.01, presentesFracao: 0, presentesUnidades: 0,
    itens: ITENS.map(i => ({ itemId: i.id, ordem: i.ordem, titulo: i.titulo, tipo: i.tipo, quorum: i.quorum,
        porOpcao: {}, resultado: 'SEM_DECISAO' as const, vencedora: null })),
};

const ENCERRADA_EM = '2026-12-10T23:30:00Z'; // 20:30 em Brasília → ata-2026-12-10.pdf

const retrato: Retrato = {
    total: 0.01, presentesFracao: 0.005, presentesUnidades: 4,
    itens: [
        { itemId: 'i1', ordem: 1, titulo: 'Aprovar contas de 2026', tipo: 'APROVACAO', quorum: 'MAIORIA_PRESENTES',
            porOpcao: { SIM: { fracao: 0.00375, unidades: 3 }, NAO: { fracao: 0.00125, unidades: 1 } },
            resultado: 'APROVADO', vencedora: null },
        { itemId: 'i2', ordem: 2, titulo: 'Eleger síndico', tipo: 'ESCOLHA', quorum: 'MAIORIA_PRESENTES',
            porOpcao: { Ana: { fracao: 0.0025, unidades: 2 }, Bruno: { fracao: 0.00125, unidades: 1 } },
            resultado: 'APROVADO', vencedora: 'Ana' },
    ],
    cabecalho: {
        assembleiaId: 'a1', empreendimentoId: 'emp1', condominio: NOME_CONDOMINIO, condominioCnpj: '12345678000190',
        tipo: 'AGO', titulo: 'AGO 2026', local: 'Salão de festas', linkTransmissao: null,
        primeiraConvocacaoEm: '2026-12-10T22:00:00Z', segundaConvocacaoEm: '2026-12-10T22:30:00Z',
        convocadaEm: '2026-11-25T12:00:00Z', editalEntregueEm: '2026-12-10T22:31:00Z',
        instaladaEm: '2026-12-10T22:31:00Z', convocacao: 2, presidente: 'Paula', secretario: 'Sérgio',
        instaladaPor: { id: 'u-gestor', papel: 'GESTOR', em: '2026-12-10T22:31:00Z', nome: 'Gestora' },
        editalConfirmadoPor: { id: 'u-gestor', papel: 'GESTOR', em: '2026-12-10T22:31:00Z', nome: 'Gestora' },
        quorumInstalacao: { convocacao: 2, total: 0.01, presentesFracao: 0.005, presentesUnidades: 4, impedidas: [],
            em: '2026-12-10T22:31:00Z', cotasConferidas: true },
        observacaoGeral: null, encerradaEm: ENCERRADA_EM, encerradaPor: 'u-gestor', encerradaPorPapel: 'GESTOR',
    },
    deliberacoes: {},
    unidades: unidades(4).map(u => ({
        unitId: u.unitId, rotulo: u.unidadeRotulo, proprietario: u.proprietarioNome, fracao: u.fracao,
        presenca: u.presenca, procurador: null, procuracaoDocumentoId: null, presencaEm: u.presencaEm,
        votouPeloPortal: false, impedidaNaInstalacao: false,
    })),
    votos: [],
    impedidasNaInstalacao: [],
};

function opsFalso(primeira: AssembleiaCarregada, extra: Partial<OperacoesAssembleia> = {}) {
    const ops = {
        carregar: vi.fn(async () => primeira),
        apuracao: vi.fn(async () => apuracaoVazia),
        impedimentos: vi.fn(async () => []),
        convocar: vi.fn(async () => ({ unidades: 8, fora: ['Torre A — Estacionamento'], avisoId: 'av1' })),
        cancelar: vi.fn(async () => ({ status: 'CANCELADA' as const, avisoId: 'av2' })),
        registrarPresenca: vi.fn(async (_id: string, unitId: string, presenca: any, procurador?: string | null, procuracaoId?: string | null) =>
            ({ unitId, presenca, procurador: procurador ?? null, procuracaoDocumentoId: procuracaoId ?? null })),
        instalar: vi.fn(async (_id: string, d: { convocacao: 1 | 2 }) => ({ convocacao: d.convocacao, total: 0.01,
            presentesFracao: 0.005, presentesUnidades: 4, impedidas: [], em: new Date().toISOString(), cotasConferidas: true })),
        lancarVoto: vi.fn(async (itemId: string, unitId: string, opcao: string) =>
            ({ votoId: 'v-novo', itemId, unitId, opcao, origem: 'PRESENCIAL' as const, anterior: null })),
        encerrar: vi.fn(async () => retrato),
        vincularAta: vi.fn(async (_id: string, documentoId: string) => ({ ataDocumentoId: documentoId })),
        marcarImpedida: vi.fn(async (_id: string, unitId: string, motivo: string | null) =>
            ({ unitId, motivo, em: motivo ? new Date().toISOString() : null })),
        cotasConferidas: vi.fn(async () => true),
        // B2 — o que a tela lia/subia por fora agora é ops.
        unidadesFora: vi.fn(async () => [] as string[]),
        leiturasDoAviso: vi.fn(async () => 3),
        enviarDocumento: vi.fn(async (_id: string, _arquivo: File, d: { categoria: string }) => ({ documentoId: `doc-${d.categoria}` })),
        abrirDocumento: vi.fn(async () => 'https://assinada/doc.pdf'),
        listar: vi.fn(async () => [] as Assembleia[]),
        salvarRascunho: vi.fn(),
        salvarItens: vi.fn(),
        excluirRascunho: vi.fn(async () => undefined),
        ...extra,
    };
    return ops as typeof ops & OperacoesAssembleia;
}

function montar(ops: OperacoesAssembleia) {
    return render(
        <ConfirmProvider>
            <AssembleiaDetalheView assembleiaId="a1" empreendimento={E} ops={ops} onVoltar={() => {}} />
        </ConfirmProvider>,
    );
}

/** Abre a gaveta de uma unidade pela linha da tabela de Unidades. */
async function abrirUnidade(rotulo: string) {
    fireEvent.click(await screen.findByRole('row', { name: `${rotulo}: abrir presença e votos` }));
    return screen.findByRole('dialog', { name: rotulo });
}

beforeEach(() => {
    vi.clearAllMocks();
    salvos.length = 0;
});

// A tela da assembleia só fala com `ops` (B2): nenhum serviço é chamado por fora.
afterEach(() => {
    for (const f of [uploadDocumento, listAvisos, listDocumentos, abrirDocumento, listAllUnitsForEmpreendimento]) {
        expect(f).not.toHaveBeenCalled();
    }
});

// ─── voto na sala sobre voto do portal (R7) ──────────────────────────────────

describe('voto presencial', () => {
    it('confirma antes de substituir voto do portal', async () => {
        const votoPortal: VotoAssembleia = { id: 'v1', assembleiaId: 'a1', itemId: 'i1', unitId: 'u1', opcao: 'SIM',
            origem: 'PORTAL', clientId: 'c1', lancadoPor: null, votadoEm: '2026-12-10T22:02:00Z' };
        const ops = opsFalso(carregada(assembleia({ status: 'INSTALADA', instaladaEm: agoraMais(-HORA / 4),
            instaladaConvocacao: 2 }), 4, [votoPortal]));
        montar(ops);

        const gaveta = await abrirUnidade('Torre A — 101');
        const item = within(gaveta).getByRole('group', { name: 'Aprovar contas de 2026' });
        fireEvent.click(within(item).getByRole('button', { name: 'Não' }));

        expect(await screen.findByText('Esta unidade votou Sim pelo portal em 10/12/2026 às 19:02. Substituir?'))
            .toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Manter o voto do portal' }));
        await waitFor(() => expect(screen.queryByText(/Substituir\?/)).not.toBeInTheDocument());
        expect(ops.lancarVoto).not.toHaveBeenCalled();

        // Confirmando, o voto vai ao banco.
        fireEvent.click(within(item).getByRole('button', { name: 'Não' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Substituir' }));
        await waitFor(() => expect(ops.lancarVoto).toHaveBeenCalledWith('i1', 'u1', 'NAO'));
    });
});

// ─── tela velha durante a reunião: voto do portal que chegou depois ─────────
// votos e unidades só vinham no carregamento: o voto do portal que chegou com a tela
// aberta não contava em "presentes aptos" (1ª convocação desligada quando o banco
// aceitaria) e a confirmação da R7 não aparecia — o voto do portal sumia calado.

const votoDoPortal = (unitId: string, itemId = 'i1'): VotoAssembleia => ({
    id: `vp-${unitId}-${itemId}`, assembleiaId: 'a1', itemId, unitId, opcao: 'SIM', origem: 'PORTAL',
    clientId: `c-${unitId}`, lancadoPor: null, votadoEm: '2026-12-10T22:02:00Z',
});

describe('tela atualizada durante a reunião', () => {
    it('abrir Instalar recarrega: voto do portal que chegou depois conta para a 1ª convocação', async () => {
        // Ao abrir: 1 de 8 na sala (12,50%). Depois, 3 unidades votaram pelo portal: 4 de 8 = metade.
        const ops = opsFalso(carregada(assembleia(), 1));
        ops.carregar.mockResolvedValueOnce(carregada(assembleia(), 1))
            .mockResolvedValue(carregada(assembleia(), 1, ['u2', 'u3', 'u4'].map(u => votoDoPortal(u))));
        montar(ops);

        fireEvent.click(await screen.findByRole('button', { name: 'Instalar' }));
        const gaveta = await screen.findByRole('dialog', { name: 'Instalar assembleia' });
        await waitFor(() => expect(within(gaveta).getByRole('radio', { name: /1ª convocação/ })).toBeEnabled());
        expect(ops.carregar).toHaveBeenCalledTimes(2);
        // E passa a ser a escolhida (o gestor ainda não tinha escolhido à mão). É um efeito da
        // gaveta, depois do render que liga o rádio: espera por ele.
        await waitFor(() => expect(within(gaveta).getByRole('radio', { name: /1ª convocação/ })).toBeChecked());
    });

    it('abrir a unidade recarrega: voto do portal que chegou depois pede a confirmação da R7', async () => {
        const instalada = assembleia({ status: 'INSTALADA', instaladaEm: agoraMais(-HORA / 4), instaladaConvocacao: 2 });
        const ops = opsFalso(carregada(instalada, 4));
        ops.carregar.mockResolvedValueOnce(carregada(instalada, 4))
            .mockResolvedValue(carregada(instalada, 4, [votoDoPortal('u1')]));
        montar(ops);

        const gaveta = await abrirUnidade('Torre A — 101');
        await waitFor(() => expect(ops.carregar).toHaveBeenCalledTimes(2));
        const item = within(gaveta).getByRole('group', { name: 'Aprovar contas de 2026' });
        await waitFor(() => expect(within(item).getByText(/portal/i)).toBeInTheDocument());
        fireEvent.click(within(item).getByRole('button', { name: 'Não' }));
        expect(await screen.findByText('Esta unidade votou Sim pelo portal em 10/12/2026 às 19:02. Substituir?'))
            .toBeInTheDocument();
    });

    it('"Atualizar apuração" recarrega votos e unidades, não só a apuração', async () => {
        const ops = opsFalso(carregada(assembleia(), 1));
        ops.carregar.mockResolvedValueOnce(carregada(assembleia(), 1))
            .mockResolvedValue(carregada(assembleia(), 1, [votoDoPortal('u2')]));
        montar(ops);

        fireEvent.click(await screen.findByRole('button', { name: 'Atualizar apuração' }));
        await waitFor(() => expect(ops.carregar).toHaveBeenCalledTimes(2));
        // A unidade 102 passa a constar como presente pelo portal na tabela.
        expect(await screen.findByText('Pelo portal')).toBeInTheDocument();
    });

    it('voto da sala que substituiu um voto do portal que a tela não conhecia: avisa', async () => {
        const instalada = assembleia({ status: 'INSTALADA', instaladaEm: agoraMais(-HORA / 4), instaladaConvocacao: 2 });
        const ops = opsFalso(carregada(instalada, 4), {
            // O voto do portal chegou entre o recarregar da gaveta e o clique.
            lancarVoto: vi.fn(async (itemId: string, unitId: string, opcao: string) => ({
                votoId: 'v-novo', itemId, unitId, opcao, origem: 'PRESENCIAL' as const,
                anterior: { opcao: 'SIM', origem: 'PORTAL' as const, votadoEm: '2026-12-10T22:05:00Z', clientId: 'c1', lancadoPor: null },
            })),
        });
        montar(ops);

        const gaveta = await abrirUnidade('Torre A — 101');
        const item = within(gaveta).getByRole('group', { name: 'Aprovar contas de 2026' });
        fireEvent.click(within(item).getByRole('button', { name: 'Não' }));
        await waitFor(() => expect(ops.lancarVoto).toHaveBeenCalledWith('i1', 'u1', 'NAO'));
        expect(await screen.findByText(
            'Esta unidade tinha votado Sim pelo portal em 10/12/2026 às 19:05; o voto da sala (Não) substituiu.'))
            .toBeInTheDocument();
    });
});

// ─── instalar (R4, R6) ───────────────────────────────────────────────────────

describe('instalar', () => {
    it('não instala sem a caixa do edital', async () => {
        const ops = opsFalso(carregada(assembleia(), 4));
        montar(ops);

        fireEvent.click(await screen.findByRole('button', { name: 'Instalar' }));
        const gaveta = await screen.findByRole('dialog', { name: 'Instalar assembleia' });
        fireEvent.change(within(gaveta).getByLabelText('Presidente da mesa'), { target: { value: 'Paula' } });
        fireEvent.change(within(gaveta).getByLabelText('Secretário da mesa'), { target: { value: 'Sérgio' } });

        const botao = within(gaveta).getByRole('button', { name: 'Instalar assembleia' });
        expect(botao).toBeDisabled();
        expect(within(gaveta).getByText(/Marque a confirmação de que o edital foi entregue/)).toBeInTheDocument();
        fireEvent.click(botao);
        expect(ops.instalar).not.toHaveBeenCalled();

        fireEvent.click(within(gaveta).getByLabelText('Confirmo que o edital foi entregue a todas as unidades'));
        expect(botao).toBeEnabled();
        fireEvent.click(botao);
        await waitFor(() => expect(ops.instalar).toHaveBeenCalledWith('a1',
            { convocacao: 1, presidente: 'Paula', secretario: 'Sérgio', editalEntregue: true }));
    });

    it('1ª convocação desligada diz o motivo', async () => {
        const ops = opsFalso(carregada(assembleia(), 1)); // 1 de 8 = 12,50%
        montar(ops);

        fireEvent.click(await screen.findByRole('button', { name: 'Instalar' }));
        const gaveta = await screen.findByRole('dialog', { name: 'Instalar assembleia' });

        expect(within(gaveta).getByRole('radio', { name: /1ª convocação/ })).toBeDisabled();
        expect(within(gaveta).getByText(/somam 12,50% das frações.*exige pelo menos metade/)).toBeInTheDocument();
        // A 2ª, já no horário, fica escolhida.
        expect(within(gaveta).getByRole('radio', { name: /2ª convocação/ })).toBeChecked();
    });
});

// ─── encerrar e ata (R9) ─────────────────────────────────────────────────────

describe('encerrar', () => {
    const instalada = () => carregada(assembleia({ status: 'INSTALADA', instaladaEm: agoraMais(-HORA / 4),
        instaladaConvocacao: 2, presidenteNome: 'Paula', secretarioNome: 'Sérgio' }), 4);

    it('encerrar grava ata e vincula', async () => {
        const ops = opsFalso(instalada());
        montar(ops);

        fireEvent.click(await screen.findByRole('button', { name: 'Encerrar' }));
        const gaveta = await screen.findByRole('dialog', { name: 'Encerrar assembleia' });
        fireEvent.change(within(gaveta).getByLabelText('Deliberação — Aprovar contas de 2026'),
            { target: { value: 'Contas aprovadas sem ressalvas.' } });
        fireEvent.click(within(gaveta).getByRole('button', { name: 'Encerrar e gerar ata' }));

        await waitFor(() => expect(ops.vincularAta).toHaveBeenCalledWith('a1', 'doc-ATA'));
        expect(ops.encerrar).toHaveBeenCalledWith('a1',
            { i1: 'Contas aprovadas sem ressalvas.', i2: null }, null);
        expect(gerarAtaPdf).toHaveBeenCalledTimes(1);
        const [id, arquivo, documento] = ops.enviarDocumento.mock.calls[0];
        expect(id).toBe('a1');
        expect(arquivo).toBeInstanceOf(File);
        expect((arquivo as File).name).toBe('ata-2026-12-10.pdf');
        expect((arquivo as File).size).toBeGreaterThan(1000); // o PDF real
        expect(documento).toEqual({ categoria: 'ATA', visivelPortal: true, titulo: expect.stringMatching(/ — AGO 2026$/) });
        expect(screen.queryByRole('button', { name: 'Gerar ata novamente' })).not.toBeInTheDocument();
        expect(await screen.findByText(/Ata gravada em Documentos/)).toBeInTheDocument();
    });

    it('upload falho mostra Gerar ata novamente', async () => {
        const ops = opsFalso(instalada());
        ops.enviarDocumento.mockRejectedValueOnce(new Error('Falha ao enviar o arquivo: rede caiu'));
        montar(ops);

        fireEvent.click(await screen.findByRole('button', { name: 'Encerrar' }));
        const gaveta = await screen.findByRole('dialog', { name: 'Encerrar assembleia' });
        fireEvent.click(within(gaveta).getByRole('button', { name: 'Encerrar e gerar ata' }));

        const novamente = await screen.findByRole('button', { name: 'Gerar ata novamente' });
        expect(screen.getAllByText(/rede caiu/).length).toBeGreaterThan(0);
        expect(ops.vincularAta).not.toHaveBeenCalled();

        // Refaz do MESMO retrato: não encerra de novo.
        fireEvent.click(novamente);
        await waitFor(() => expect(ops.vincularAta).toHaveBeenCalledWith('a1', 'doc-ATA'));
        expect(ops.encerrar).toHaveBeenCalledTimes(1);
        expect(ops.enviarDocumento).toHaveBeenCalledTimes(2);
    });
});

// ─── convocar (R1, R4) ───────────────────────────────────────────────────────

describe('convocar', () => {
    it('mostra quem fica fora e a antecedência, e manda o texto da convocação', async () => {
        // Meio-dia de Brasília daqui a 10 dias de calendário: a conta não depende da hora do teste.
        const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
        const [ano, mes, dia] = hojeSP.split('-').map(Number);
        const daqui10 = new Date(Date.UTC(ano, mes - 1, dia + 10)).toISOString().slice(0, 10);
        const rascunho = assembleia({ status: 'RASCUNHO', convocadaEm: null, avisoId: null,
            primeiraConvocacaoEm: `${daqui10}T12:00:00-03:00`, segundaConvocacaoEm: `${daqui10}T12:30:00-03:00` });
        const convocada = { ...rascunho, status: 'CONVOCADA' as const, convocadaEm: new Date().toISOString(), avisoId: 'av1' };
        const ops = opsFalso(carregada(rascunho, 0));
        ops.carregar.mockResolvedValueOnce(carregada(rascunho, 0)).mockResolvedValue(carregada(convocada, 0));
        ops.unidadesFora.mockResolvedValue(['Torre A — Estacionamento']);
        montar(ops);

        const botaoConvocar = await screen.findByRole('button', { name: 'Convocar' });
        // §24: o gestor fica no padrão 'indigo' (azul do app).
        expect(botaoConvocar.className).toContain('bg-blue-600');
        fireEvent.click(botaoConvocar);
        const gaveta = await screen.findByRole('dialog', { name: 'Convocar assembleia' });
        expect(await within(gaveta).findByText('Torre A — Estacionamento')).toBeInTheDocument();
        expect(ops.unidadesFora).toHaveBeenCalledWith('a1');
        expect(within(gaveta).getByText(/fora da assembleia: sem fração ideal/)).toBeInTheDocument();
        expect(within(gaveta).getByText(/10 dias de antecedência/)).toBeInTheDocument();

        fireEvent.click(within(gaveta).getByRole('button', { name: 'Convocar e publicar aviso' }));
        await waitFor(() => expect(ops.convocar).toHaveBeenCalledWith('a1', textoConvocacao(rascunho, ITENS, NOME_CONDOMINIO)));

        // Convocada: a seção Unidades diz quantos CONDÔMINOS (pessoas, não unidades) leram o
        // aviso — a leitura é registrada por pessoa (só informação).
        expect(await screen.findByText(/Aviso de convocação: 3 condôminos que leram — só informação: a leitura não é exigida para instalar/))
            .toBeInTheDocument();
        expect(ops.leiturasDoAviso).toHaveBeenCalledWith('a1');
    });
});

// ─── procurador (R7) ─────────────────────────────────────────────────────────

describe('presença', () => {
    it('procurador exige nome e arquivo, e a procuração sobe antes de registrar', async () => {
        const ops = opsFalso(carregada(assembleia(), 1));
        montar(ops);

        const gaveta = await abrirUnidade('Torre A — 102');
        fireEvent.click(within(gaveta).getByRole('radio', { name: 'Por procurador' }));
        const registrar = within(gaveta).getByRole('button', { name: 'Registrar presença' });
        expect(registrar).toBeDisabled();
        expect(within(gaveta).getByText(/Informe o nome do procurador e anexe a procuração/)).toBeInTheDocument();

        fireEvent.change(within(gaveta).getByLabelText('Nome do procurador'), { target: { value: 'Carlos Procurador' } });
        const arquivo = new File(['%PDF-1.4'], 'procuracao.pdf', { type: 'application/pdf' });
        fireEvent.change(within(gaveta).getByLabelText('Procuração (arquivo)'), { target: { files: [arquivo] } });
        expect(registrar).toBeEnabled();
        fireEvent.click(registrar);

        await waitFor(() => expect(ops.registrarPresenca)
            .toHaveBeenCalledWith('a1', 'u2', 'PROCURADOR', 'Carlos Procurador', 'doc-OUTRO'));
        // B2: procuração é SEMPRE OUTRO e NUNCA visível no portal — quem fixa é a tela.
        expect(ops.enviarDocumento).toHaveBeenCalledTimes(1);
        expect(ops.enviarDocumento).toHaveBeenCalledWith('a1', arquivo, {
            categoria: 'OUTRO', visivelPortal: false, titulo: 'Procuração — Torre A — 102 — AGO 2026',
        });
        expect(ops.registrarPresenca.mock.invocationCallOrder[0])
            .toBeGreaterThan(ops.enviarDocumento.mock.invocationCallOrder[0]);
    });

    it('não oferece remover a presença de quem já votou na sala', async () => {
        const votoSala: VotoAssembleia = { id: 'v1', assembleiaId: 'a1', itemId: 'i1', unitId: 'u1', opcao: 'SIM',
            origem: 'PRESENCIAL', clientId: null, lancadoPor: 'u-gestor', votadoEm: agoraMais(-HORA / 8) };
        const ops = opsFalso(carregada(assembleia({ status: 'INSTALADA', instaladaConvocacao: 2,
            instaladaEm: agoraMais(-HORA / 4) }), 4, [votoSala]));
        montar(ops);

        const gaveta = await abrirUnidade('Torre A — 101');
        expect(within(gaveta).getByRole('radio', { name: 'Sem presença' })).toBeDisabled();
        expect(within(gaveta).getByText(/já tem voto lançado na sala/)).toBeInTheDocument();
    });
});

// ─── cancelar (R10) e edital (R4) ────────────────────────────────────────────

describe('cancelar e edital', () => {
    it('cancelar pede motivo e manda o texto de cancelamento', async () => {
        const a = assembleia({ primeiraConvocacaoEm: agoraMais(5 * 24 * HORA), segundaConvocacaoEm: agoraMais(5 * 24 * HORA + HORA) });
        const ops = opsFalso(carregada(a, 0));
        montar(ops);

        fireEvent.click(await screen.findByRole('button', { name: 'Cancelar assembleia' }));
        const gaveta = await screen.findByRole('dialog', { name: 'Cancelar assembleia' });
        const botao = within(gaveta).getByRole('button', { name: 'Cancelar e avisar os condôminos' });
        expect(botao).toBeDisabled();
        expect(within(gaveta).getByText(/Informe o motivo do cancelamento/)).toBeInTheDocument();

        fireEvent.change(within(gaveta).getByLabelText('Motivo do cancelamento'), { target: { value: 'Reforma do salão' } });
        fireEvent.click(botao);
        await waitFor(() => expect(ops.cancelar).toHaveBeenCalledWith('a1', 'Reforma do salão',
            textoCancelamento(a, 'Reforma do salão')));
    });

    it('baixa o edital em PDF', async () => {
        montar(opsFalso(carregada(assembleia(), 0)));
        fireEvent.click(await screen.findByRole('button', { name: 'Baixar edital' }));
        await waitFor(() => expect(salvos).toHaveLength(1));
        expect(baixarEditalPdf).toHaveBeenCalledTimes(1);
        expect(salvos[0].nome).toMatch(/\.pdf$/);
    });
});

// ─── rodada de correção 1 (revisão da A7) ────────────────────────────────────

describe('abrir ata (pop-up)', () => {
    const encerradaComAta = () => carregada(assembleia({ status: 'ENCERRADA', encerradaEm: ENCERRADA_EM, retrato,
        quorumInstalacao: retrato.cabecalho.quorumInstalacao, ataDocumentoId: 'doc-ata' }), 4);

    it('a aba nasce no clique, em branco, e só depois recebe o endereço assinado', async () => {
        const janela = { location: { href: '' }, close: vi.fn() };
        const abrir = vi.spyOn(window, 'open').mockReturnValue(janela as unknown as Window);
        const ops = opsFalso(encerradaComAta(), { abrirDocumento: vi.fn(async () => 'https://assinada/ata.pdf') });
        montar(ops);

        fireEvent.click(await screen.findByRole('button', { name: 'Abrir ata' }));
        // Síncrono, ainda dentro do clique — antes de qualquer await.
        expect(abrir).toHaveBeenCalledWith('', '_blank');
        await waitFor(() => expect(janela.location.href).toBe('https://assinada/ata.pdf'));
        expect(ops.abrirDocumento).toHaveBeenCalledWith('a1', 'doc-ata');
        expect(abrir).toHaveBeenCalledTimes(1);
        abrir.mockRestore();
    });

    it('erro fecha a aba em branco e avisa', async () => {
        const janela = { location: { href: '' }, close: vi.fn() };
        const abrir = vi.spyOn(window, 'open').mockReturnValue(janela as unknown as Window);
        montar(opsFalso(encerradaComAta(), {
            abrirDocumento: vi.fn(async () => { throw new Error('Falha ao gerar o link do arquivo: expirou'); }),
        }));

        fireEvent.click(await screen.findByRole('button', { name: 'Abrir ata' }));
        await waitFor(() => expect(janela.close).toHaveBeenCalled());
        expect(await screen.findByText(/expirou/)).toBeInTheDocument();
        abrir.mockRestore();
    });
});

describe('situação congelada', () => {
    it('encerrada mostra a impedida DA INSTALAÇÃO, não o impedimento de agora', async () => {
        const MOTIVO = 'Cota de 10/2026 vencida em 10/11/2026';
        const impedidas = [{ unitId: 'u3', rotulo: 'Torre A — 103', motivo: MOTIVO, origem: 'AUTOMATICA' as const }];
        const r: Retrato = { ...retrato, impedidasNaInstalacao: impedidas };
        const d = carregada(assembleia({ status: 'ENCERRADA', encerradaEm: ENCERRADA_EM, retrato: r, ataDocumentoId: 'doc-ata',
            quorumInstalacao: { ...retrato.cabecalho.quorumInstalacao!, impedidas } }), 4);
        d.unidades = d.unidades.map(u => ({ ...u, impedidaNaInstalacao: u.unitId === 'u3' }));
        const ops = opsFalso(d);
        montar(ops);

        expect(await screen.findByText(`Impedida na instalação: ${MOTIVO}`)).toBeInTheDocument();
        expect(screen.getAllByText('Apta na instalação')).toHaveLength(7);
        expect(screen.queryByText('Apta')).not.toBeInTheDocument();
        // Encerrada não consulta o "agora".
        expect(ops.impedimentos).not.toHaveBeenCalled();
    });

    it('cancelada: o edital continua baixável e a coluna Situação sai', async () => {
        montar(opsFalso(carregada(assembleia({ status: 'CANCELADA', canceladaEm: agoraMais(-HORA),
            motivoCancelamento: 'Reforma do salão' }), 0)));

        expect(await screen.findByRole('button', { name: 'Baixar edital' })).toBeInTheDocument();
        expect(await screen.findByRole('columnheader', { name: /Presença/ })).toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: /Situação/ })).not.toBeInTheDocument();
    });
});

describe('outro gestor já agiu (HINT estado)', () => {
    const jaEncerrada = (): never => { throw new ErroAssembleia({ hint: 'estado', message: 'Esta assembleia já foi encerrada.' }); };

    it('instalar recarrega a tela', async () => {
        const ops = opsFalso(carregada(assembleia(), 4), { instalar: vi.fn(async () => jaEncerrada()) });
        montar(ops);
        fireEvent.click(await screen.findByRole('button', { name: 'Instalar' }));
        const gaveta = await screen.findByRole('dialog', { name: 'Instalar assembleia' });
        fireEvent.change(within(gaveta).getByLabelText('Presidente da mesa'), { target: { value: 'Paula' } });
        fireEvent.change(within(gaveta).getByLabelText('Secretário da mesa'), { target: { value: 'Sérgio' } });
        fireEvent.click(within(gaveta).getByLabelText('Confirmo que o edital foi entregue a todas as unidades'));
        fireEvent.click(within(gaveta).getByRole('button', { name: 'Instalar assembleia' }));

        expect(await within(gaveta).findByText('Esta assembleia já foi encerrada.')).toBeInTheDocument();
        // 1ª ao montar, 2ª ao abrir Instalar (tela atualizada), 3ª pelo HINT 'estado'.
        await waitFor(() => expect(ops.carregar).toHaveBeenCalledTimes(3));
    });

    it('cancelar recarrega a tela', async () => {
        const ops = opsFalso(carregada(assembleia(), 0), { cancelar: vi.fn(async () => jaEncerrada()) });
        montar(ops);
        fireEvent.click(await screen.findByRole('button', { name: 'Cancelar assembleia' }));
        const gaveta = await screen.findByRole('dialog', { name: 'Cancelar assembleia' });
        fireEvent.change(within(gaveta).getByLabelText('Motivo do cancelamento'), { target: { value: 'Reforma' } });
        fireEvent.click(within(gaveta).getByRole('button', { name: 'Cancelar e avisar os condôminos' }));
        await waitFor(() => expect(ops.carregar).toHaveBeenCalledTimes(2));
    });
});

describe('gaveta de rascunho', () => {
    const gravada = assembleia({ id: 'a9', status: 'RASCUNHO', titulo: 'AGO 2027', primeiraConvocacaoEm: null,
        segundaConvocacaoEm: null, convocadaEm: null, avisoId: null });

    function abrirGaveta() {
        const onSalva = vi.fn();
        const onClose = vi.fn();
        // B2: a gaveta grava por `ops` (gestor: tabela; síndico: RPC) — aqui, o falso.
        const ops = opsFalso(carregada(gravada, 0), { salvarRascunho, salvarItens });
        render(
            <ConfirmProvider>
                <AssembleiaSheet open onClose={onClose} empreendimentoId="emp1" assembleiaId={null} ops={ops} onSalva={onSalva} />
            </ConfirmProvider>,
        );
        fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'AGO 2027' } });
        fireEvent.change(screen.getByLabelText('Título do item'), { target: { value: 'Aprovar contas' } });
        fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));
        return { onSalva, onClose };
    }

    it('só diz "salvo" depois que a pauta também foi gravada', async () => {
        salvarRascunho.mockResolvedValue(gravada);
        salvarItens.mockResolvedValue([]);
        const { onSalva, onClose } = abrirGaveta();

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(onSalva).toHaveBeenCalledWith(gravada, true);
        expect(onSalva.mock.invocationCallOrder[0]).toBeGreaterThan(salvarItens.mock.invocationCallOrder[0]);
    });

    it('pauta falha: avisa que só o rascunho foi gravado e a gaveta continua aberta', async () => {
        salvarRascunho.mockResolvedValue(gravada);
        salvarItens.mockRejectedValue(new Error('Item 1: há opção em branco.'));
        const { onSalva, onClose } = abrirGaveta();

        expect(await screen.findByText(/O rascunho foi gravado, mas a pauta não: Item 1: há opção em branco\./)).toBeInTheDocument();
        expect(onSalva).toHaveBeenCalledWith(gravada, false);
        expect(onClose).not.toHaveBeenCalled();
    });
});

// ─── A10: impedimento marcado à mão e cotas não conferidas ──────────────────

const AVISO_COTAS = 'Este condomínio não tem cotas cobradas pelo Òpura: a inadimplência não é conferida automaticamente. '
    + 'Marque à mão a unidade impedida.';

describe('cotas não conferidas (A10)', () => {
    it('aviso aparece com cotasConferidas=false: topo de Unidades e gaveta Instalar', async () => {
        const ops = opsFalso(carregada(assembleia(), 4), { cotasConferidas: vi.fn(async () => false) });
        montar(ops);

        // As gavetas ficam montadas (escondidas): o do topo de Unidades é o que está fora delas.
        await waitFor(() => expect(screen.getAllByText(AVISO_COTAS).some(el => !el.closest('[role="dialog"]'))).toBe(true));
        fireEvent.click(screen.getByRole('button', { name: 'Instalar' }));
        const gaveta = await screen.findByRole('dialog', { name: 'Instalar assembleia' });
        expect(within(gaveta).getByText(AVISO_COTAS)).toBeInTheDocument();
        // Não bloqueia: com a caixa e a mesa, instala.
        fireEvent.change(within(gaveta).getByLabelText('Presidente da mesa'), { target: { value: 'Paula' } });
        fireEvent.change(within(gaveta).getByLabelText('Secretário da mesa'), { target: { value: 'Sérgio' } });
        fireEvent.click(within(gaveta).getByLabelText('Confirmo que o edital foi entregue a todas as unidades'));
        expect(within(gaveta).getByRole('button', { name: 'Instalar assembleia' })).toBeEnabled();
    });

    it('aviso aparece na gaveta Convocar do rascunho', async () => {
        const rascunho = assembleia({ status: 'RASCUNHO', convocadaEm: null, avisoId: null,
            primeiraConvocacaoEm: agoraMais(5 * 24 * HORA), segundaConvocacaoEm: agoraMais(5 * 24 * HORA + HORA) });
        const ops = opsFalso(carregada(rascunho, 0), { cotasConferidas: vi.fn(async () => false) });
        montar(ops);

        fireEvent.click(await screen.findByRole('button', { name: 'Convocar' }));
        const gaveta = await screen.findByRole('dialog', { name: 'Convocar assembleia' });
        expect(await within(gaveta).findByText(AVISO_COTAS)).toBeInTheDocument();
        expect(within(gaveta).getByRole('button', { name: 'Convocar e publicar aviso' })).toBeEnabled();
    });

    it('com cotas conferidas, sem aviso', async () => {
        const ops = opsFalso(carregada(assembleia(), 4));
        montar(ops);
        await waitFor(() => expect(ops.cotasConferidas).toHaveBeenCalledWith('a1'));
        expect(screen.queryByText(AVISO_COTAS)).not.toBeInTheDocument();
    });
});

describe('impedimento marcado à mão (A10)', () => {
    it('marcar exige motivo; marcada, a situação diz que foi à mão (gestor ou síndico — a marca não guarda o papel)', async () => {
        const ops = opsFalso(carregada(assembleia(), 1));
        montar(ops);

        const gaveta = await abrirUnidade('Torre A — 102');
        const marcar = within(gaveta).getByRole('button', { name: 'Marcar como impedida' });
        expect(marcar).toBeDisabled();
        expect(within(gaveta).getByText('Informe o motivo do impedimento.')).toBeInTheDocument();
        expect(within(gaveta).getByText('Aparece para o condômino no portal e na ata.')).toBeInTheDocument();
        expect(within(gaveta).getByLabelText('Motivo do impedimento')).toHaveAttribute('maxLength', '200');
        fireEvent.change(within(gaveta).getByLabelText('Motivo do impedimento'), { target: { value: '   ' } });
        expect(marcar).toBeDisabled();

        fireEvent.change(within(gaveta).getByLabelText('Motivo do impedimento'),
            { target: { value: '  Acordo de parcelamento descumprido ' } });
        expect(marcar).toBeEnabled();
        fireEvent.click(marcar);
        await waitFor(() => expect(ops.marcarImpedida).toHaveBeenCalledWith('a1', 'u2', 'Acordo de parcelamento descumprido'));

        // A gaveta passa a dizer a situação e a oferecer Desmarcar; a presença fica travada.
        expect(await within(gaveta).findByText('Impedida (marcada à mão): Acordo de parcelamento descumprido.'))
            .toBeInTheDocument();
        expect(within(gaveta).getByRole('button', { name: 'Desmarcar' })).toBeEnabled();
        expect(within(gaveta).getByRole('radio', { name: 'Na sala' })).toBeDisabled();
    });

    it('situação com origem: marcada à mão × automática; desmarcar manda null', async () => {
        const d = carregada(assembleia(), 0);
        d.unidades = d.unidades.map(u => (u.unitId === 'u2'
            ? { ...u, impedimentoManual: 'Acordo descumprido', impedimentoManualEm: agoraMais(-HORA) } : u));
        const ops = opsFalso(d, { impedimentos: vi.fn(async () => [
            { unitId: 'u1', motivo: 'Cota de 10/2026 vencida em 10/11/2026', origem: 'AUTOMATICA' as const },
            { unitId: 'u2', motivo: 'Acordo descumprido', origem: 'MANUAL' as const },
        ]) });
        montar(ops);

        expect(await screen.findByText('Impedida: Cota de 10/2026 vencida em 10/11/2026')).toBeInTheDocument();
        expect(screen.getByText('Impedida (marcada à mão): Acordo descumprido')).toBeInTheDocument();

        const gaveta = await abrirUnidade('Torre A — 102');
        fireEvent.click(within(gaveta).getByRole('button', { name: 'Desmarcar' }));
        await waitFor(() => expect(ops.marcarImpedida).toHaveBeenCalledWith('a1', 'u2', null));
    });

    it('a automática não oferece desmarcar (só o pagamento libera), mas aceita a marca do gestor por cima', async () => {
        const ops = opsFalso(carregada(assembleia(), 0), { impedimentos: vi.fn(async () => [
            { unitId: 'u1', motivo: 'Cota de 10/2026 vencida em 10/11/2026', origem: 'AUTOMATICA' as const },
        ]) });
        montar(ops);

        const gaveta = await abrirUnidade('Torre A — 101');
        expect(await within(gaveta).findByText('Impedida: Cota de 10/2026 vencida em 10/11/2026.')).toBeInTheDocument();
        expect(within(gaveta).queryByRole('button', { name: 'Desmarcar' })).not.toBeInTheDocument();
        expect(within(gaveta).getByRole('button', { name: 'Marcar como impedida' })).toBeInTheDocument();
    });
});

// ─── B2: a tela da assembleia só fala com `ops` ──────────────────────────────

describe('catraca B2: a tela e as peças dela não chamam serviço por fora de ops', () => {
    it('AssembleiaDetalheView e assembleia/* não usam condominioComunicacaoService/empreendimentoService', () => {
        const raiz = path.join(process.cwd(), 'components', 'condominio');
        const arquivos = ['AssembleiaDetalheView.tsx', 'AssembleiaSheet.tsx', 'AssembleiasTab.tsx',
            ...readdirSync(path.join(raiz, 'assembleia')).map(f => path.join('assembleia', f))];
        const achados: string[] = [];
        for (const f of arquivos) {
            readFileSync(path.join(raiz, f), 'utf8').split('\n').forEach((linha, i) => {
                if (/^\s*(\/\/|\*)/.test(linha)) return; // comentário
                if (/\b(condominioComunicacaoService|empreendimentoService|condominioAssembleiaService)\s*\./.test(linha)
                    || /\bsupabase\b/.test(linha)) {
                    achados.push(`${f}:${i + 1}: ${linha.trim()}`);
                }
            });
        }
        expect(achados).toEqual([]);
    });
});

// ─── M6 da revisão final da B: o link de transmissão quebra URL longa ────────
// ACCENTS[x].link é só a COR (também vale para o botão "Voltar para editar", onde
// `break-all` cortaria palavra no meio). O sublinhado e o `break-all` do link de
// transmissão moram no próprio <a> — o mesmo que o gestor tinha antes da B2.

describe('Identificação › link de transmissão (gestor e síndico)', () => {
    const URL_LONGA = 'https://meet.example.com/' + 'a'.repeat(180);
    for (const accent of ['indigo', 'portal'] as const) {
        it(`${accent}: sublinha no hover e quebra a URL longa (break-all)`, () => {
            render(<IdentificacaoSecao assembleia={assembleia({ linkTransmissao: URL_LONGA })} accent={accent} />);
            const link = screen.getByRole('link', { name: URL_LONGA });
            expect(link).toHaveClass('hover:underline', 'break-all');
            expect(link).toHaveAttribute('target', '_blank');
            expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        });
    }
});
