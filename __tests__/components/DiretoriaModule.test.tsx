// @vitest-environment jsdom
/**
 * Diretoria (ÒPURA CEO) — a tela. Plano: docs/planos/2026-11-17-opura-ceo.md, Tarefa 6.
 *
 * O serviço é simulado (as RPCs `fn_diretoria_*` têm prova SQL própria). Aqui se confere o que
 * o typecheck e o `check-ui-standard.sh` não veem: que as três visões RENDERIZAM com o mesmo
 * painel e que cada ação chama o serviço com a organização certa (REGRA #5) e os dados do grupo.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { PainelDiretoria, GrupoExcecao, Determinacao } from '../../utils/diretoria';

const painel = vi.fn();
const preferencias = vi.fn();
const gravarVisao = vi.fn();
const gravarSilenciados = vi.fn();
const cobrar = vi.fn();
const determinar = vi.fn();
const definirArea = vi.fn();
const definirChefe = vi.fn();
const atualizar = vi.fn();
const concluir = vi.fn();
const gravarResumoSemanal = vi.fn();
const enviarPrevia = vi.fn();

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../../services/diretoriaService', () => ({
    VISOES: ['fila', 'responsavel', 'reuniao'],
    diretoriaService: {
        painel: (...a: unknown[]) => painel(...a),
        preferencias: (...a: unknown[]) => preferencias(...a),
        gravarVisao: (...a: unknown[]) => gravarVisao(...a),
        gravarSilenciados: (...a: unknown[]) => gravarSilenciados(...a),
        cobrar: (...a: unknown[]) => cobrar(...a),
        determinar: (...a: unknown[]) => determinar(...a),
        definirArea: (...a: unknown[]) => definirArea(...a),
        definirChefe: (...a: unknown[]) => definirChefe(...a),
        atualizar: (...a: unknown[]) => atualizar(...a),
        concluir: (...a: unknown[]) => concluir(...a),
        gravarResumoSemanal: (...a: unknown[]) => gravarResumoSemanal(...a),
        enviarPrevia: (...a: unknown[]) => enviarPrevia(...a),
    },
}));

// O topo (REGRA #5): a tela lê SÓ `useOrgContext()`. O resto do hook (useOrgWriteTarget,
// forEachTargetOrg) é o de verdade e lê o store — que o `beforeEach` deixa igual a este contexto.
let orgDoTopo: string | null = 'org-a';
vi.mock('../../hooks/useOrgContext', async (original) => {
    const real = await original<typeof import('../../hooks/useOrgContext')>();
    return {
        ...real,
        useOrgContext: () => ({ orgId: orgDoTopo, isAllOrgs: orgDoTopo === null, source: orgDoTopo ? 'organization' : 'all' }),
    };
});

import { useStore } from '../../store/useStore';
import { ConfirmProvider } from '../../components/ui/confirm';
import DiretoriaModule from '../../components/diretoria/DiretoriaModule';
import { MOTIVO_SEM_EDICAO_DIRETORIA } from '../../utils/permissaoDiretoria';

const HOJE = '2026-11-17';

const grupo = (p: Partial<GrupoExcecao>): GrupoExcecao => ({
    chave: 'k', tipo: 'conta_vencida', org_id: 'org-a', grupo: null, severidade: 'atencao', origem_responsavel: 'area',
    responsaveis: [], quantidade: 1, valor: null, dias: 10, data_ref: '2026-11-07', itens: [], ...p,
});
const det = (p: Partial<Determinacao>): Determinacao => ({
    id: 'd', organization_id: 'org-a', titulo: 'D', responsavel_user_id: 'u-lia', prazo: '2026-11-24', status: 'aberta',
    origem: null, excecao_chave: null, criada_por: 'u-ceo', criada_em: '2026-11-10T13:00:00Z', concluida_em: null,
    atualizacoes: [], ...p,
});

/** ≥ 2 grupos de tipos diferentes, 1 determinação vencida, hierarquia com 2 níveis. */
const painelBase = (p: Partial<PainelDiretoria> = {}): PainelDiretoria => ({
    hoje: HOJE,
    orgs: [{ id: 'org-a', nome: 'Construtora A', pode_editar: true }],
    excecoes: [
        grupo({
            chave: 'k-conta', tipo: 'conta_vencida', severidade: 'critico', origem_responsavel: 'area', responsaveis: ['u-lia'],
            quantidade: 694, valor: 1415562, dias: 45, data_ref: '2026-10-03',
            itens: [{ id: 'i1', titulo: 'Concreteira Pedra Alta — NF 4471', valor: 38750, dias: 45, data: '2026-10-03' }],
        }),
        grupo({
            chave: 'k-parcela', tipo: 'parcela_cliente', severidade: 'atencao', origem_responsavel: 'dado', responsaveis: ['u-julio'],
            quantidade: 14, valor: 52300, dias: 20, data_ref: '2026-10-28',
        }),
        grupo({
            chave: 'k-doc', tipo: 'documento_vencido', severidade: 'acompanhar', origem_responsavel: 'nenhum', responsaveis: [],
            quantidade: 6, dias: 3, data_ref: '2026-11-14',
        }),
    ],
    erros: {},
    pessoas: [
        { user_id: 'u-ceo', nome: 'Ana Diretora', email: 'ana@x.com', cargo: 'Diretoria', orgs: ['org-a'] },
        { user_id: 'u-marina', nome: 'Marina Couto', email: 'marina@x.com', cargo: 'Diretora financeira', orgs: ['org-a'] },
        { user_id: 'u-lia', nome: 'Lia Ramos', email: 'lia@x.com', cargo: 'Contas a pagar', orgs: ['org-a'] },
        { user_id: 'u-julio', nome: 'Júlio Teles', email: 'julio@x.com', cargo: 'Comercial', orgs: ['org-a'] },
    ],
    hierarquia: [
        { organization_id: 'org-a', user_id: 'u-marina', chefe_user_id: 'u-ceo', atualizado_em: '2026-11-01T00:00:00Z' },
        { organization_id: 'org-a', user_id: 'u-lia', chefe_user_id: 'u-marina', atualizado_em: '2026-11-01T00:00:00Z' },
    ],
    areas: [{ organization_id: 'org-a', area: 'financeiro', user_id: 'u-lia', atualizado_em: '2026-11-01T00:00:00Z' }],
    determinacoes: [
        det({ id: 'd1', titulo: 'Regularizar os ASO vencidos', prazo: '2026-11-15', status: 'aberta' }),
        det({ id: 'd2', titulo: 'Zerar o extrato de outubro', prazo: '2026-11-22', status: 'andamento', responsavel_user_id: 'u-marina',
            atualizacoes: [{ texto: 'de 41 para 18 linhas', autor: 'u-marina', criada_em: '2026-11-13T12:00:00Z' }] }),
    ],
    cobrancas: [],
    semana_anterior: null,
    ...p,
});

