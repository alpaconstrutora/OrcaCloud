// @vitest-environment jsdom
/**
 * Módulo Qualidade (SiAC), fase 1 — casca, painel do nível e lista controlada
 * (docs/planos/2026-11-25-qualidade-siac-pbqph.md, "Telas (rascunho)" e "Regras de cálculo da tela").
 * O serviço é simulado: aqui se prova o que a tela MOSTRA a partir do que ele devolve.
 *
 *  (a) lista vazia → o vazio orienta: "Carregar a lista mínima do Anexo 4 (27 serviços)",
 *      e o clique grava na organização do topo (REGRA #5: o topo manda, não se pergunta);
 *  (b) 27 serviços no nível B → "procedimento aprovado 0/11" e "começa na fase 2" (nunca zero),
 *      e a coluna Treinados não tem fração "x de y" (sem denominador na fase 1);
 *  (c) 19 materiais → "abaixo do mínimo do Anexo 4: 19 de 20";
 *  (d) "Todas" com itens de 2 organizações → uma linha por organização, com o nome dela;
 *  (e) sem permissão de editar → o botão de carga desligado diz por quê no `title`;
 *  (f) clicar na linha abre o Sheet do item; salvar grava, recarrega e o Sheet fica aberto (§25)
 *      mostrando o item como veio da recarga;
 *  (g) o item some da lista depois de gravar um código → o próximo código soma ao gravado, não ao
 *      item de quando o Sheet abriu;
 *  (h) "Registrar treinamento em obra" do Sheet do item abre o registro; gravar avisa quantos
 *      registros entraram e recarrega (os Treinados do item vêm da recarga).
 */
import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ItemControlado, RegistroTreinamento } from '../../types/qualidadeSiac';
import { MOTIVO_SEM_EDICAO_QUALIDADE } from '../../utils/permissaoQualidadeSiac';

const listarItens = vi.fn();
const listarNiveis = vi.fn();
const carregarAnexo4 = vi.fn();
const carregarSugestaoMateriais = vi.fn();
const resumirProcedimentos = vi.fn();
const listarTreinamentos = vi.fn();
const definirNivel = vi.fn();
const atualizarItem = vi.fn();
const definirCodigos = vi.fn();
const registrarTreinamentoEmObra = vi.fn();
const listEmployees = vi.fn();
let codigosDaBase: string[] = [];

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

vi.mock('../../services/qualidadeSiacService', () => ({
    qualidadeSiacService: {
        listarItens: (...a: unknown[]) => listarItens(...a),
        listarNiveis: (...a: unknown[]) => listarNiveis(...a),
        carregarAnexo4: (...a: unknown[]) => carregarAnexo4(...a),
        carregarSugestaoMateriais: (...a: unknown[]) => carregarSugestaoMateriais(...a),
        resumirProcedimentos: (...a: unknown[]) => resumirProcedimentos(...a),
        listarTreinamentos: (...a: unknown[]) => listarTreinamentos(...a),
        definirNivel: (...a: unknown[]) => definirNivel(...a),
        criarItem: vi.fn(),
        atualizarItem: (...a: unknown[]) => atualizarItem(...a),
        definirCodigos: (...a: unknown[]) => definirCodigos(...a),
        registrarTreinamentoEmObra: (...a: unknown[]) => registrarTreinamentoEmObra(...a),
    },
}));
vi.mock('../../services/trainingsService', () => ({
    trainingsService: { listTrainingCourses: vi.fn(async () => []), createTrainingCourse: vi.fn() },
}));
vi.mock('../../services/laborService', () => ({ laborService: { listEmployees: (...a: unknown[]) => listEmployees(...a) } }));
vi.mock('../../services/documentService', () => ({ documentService: { uploadNewDocument: vi.fn() } }));
// O catálogo da Base instancia o serviço do SINAPI na importação (supabase simulado não tem `from`).
vi.mock('../../components/DatabasePickerModal', () => ({
    default: ({ isOpen, onSelectMany }: { isOpen: boolean; onSelectMany?: (i: Array<{ code: string }>) => void }) =>
        isOpen ? <button type="button" onClick={() => onSelectMany?.(codigosDaBase.map(code => ({ code })))}>confirmar base</button> : null,
}));

