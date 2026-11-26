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
 *   • Encerrar → retrato → ata em PDF → Documentos (ATA, visível no portal, org do
 *     CONDOMÍNIO) → vincular; upload falho deixa "Gerar ata novamente" (R9);
 *   • Convocar mostra quem fica fora e a antecedência, e manda o texto do A5 (R1/R4);
 *   • presença por procurador sobe a procuração antes de registrar (R7);
 *   • Cancelar manda o texto de cancelamento do A5 (R10).
 *
 * O PDF é o de verdade (A6): edital e ata saem do jsPDF uma vez por esta tela. Só o
 * `doc.save` é trocado (o jsdom não baixa arquivo).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadDocumento, listAvisos, listDocumentos, abrirDocumento, listAllUnitsForEmpreendimento, salvos } = vi.hoisted(() => ({
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
            em: '2026-12-10T22:31:00Z' },
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
            presentesFracao: 0.005, presentesUnidades: 4, impedidas: [], em: new Date().toISOString() })),
        lancarVoto: vi.fn(async (itemId: string, unitId: string, opcao: string) =>
            ({ votoId: 'v-novo', itemId, unitId, opcao, origem: 'PRESENCIAL' as const, anterior: null })),
        encerrar: vi.fn(async () => retrato),
        vincularAta: vi.fn(async (_id: string, documentoId: string) => ({ ataDocumentoId: documentoId })),
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
    listAvisos.mockResolvedValue([{ id: 'av1', _leituras: 3 }]);
    listDocumentos.mockResolvedValue([]);
    uploadDocumento.mockImplementation(async (arquivo: File, payload: any) => ({ id: `doc-${payload.categoria}`, ...payload,
        file_name: arquivo.name }));
    listAllUnitsForEmpreendimento.mockResolvedValue([]);
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
        const [arquivo, payload] = uploadDocumento.mock.calls[0];
        expect(arquivo).toBeInstanceOf(File);
        expect((arquivo as File).name).toBe('ata-2026-12-10.pdf');
        expect((arquivo as File).size).toBeGreaterThan(1000); // o PDF real
        expect(payload).toMatchObject({ empreendimento_id: 'emp1', organization_id: 'org-condo', categoria: 'ATA',
            visivel_portal: true });
        expect(screen.queryByRole('button', { name: 'Gerar ata novamente' })).not.toBeInTheDocument();
        expect(await screen.findByText(/Ata gravada em Documentos/)).toBeInTheDocument();
    });

    it('upload falho mostra Gerar ata novamente', async () => {
        const ops = opsFalso(instalada());
        uploadDocumento.mockRejectedValueOnce(new Error('Falha ao enviar o arquivo: rede caiu'));
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
        expect(uploadDocumento).toHaveBeenCalledTimes(2);
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
        listAllUnitsForEmpreendimento.mockResolvedValue([
            { id: 'u1', name: '101', _tower_name: 'Torre A', fracao_ideal_decimal: 0.00125 },
            { id: 'u9', name: 'Estacionamento', _tower_name: 'Torre A', fracao_ideal_decimal: null },
        ]);
        montar(ops);

        fireEvent.click(await screen.findByRole('button', { name: 'Convocar' }));
        const gaveta = await screen.findByRole('dialog', { name: 'Convocar assembleia' });
        expect(await within(gaveta).findByText('Torre A — Estacionamento')).toBeInTheDocument();
        expect(within(gaveta).getByText(/fora da assembleia: sem fração ideal/)).toBeInTheDocument();
        expect(within(gaveta).getByText(/10 dias de antecedência/)).toBeInTheDocument();

        fireEvent.click(within(gaveta).getByRole('button', { name: 'Convocar e publicar aviso' }));
        await waitFor(() => expect(ops.convocar).toHaveBeenCalledWith('a1', textoConvocacao(rascunho, ITENS, NOME_CONDOMINIO)));

        // Convocada: a seção Unidades diz quantos leram o aviso (só informação).
        expect(await screen.findByText(/Aviso de convocação lido por 3 condôminos/)).toBeInTheDocument();
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
        expect(uploadDocumento).toHaveBeenCalledWith(arquivo, expect.objectContaining({
            empreendimento_id: 'emp1', organization_id: 'org-condo', categoria: 'OUTRO', visivel_portal: false,
            titulo: 'Procuração — Torre A — 102 — AGO 2026',
        }));
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