const montar = () => render(<ConfirmProvider><DiretoriaModule onNavigate={vi.fn()} /></ConfirmProvider>);

/** A linha de um grupo — `<li>` com o título do grupo como nome acessível. */
const linhaDoGrupo = (titulo: string) => screen.findByRole('listitem', { name: titulo });

beforeEach(() => {
    localStorage.clear();
    orgDoTopo = 'org-a';
    for (const f of [painel, preferencias, gravarVisao, gravarSilenciados, cobrar, determinar, definirArea, definirChefe, atualizar, concluir, gravarResumoSemanal, enviarPrevia]) f.mockReset();
    gravarResumoSemanal.mockResolvedValue(undefined);
    enviarPrevia.mockResolvedValue(1);
    painel.mockResolvedValue(painelBase());
    preferencias.mockResolvedValue({ visao: null, silenciados: [], resumoSemanal: false });
    gravarVisao.mockResolvedValue(undefined);
    gravarSilenciados.mockResolvedValue(undefined);
    cobrar.mockResolvedValue({ criadas: 1, ja_abertas: 0 });
    determinar.mockResolvedValue('nova-id');
    useStore.setState({
        activeOrganizationId: 'org-a',
        activeEmpresaId: null,
        organizations: [
            { id: 'org-a', name: 'Construtora A', address: {}, members: [{ id: 'm1', name: 'Ana', email: 'ana@x.com', role: 'admin', joinedAt: '', userId: 'u-ceo', permissions: {} }] },
            { id: 'org-b', name: 'Construtora B', address: {}, members: [{ id: 'm2', name: 'Ana', email: 'ana@x.com', role: 'admin', joinedAt: '', userId: 'u-ceo', permissions: {} }] },
        ] as never,
        currentProfile: { ...useStore.getState().currentProfile, email: 'ana@x.com' },
    });
});