import { useStore } from '../../store/useStore';
import { ConfirmProvider } from '../../components/ui/confirm';
import QualidadeModule from '../../components/qualidade/QualidadeModule';

const item = (p: Partial<ItemControlado>): ItemControlado => ({
    id: 'i', organization_id: 'org-a', tipo: 'SERVICO', nome: 'Serviço', etapa: 'Estrutura', origem: 'ANEXO4',
    anexo4_numero: null, chave_padrao: null, substitui_item_id: null, situacao: 'ATIVO', justificativa: null,
    procedure_document_id: null, training_course_id: null, ordem: 0, codigos: [], ...p,
});

const servicos = (n: number, org = 'org-a'): ItemControlado[] =>
    Array.from({ length: n }, (_, i) => item({
        id: `${org}-s${i + 1}`, organization_id: org, nome: `Serviço ${i + 1}`, anexo4_numero: i + 1, ordem: i + 1,
        // dois com curso e registro de treinamento: a coluna Treinados tem de mostrar contagem, não fração
        training_course_id: i < 2 ? `curso-${i + 1}` : null,
        // procedimento em rascunho: aparece na linha, mas não conta no "procedimento aprovado"
        procedure_document_id: i < 2 ? 'doc-1' : null,
    }));

const PROCEDIMENTOS = {
    'doc-1': { id: 'doc-1', nome: 'PES-06', revisao: '2', approval_status: 'rascunho', versao_ativa_em: '2026-09-01T10:00:00Z' },
};

const materiais = (n: number): ItemControlado[] =>
    Array.from({ length: n }, (_, i) => item({
        id: `m${i + 1}`, tipo: 'MATERIAL', nome: `Material ${i + 1}`, etapa: null, origem: 'PROPRIO', ordem: i + 1,
    }));

const TREINOS: Record<string, RegistroTreinamento[]> = {
    'curso-1': [
        { employee_id: 'e1', data_realizacao: '2026-10-01', aprovado: true, externo: false },
        { employee_id: 'e2', data_realizacao: '2026-10-01', aprovado: true, externo: true },
    ],
    'curso-2': [{ employee_id: 'e3', data_realizacao: '2026-10-01', aprovado: true, externo: false }],
};

const montar = (podeEditar = true) => render(<ConfirmProvider><QualidadeModule podeEditar={podeEditar} /></ConfirmProvider>);

/** Células de uma coluna da tabela, achada pelo cabeçalho. */
function celulasDaColuna(rotulo: string): HTMLElement[] {
    const tabela = screen.getByRole('table');
    const cabecalhos = within(tabela).getAllByRole('columnheader');
    const idx = cabecalhos.findIndex(h => h.textContent?.trim().startsWith(rotulo));
    expect(idx).toBeGreaterThanOrEqual(0);
    const linhas = within(tabela).getAllByRole('row').slice(1);
    return linhas.map(l => within(l).getAllByRole('cell')[idx]);
}

beforeEach(() => {
    localStorage.clear();
    listarItens.mockReset().mockResolvedValue([]);
    listarNiveis.mockReset().mockResolvedValue({});
    carregarAnexo4.mockReset().mockResolvedValue(27);
    carregarSugestaoMateriais.mockReset().mockResolvedValue(24);
    resumirProcedimentos.mockReset().mockResolvedValue({});
    listarTreinamentos.mockReset().mockResolvedValue({});
    definirNivel.mockReset().mockResolvedValue(undefined);
    atualizarItem.mockReset().mockResolvedValue(undefined);
    definirCodigos.mockReset().mockResolvedValue(undefined);
    registrarTreinamentoEmObra.mockReset().mockResolvedValue(2);
    listEmployees.mockReset().mockResolvedValue([]);
    codigosDaBase = [];
    useStore.setState({
        activeOrganizationId: 'org-a',
        activeEmpresaId: null,
        organizations: [
            { id: 'org-a', name: 'Construtora A', address: {}, members: [] },
            { id: 'org-b', name: 'Construtora B', address: {}, members: [] },
        ] as never,
        viewFocus: null,
    });
});