describe('Diretoria — tela', () => {
    it('as três visões renderizam com o mesmo painel, e trocar a visão grava a escolha', async () => {
        const user = userEvent.setup();
        montar();
        expect(await screen.findByRole('heading', { level: 1, name: 'Diretoria' })).toBeTruthy();
        await waitFor(() => expect(painel).toHaveBeenCalledWith('org-a'));

        // Fila de exceções (padrão): grupos por gravidade + determinações em aberto ao lado.
        expect(await linhaDoGrupo('694 contas a pagar vencidas')).toBeTruthy();
        expect(screen.getByRole('heading', { name: /Pede decisão/ })).toBeTruthy();
        expect(screen.getByRole('heading', { name: /Determinações em aberto/ })).toBeTruthy();
        expect(screen.getByText('Regularizar os ASO vencidos')).toBeTruthy();

        // Por responsável: a árvore com 2 níveis e as contagens.
        await user.click(screen.getByRole('tab', { name: 'Por responsável' }));
        expect(gravarVisao).toHaveBeenLastCalledWith('responsavel');
        expect(await screen.findByRole('heading', { name: 'Quem responde a quem' })).toBeTruthy();
        const arvore = screen.getByRole('tree');
        expect(within(arvore).getByRole('treeitem', { name: /Marina Couto/ })).toBeTruthy();
        expect(within(arvore).getByRole('treeitem', { name: /Lia Ramos/ })).toBeTruthy();
        expect(within(arvore).getByRole('treeitem', { name: /Sem responsável/ })).toBeTruthy();

        // Reunião da semana: prévia do resumo + quadro 2×2.
        await user.click(screen.getByRole('tab', { name: 'Reunião da semana' }));
        expect(gravarVisao).toHaveBeenLastCalledWith('reuniao');
        expect(await screen.findByRole('heading', { name: /Semana 47/ })).toBeTruthy();
        expect(screen.getByText(/A comparação começa depois da primeira foto da semana/)).toBeTruthy();
        for (const coluna of ['Vencidas', 'Abertas', 'Em andamento', 'Concluídas']) {
            expect(screen.getByRole('heading', { name: new RegExp(`^${coluna}`) })).toBeTruthy();
        }
        expect(screen.getByRole('heading', { name: 'Nova determinação' })).toBeTruthy();
    });

    it('abre na visão gravada nas preferências', async () => {
        preferencias.mockResolvedValue({ visao: 'reuniao', silenciados: [] });
        montar();
        expect(await screen.findByRole('heading', { name: /Semana 47/ })).toBeTruthy();
        expect(screen.getByRole('tab', { name: 'Reunião da semana' }).getAttribute('aria-selected')).toBe('true');
        expect(gravarVisao).not.toHaveBeenCalled();
    });

    it('KPIs: pedem decisão, fora do trilho (com itens), determinações vencidas, sem responsável', async () => {
        montar();
        const kpi = async (rotulo: string) => (await screen.findByText(rotulo)).parentElement!;
        expect(within(await kpi('Pedem decisão')).getByText('1')).toBeTruthy();
        expect(within(await kpi('Fora do trilho')).getByText('3')).toBeTruthy();
        expect(within(await kpi('Fora do trilho')).getByText('714 itens')).toBeTruthy();
        expect(within(await kpi('Determinações vencidas')).getByText('1')).toBeTruthy();
        expect(within(await kpi('Sem responsável')).getByText('1')).toBeTruthy();
    });

    it('"É barulho" tira o tipo da tela e grava; "Reativar" devolve', async () => {
        const user = userEvent.setup();
        montar();
        const linha = await linhaDoGrupo('694 contas a pagar vencidas');
        await user.click(within(linha).getByRole('button', { name: /É barulho/ }));

        await waitFor(() => expect(screen.queryByRole('listitem', { name: '694 contas a pagar vencidas' })).toBeNull());
        expect(gravarSilenciados).toHaveBeenLastCalledWith(['conta_vencida']);

        await user.click(screen.getByRole('button', { name: 'Silenciados (1)' }));
        await user.click(await screen.findByRole('button', { name: 'Reativar Conta a pagar vencida' }));
        expect(await linhaDoGrupo('694 contas a pagar vencidas')).toBeTruthy();
        expect(gravarSilenciados).toHaveBeenLastCalledWith([]);
    });

    it('fila: a busca (sem caixa nem acento) e o filtro de área recortam os grupos', async () => {
        const user = userEvent.setup();
        montar();
        expect(await linhaDoGrupo('694 contas a pagar vencidas')).toBeTruthy();
        await user.type(screen.getByRole('searchbox', { name: 'Buscar na fila' }), 'julio teles');
        await waitFor(() => expect(screen.queryByRole('listitem', { name: '694 contas a pagar vencidas' })).toBeNull());
        expect(screen.getByRole('listitem', { name: '14 parcelas de clientes vencidas' })).toBeTruthy();

        await user.clear(screen.getByRole('searchbox', { name: 'Buscar na fila' }));
        await user.click(screen.getByRole('button', { name: /^Área/ }));
        await user.click(await screen.findByRole('menuitemradio', { name: /RH/ }));
        expect(await linhaDoGrupo('6 documentos de colaborador vencidos')).toBeTruthy();
        expect(screen.queryByRole('listitem', { name: '14 parcelas de clientes vencidas' })).toBeNull();
    });

    it('silenciados gravados não aparecem na tela nem nos KPIs', async () => {
        preferencias.mockResolvedValue({ visao: null, silenciados: ['conta_vencida'] });
        montar();
        expect(await linhaDoGrupo('14 parcelas de clientes vencidas')).toBeTruthy();
        expect(screen.queryByRole('listitem', { name: '694 contas a pagar vencidas' })).toBeNull();
        const pedem = (await screen.findByText('Pedem decisão')).parentElement!;
        expect(within(pedem).getByText('0')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Silenciados (1)' })).toBeTruthy();
    });

    it('"Cobrar" chama o serviço com a organização, a chave e os responsáveis do grupo', async () => {
        const user = userEvent.setup();
        montar();
        const linha = await linhaDoGrupo('694 contas a pagar vencidas');
        await user.click(within(linha).getByRole('button', { name: /^Cobrar/ }));
        await waitFor(() => expect(cobrar).toHaveBeenCalledWith({
            orgId: 'org-a', chave: 'k-conta', tipo: 'conta_vencida', titulo: '694 contas a pagar vencidas',
            responsaveis: ['u-lia'], tela: 'contas-a-pagar',
        }));
        // Depois de gravar, o painel é lido de novo.
        await waitFor(() => expect(painel).toHaveBeenCalledTimes(2));
    });

    it('grupo já cobrado mostra "cobrado em dd/mm" no lugar do botão', async () => {
        painel.mockResolvedValue(painelBase({
            cobrancas: [{ organization_id: 'org-a', excecao_chave: 'k-conta', tipo: 'conta_vencida', titulo: '694 contas',
                responsavel_user_id: 'u-lia', cobrado_por: 'u-ceo', cobrado_em: '2026-11-16T15:00:00Z' }],
        }));
        montar();
        const linha = await linhaDoGrupo('694 contas a pagar vencidas');
        expect(within(linha).getByText(/cobrado em 16\/11/i)).toBeTruthy();
        expect(within(linha).queryByRole('button', { name: /^Cobrar/ })).toBeNull();
    });

    it('"Virar determinação" abre o formulário com o título e a organização do grupo, sem perguntar — mesmo em "Todas"', async () => {
        const user = userEvent.setup();
        orgDoTopo = null;
        useStore.setState({ activeOrganizationId: null });
        painel.mockResolvedValue(painelBase({
            orgs: [{ id: 'org-a', nome: 'Construtora A', pode_editar: true }, { id: 'org-b', nome: 'Construtora B', pode_editar: true }],
            excecoes: [
                grupo({ chave: 'k-b', tipo: 'entrega_atrasada', org_id: 'org-b', severidade: 'critico', origem_responsavel: 'dado',
                    responsaveis: ['u-julio'], quantidade: 3, dias: 40, data_ref: '2026-10-08' }),
                grupo({ chave: 'k-conta', tipo: 'conta_vencida', severidade: 'atencao', responsaveis: ['u-lia'], quantidade: 2 }),
            ],
            pessoas: painelBase().pessoas.map(p => p.user_id === 'u-julio' ? { ...p, orgs: ['org-a', 'org-b'] } : p),
        }));
        montar();
        await waitFor(() => expect(painel).toHaveBeenCalledWith(null));

        const linha = await linhaDoGrupo('3 entregas de fornecedor atrasadas');
        expect(within(linha).getByText('Construtora B')).toBeTruthy();   // painel com mais de uma org mostra a org do grupo
        await user.click(within(linha).getByRole('button', { name: 'Virar determinação' }));

        const gaveta = await screen.findByRole('dialog', { name: 'Nova determinação' });
        expect((within(gaveta).getByLabelText('Título') as HTMLInputElement).value).toBe('3 entregas de fornecedor atrasadas');
        expect(within(gaveta).getByText('Construtora B')).toBeTruthy();
        expect((within(gaveta).getByLabelText('Responsável') as HTMLSelectElement).value).toBe('u-julio');
        expect((within(gaveta).getByLabelText(/Origem/) as HTMLInputElement).value).toBe('Entrega de fornecedor atrasada');

        await user.click(within(gaveta).getByRole('button', { name: 'Determinar' }));
        await waitFor(() => expect(determinar).toHaveBeenCalledWith({
            orgId: 'org-b', titulo: '3 entregas de fornecedor atrasadas', responsavelId: 'u-julio', prazo: '2026-11-24',
            origem: 'Entrega de fornecedor atrasada', excecaoChave: 'k-b',
        }));
        // Não perguntou a organização: o modal do topo não abriu.
        expect(screen.queryByRole('heading', { name: 'Selecionar organização' })).toBeNull();
    });

    it('org sem permissão de editar: os botões de gravar ficam desligados e dizem o motivo', async () => {
        painel.mockResolvedValue(painelBase({ orgs: [{ id: 'org-a', nome: 'Construtora A', pode_editar: false }] }));
        montar();
        const linha = await linhaDoGrupo('694 contas a pagar vencidas');
        const botaoCobrar = within(linha).getByRole('button', { name: /^Cobrar/ }) as HTMLButtonElement;
        expect(botaoCobrar.disabled).toBe(true);
        expect(botaoCobrar.closest('[title]')?.getAttribute('title')).toBe(MOTIVO_SEM_EDICAO_DIRETORIA);
        const virar = within(linha).getByRole('button', { name: 'Virar determinação' }) as HTMLButtonElement;
        expect(virar.disabled).toBe(true);
        expect(virar.closest('span[title]')?.getAttribute('title')).toBe(MOTIVO_SEM_EDICAO_DIRETORIA);
        // O motivo também aparece escrito (o `title` some no toque).
        expect(screen.getByText(MOTIVO_SEM_EDICAO_DIRETORIA)).toBeTruthy();
        // "É barulho" é preferência pessoal, não gravação na organização: continua ligado.
        expect((within(linha).getByRole('button', { name: /É barulho/ }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('grupo "Sem responsável" leva ao cadastro de responsáveis (Sheet)', async () => {
        const user = userEvent.setup();
        montar();
        const linha = await linhaDoGrupo('6 documentos de colaborador vencidos');
        await user.click(within(linha).getByRole('button', { name: /Sem responsável — cadastrar/ }));
        const gaveta = await screen.findByRole('dialog', { name: 'Responsáveis e hierarquia' });
        expect(within(gaveta).getByLabelText('Financeiro')).toBeTruthy();
        expect((within(gaveta).getByLabelText('Financeiro') as HTMLSelectElement).value).toBe('u-lia');
    });

    it('o KPI "Sem responsável" também abre o cadastro', async () => {
        const user = userEvent.setup();
        montar();
        const kpi = await screen.findByTitle('Abrir o cadastro de responsáveis');
        expect(kpi.tagName).toBe('BUTTON');
        await user.click(kpi);
        expect(await screen.findByRole('dialog', { name: 'Responsáveis e hierarquia' })).toBeTruthy();
    });

    it('cadastro: trocar o responsável de uma área grava na organização do topo', async () => {
        const user = userEvent.setup();
        definirArea.mockResolvedValue(undefined);
        montar();
        await user.click(await screen.findByTitle('Abrir o cadastro de responsáveis'));
        const gaveta = await screen.findByRole('dialog', { name: 'Responsáveis e hierarquia' });
        await user.selectOptions(within(gaveta).getByLabelText('Comercial'), 'u-julio');
        await user.click(within(gaveta).getByRole('button', { name: 'Salvar' }));
        await waitFor(() => expect(definirArea).toHaveBeenCalledWith('org-a', 'comercial', 'u-julio'));
    });

    it('erro 42501 mostra que falta a permissão "Diretoria (CEO)" e onde pedir', async () => {
        painel.mockRejectedValue(Object.assign(new Error('sem acesso'), { code: '42501' }));
        montar();
        expect(await screen.findByText(/Você não tem a permissão "Diretoria \(CEO\)"/)).toBeTruthy();
        expect(screen.getByText(/Permissões detalhadas/)).toBeTruthy();
    });

    it('"Todas" sem nenhuma organização com a permissão mostra a mesma mensagem', async () => {
        orgDoTopo = null;
        useStore.setState({ activeOrganizationId: null });
        painel.mockResolvedValue(painelBase({ orgs: [], excecoes: [], determinacoes: [] }));
        montar();
        await waitFor(() => expect(painel).toHaveBeenCalledWith(null));
        expect(await screen.findByText(/Você não tem a permissão "Diretoria \(CEO\)"/)).toBeTruthy();
    });

    it('tipo que o banco não conseguiu ler vira aviso discreto, sem esconder o resto', async () => {
        painel.mockResolvedValue(painelBase({ erros: { extrato_sem_conciliar: 'statement timeout' } }));
        montar();
        expect(await screen.findByText(/Não foi possível ler: Extrato sem conciliar/)).toBeTruthy();
        expect(await linhaDoGrupo('694 contas a pagar vencidas')).toBeTruthy();
    });
});

// Tarefa 11 (plano docs/planos/2026-11-17-opura-ceo.md): o resumo por e-mail na "Reunião da semana".
describe('Reunião da semana — resumo por e-mail e "melhorou × piorou"', () => {
    beforeEach(() => { preferencias.mockResolvedValue({ visao: 'reuniao', silenciados: [], resumoSemanal: false }); });

    it('ligar "Receber por e-mail" grava a preferência; desligar apaga', async () => {
        const user = userEvent.setup();
        montar();
        const caixa = await screen.findByRole('checkbox', { name: /Receber este resumo por e-mail toda segunda/ });
        expect((caixa as HTMLInputElement).checked).toBe(false);
        await user.click(caixa);
        await waitFor(() => expect(gravarResumoSemanal).toHaveBeenLastCalledWith(true));
        expect((caixa as HTMLInputElement).checked).toBe(true);
        await user.click(caixa);
        await waitFor(() => expect(gravarResumoSemanal).toHaveBeenLastCalledWith(false));
    });

    it('a preferência gravada abre marcada', async () => {
        preferencias.mockResolvedValue({ visao: 'reuniao', silenciados: [], resumoSemanal: true });
        montar();
        const caixa = await screen.findByRole('checkbox', { name: /Receber este resumo por e-mail toda segunda/ });
        await waitFor(() => expect((caixa as HTMLInputElement).checked).toBe(true));
    });

    it('"Enviar uma prévia para mim agora" chama a function e avisa; falha aparece', async () => {
        const user = userEvent.setup();
        montar();
        await user.click(await screen.findByRole('button', { name: /Enviar uma prévia para mim agora/ }));
        await waitFor(() => expect(enviarPrevia).toHaveBeenCalledTimes(1));
        expect(await screen.findByText(/Prévia enviada para o seu e-mail/)).toBeTruthy();
        enviarPrevia.mockRejectedValue(new Error('A prévia não saiu: função não publicada.'));
        await user.click(screen.getByRole('button', { name: /Enviar uma prévia para mim agora/ }));
        expect(await screen.findByText(/A prévia não saiu/)).toBeTruthy();
    });

    it('sem foto da semana anterior, avisa quando a comparação começa', async () => {
        montar();
        expect(await screen.findByText(/A comparação começa depois da primeira foto da semana/)).toBeTruthy();
    });

    it('com a foto, compara por tipo e as determinações vencidas (menos é melhor)', async () => {
        painel.mockResolvedValue(painelBase({
            semana_anterior: { semana: '2026-11-09', por_tipo: { conta_vencida: { quantidade: 700, valor: 1 }, documento_vencido: { quantidade: 6, valor: null } }, determinacoes_vencidas: 0 },
        }));
        montar();
        const bloco = await screen.findByRole('region', { name: /Melhorou × piorou/ });
        expect(within(bloco).getByText(/Conta a pagar vencida: 700 → 694/)).toBeTruthy();
        expect(within(bloco).getByText(/Documento de colaborador vencido: 6 → 6/)).toBeTruthy();
        expect(within(bloco).getByText(/Parcela de cliente vencida: 0 → 14/)).toBeTruthy();
        expect(within(bloco).getByText(/Determinações vencidas: 0 → 1/)).toBeTruthy();
        expect(within(bloco).getAllByText('melhorou').length).toBe(1);
        expect(within(bloco).getAllByText('piorou').length).toBe(2);
    });
});

describe('Reunião da semana — "4. O resto, em números" igual ao e-mail', () => {
    it('só os grupos que NÃO pedem decisão (os críticos já estão no bloco 1)', async () => {
        preferencias.mockResolvedValue({ visao: 'reuniao', silenciados: [], resumoSemanal: false });
        montar();
        const bloco = await screen.findByRole('region', { name: /O resto, em números/ });
        expect(within(bloco).getByText('Parcela de cliente vencida')).toBeTruthy();
        expect(within(bloco).getByText('Documento de colaborador vencido')).toBeTruthy();
        expect(within(bloco).queryByText('Conta a pagar vencida')).toBeNull();
    });
});