describe('Qualidade (SiAC) — lista controlada e painel do nível', () => {
    it('(a) lista vazia: o vazio oferece carregar o Anexo 4 e grava na organização do topo', async () => {
        const user = userEvent.setup();
        montar();
        await waitFor(() => expect(listarItens).toHaveBeenCalledWith('org-a'));
        const botao = await screen.findByRole('button', { name: 'Carregar a lista mínima do Anexo 4 (27 serviços)' });
        await user.click(botao);
        await waitFor(() => expect(carregarAnexo4).toHaveBeenCalledWith('org-a'));
        // recarrega depois de gravar
        await waitFor(() => expect(listarItens).toHaveBeenCalledTimes(2));
    });

    it('(b) 27 serviços no nível B: procedimento aprovado 0/11, fases futuras rotuladas, Treinados sem fração', async () => {
        listarItens.mockResolvedValue(servicos(27));
        listarTreinamentos.mockResolvedValue(TREINOS);
        resumirProcedimentos.mockResolvedValue(PROCEDIMENTOS);
        montar();
        const painel = await screen.findByRole('region', { name: /Quanto falta para o nível/ });
        await waitFor(() => expect(within(painel).getByText(/procedimento aprovado 0\/11/)).toBeTruthy());
        expect(within(painel).getAllByText(/começa na fase 2/).length).toBeGreaterThan(0);
        // a META das colunas futuras aparece ao lado do rótulo (40% de 27 = 11; metade = 6; um quarto = 3)
        expect(within(painel).getByText(/aplicados com registro: meta 6 — começa na fase 2/)).toBeTruthy();
        expect(within(painel).getByText(/em obra em andamento: meta 3 — começa na fase 2/)).toBeTruthy();
        await waitFor(() => expect(listarTreinamentos).toHaveBeenCalledWith(['curso-1', 'curso-2']));

        const treinados = celulasDaColuna('Treinados');
        expect(treinados.length).toBe(27);
        await waitFor(() => expect(treinados.some(c => /2 \(1 próprios, 1 empreit\.\)/.test(c.textContent ?? ''))).toBe(true));
        for (const c of celulasDaColuna('Treinados')) expect(c.textContent ?? '').not.toMatch(/\d+ de \d+/);
    });

    it('(c) 19 materiais: aviso de abaixo do mínimo do Anexo 4', async () => {
        listarItens.mockResolvedValue([...servicos(27), ...materiais(19)]);
        montar();
        const painel = await screen.findByRole('region', { name: /Quanto falta para o nível/ });
        await waitFor(() => expect(within(painel).getByText(/abaixo do mínimo do Anexo 4: 19 de 20/)).toBeTruthy());
    });

    it('(d) "Todas" com itens de 2 organizações: uma linha por organização, com o nome dela', async () => {
        useStore.setState({ activeOrganizationId: null });
        listarItens.mockResolvedValue([...servicos(3, 'org-a'), ...servicos(2, 'org-b')]);
        listarNiveis.mockResolvedValue({ 'org-b': 'A' });
        montar();
        await waitFor(() => expect(listarItens).toHaveBeenCalledWith(null));
        const painel = await screen.findByRole('region', { name: /Quanto falta para o nível/ });
        await waitFor(() => expect(within(painel).getAllByRole('listitem').length).toBe(2));
        const [a, b] = within(painel).getAllByRole('listitem');
        expect(a.textContent).toContain('Construtora A');
        expect(a.textContent).toContain('Serviços (3)');
        expect(b.textContent).toContain('Construtora B');
        expect(b.textContent).toContain('Serviços (2)');
        // nível por organização: B é o padrão de quem não tem linha; A veio do banco
        expect((within(a).getByLabelText(/Nível alvo/) as HTMLSelectElement).value).toBe('B');
        expect((within(b).getByLabelText(/Nível alvo/) as HTMLSelectElement).value).toBe('A');
    });

    it('(e) sem permissão de editar: o botão de carga fica desligado e diz por quê', async () => {
        montar(false);
        const botao = await screen.findByRole('button', { name: 'Carregar a lista mínima do Anexo 4 (27 serviços)' }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        expect(botao.title).toBe(MOTIVO_SEM_EDICAO_QUALIDADE);
    });
    it('(b2) nível A: 27 serviços pedem 27 procedimentos, meta 14 aplicados e 7 em obra', async () => {
        listarItens.mockResolvedValue(servicos(27));
        listarNiveis.mockResolvedValue({ 'org-a': 'A' });
        montar();
        const painel = await screen.findByRole('region', { name: /Quanto falta para o nível A/ });
        await waitFor(() => expect(within(painel).getByText(/procedimento aprovado 0\/27/)).toBeTruthy());
        expect(within(painel).getByText(/aplicados com registro: meta 14 — começa na fase 2/)).toBeTruthy();
        expect(within(painel).getByText(/em obra em andamento: meta 7 — começa na fase 2/)).toBeTruthy();
    });

    it('troca de organização durante a gravação: a recarga é da organização NOVA (REGRA #5)', async () => {
        const user = userEvent.setup();
        listarItens.mockImplementation(async (org: string | null) => (org === 'org-b' ? servicos(3, 'org-b') : []));
        let terminarCarga: (n: number) => void = () => undefined;
        carregarAnexo4.mockImplementation(() => new Promise<number>(r => { terminarCarga = r; }));
        montar();
        await user.click(await screen.findByRole('button', { name: 'Carregar a lista mínima do Anexo 4 (27 serviços)' }));
        await waitFor(() => expect(carregarAnexo4).toHaveBeenCalledWith('org-a'));

        act(() => { useStore.setState({ activeOrganizationId: 'org-b' }); });
        await waitFor(() => expect(listarItens).toHaveBeenCalledWith('org-b'));
        expect(await screen.findByText('Serviço 1')).toBeTruthy();

        await act(async () => { terminarCarga(27); });
        await waitFor(() => expect(listarItens).toHaveBeenCalledTimes(3));
        expect(listarItens).toHaveBeenLastCalledWith('org-b');
        await waitFor(() => expect(screen.getByText('Serviço 1')).toBeTruthy());
        expect(screen.queryByRole('button', { name: 'Carregar a lista mínima do Anexo 4 (27 serviços)' })).toBeNull();
    });

    it('falha de carga: só a faixa de erro, sem o vazio que oferece carregar', async () => {
        listarItens.mockRejectedValue(new Error('timeout do banco'));
        montar();
        expect(await screen.findByText(/Não foi possível carregar a lista controlada: timeout do banco/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Carregar a lista mínima do Anexo 4 (27 serviços)' })).toBeNull();
        expect(screen.queryByText('Nenhum serviço controlado')).toBeNull();
    });

    it('toast da carga conta o que entrou: "27 serviços incluídos"', async () => {
        const user = userEvent.setup();
        montar();
        await user.click(await screen.findByRole('button', { name: 'Carregar a lista mínima do Anexo 4 (27 serviços)' }));
        expect(await screen.findByText('27 serviços incluídos.')).toBeTruthy();
    });

    it('toast da carga sem nada novo: "Nada novo: a lista já estava carregada"', async () => {
        const user = userEvent.setup();
        carregarAnexo4.mockResolvedValue(0);
        montar();
        await user.click(await screen.findByRole('button', { name: 'Carregar a lista mínima do Anexo 4 (27 serviços)' }));
        expect(await screen.findByText('Nada novo: a lista já estava carregada.')).toBeTruthy();
    });

    it('(f) clicar na linha abre o item; salvar grava, recarrega e o Sheet fica aberto com o item recarregado', async () => {
        const user = userEvent.setup();
        let nome = 'Serviço 1';
        listarItens.mockImplementation(async () => [item({ id: 's1', nome, anexo4_numero: 1, ordem: 1 })]);
        atualizarItem.mockImplementation(async (_id: string, patch: { nome: string }) => { nome = patch.nome; });
        montar();
        await user.click(await screen.findByText('Serviço 1'));
        const campo = await screen.findByLabelText('Nome');
        await user.clear(campo);
        await user.type(campo, 'Serviço renomeado');
        await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
        await waitFor(() => expect(atualizarItem).toHaveBeenCalledWith('s1', expect.objectContaining({ nome: 'Serviço renomeado' })));
        await waitFor(() => expect(listarItens).toHaveBeenCalledTimes(2));
        // continua aberto (§25) e o título já é o do item recarregado
        expect(await screen.findByRole('heading', { name: 'Serviço renomeado' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy();
    });

    it('(g) item some da lista depois de gravar C1: incluir C2 grava [C1, C2]', async () => {
        const user = userEvent.setup();
        listarItens.mockResolvedValueOnce([item({ id: 's1', nome: 'Serviço 1', anexo4_numero: 1, ordem: 1 })]);
        listarItens.mockResolvedValue([]); // a recarga depois de gravar já não traz o item
        montar();
        await user.click(await screen.findByText('Serviço 1'));
        codigosDaBase = ['C1'];
        await user.click(await screen.findByRole('button', { name: 'Buscar composição na Base' }));
        await user.click(screen.getByRole('button', { name: 'confirmar base' }));
        await waitFor(() => expect(definirCodigos).toHaveBeenCalledWith('s1', ['C1']));
        await waitFor(() => expect(listarItens).toHaveBeenCalledTimes(2));
        codigosDaBase = ['C2'];
        await waitFor(() => expect((screen.getByRole('button', { name: 'Buscar composição na Base' }) as HTMLButtonElement).disabled).toBe(false));
        await user.click(screen.getByRole('button', { name: 'Buscar composição na Base' }));
        await user.click(screen.getByRole('button', { name: 'confirmar base' }));
        await waitFor(() => expect(definirCodigos).toHaveBeenCalledTimes(2));
        expect(definirCodigos).toHaveBeenLastCalledWith('s1', ['C1', 'C2']);
    });

    it('(h) Registrar treinamento em obra: abre pelo Sheet do item, grava, avisa e recarrega', async () => {
        const user = userEvent.setup();
        listarItens.mockResolvedValue([item({ id: 's1', nome: 'Serviço 1', anexo4_numero: 1, ordem: 1, training_course_id: 'curso-1' })]);
        listEmployees.mockResolvedValue([
            { id: 'e1', org_id: 'org-a', name: 'Ana Própria', contract_type: 'CLT', status: 'ATIVO', role: 'Pedreira' },
            { id: 'e2', org_id: 'org-a', name: 'Bruno Próprio', contract_type: 'CLT', status: 'ATIVO', role: 'Servente' },
        ]);
        montar();
        await user.click(await screen.findByText('Serviço 1'));
        await user.click(await screen.findByRole('button', { name: 'Registrar treinamento em obra' }));
        expect(await screen.findByRole('heading', { name: 'Registrar treinamento em obra' })).toBeTruthy();
        await user.click(await screen.findByRole('checkbox', { name: /Ana Própria/ }));
        await user.click(screen.getByRole('checkbox', { name: /Bruno Próprio/ }));
        await user.click(screen.getByRole('button', { name: 'Registrar treinamento' }));
        await waitFor(() => expect(registrarTreinamentoEmObra).toHaveBeenCalledWith(expect.objectContaining({
            organizationId: 'org-a', courseId: 'curso-1', employeeIds: ['e1', 'e2'], novosTerceiros: [],
        })));
        expect(await screen.findByText('2 registros de treinamento gravados.')).toBeTruthy();
        await waitFor(() => expect(listarItens).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(listarTreinamentos).toHaveBeenCalledTimes(2));
        // o registro fecha; o Sheet do item continua aberto
        await waitFor(() => expect(screen.queryByRole('heading', { name: 'Registrar treinamento em obra' })).toBeNull());
        expect(screen.getByRole('heading', { name: 'Serviço 1' })).toBeTruthy();
    });
});
