// @vitest-environment jsdom
/**
 * Módulo Riscos — Fase 2 na tela (docs/planos/2026-11-13-modulo-riscos.md, F2.1–F2.5).
 * As tabelas da fase 2 ainda não existem no banco remoto: o serviço é simulado. O que se
 * prova aqui é o que o typecheck não vê — a tela chama o serviço certo, com a organização
 * e a obra DO RISCO, e reflete o que o banco devolve:
 *
 *  - Painel "Com sinal ativo" = lista do Registro com o recorte (CA11) e a coluna Sinais;
 *  - aba Aprovações lista quem exige e não foi enviado; a ficha envia e, pendente, diz quem aprova;
 *  - Vínculos: sinal do vínculo, seletor restrito à obra, "já vinculado", duplicado (23505) legível;
 *  - Ocorrências: materializar pergunta antes e o cabeçalho passa a "Materializado";
 *  - "Sugerir riscos": tipologia da obra, condição sobe o item, já usado fica fora, cria em lote.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ProjectRisk, RiskCatalogItem, RiskLink, RiskSinal } from '../../types/risk';

const { fn, chama } = vi.hoisted(() => {
    const fn = {
        listarRiscos: vi.fn(), listarSinais: vi.fn(), listarVinculos: vi.fn(), vincular: vi.fn(),
        listarContratosVinculaveis: vi.fn(), enviarParaAprovacao: vi.fn(), podeAprovar: vi.fn(), aprovadoresDoNivel: vi.fn(),
        registrarOcorrencia: vi.fn(), listarCatalogo: vi.fn(), criarEmLote: vi.fn(), salvarPerfilObra: vi.fn(), obterPerfilObra: vi.fn(),
    };
    const chama = (k: keyof typeof fn) => (...a: unknown[]) => fn[k](...a);
    return { fn, chama };
});

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../services/riskService', async () => {
    const real = await vi.importActual<typeof import('../../services/riskService')>('../../services/riskService');
    return {
        fichaDoCatalogo: real.fichaDoCatalogo,
        riskService: {
            listarRiscos: chama('listarRiscos'),
            listarAcoes: vi.fn(async () => []),
            listarFaixasPorOrg: vi.fn(async () => ({})),
            listarCategorias: vi.fn(async () => []),
            listarEmpreendimentos: vi.fn(async () => []),
            listarContratos: vi.fn(async () => []),
            listarCatalogo: chama('listarCatalogo'),
            listarAvaliacoes: vi.fn(async () => []),
            listarHistorico: vi.fn(async () => []),
            listarDocumentosSst: vi.fn(async () => []),
            obterRisco: vi.fn(async () => null),
            listarSinais: chama('listarSinais'),
            listarOcorrencias: vi.fn(async () => []),
            listarVinculos: chama('listarVinculos'),
            vincular: chama('vincular'),
            listarContratosVinculaveis: chama('listarContratosVinculaveis'),
            enviarParaAprovacao: chama('enviarParaAprovacao'),
            podeAprovar: chama('podeAprovar'),
            aprovadoresDoNivel: chama('aprovadoresDoNivel'),
            registrarOcorrencia: chama('registrarOcorrencia'),
            criarEmLote: chama('criarEmLote'),
            salvarPerfilObra: chama('salvarPerfilObra'),
            obterPerfilObra: chama('obterPerfilObra'),
        },
    };
});

import { useStore } from '../../store/useStore';
import { ConfirmProvider } from '../../components/ui/confirm';
import { ToastProvider } from '../../components/ui/toast';
import RiscosModule from '../../components/riscos/RiscosModule';

const risco = (p: Partial<ProjectRisk>): ProjectRisk => ({
    id: 'r', organization_id: 'org-a', numero: 1, codigo: 'RSC-0001', catalog_id: null, catalog_codigo: null, catalog_versao: null,
    category_id: null, tipo: 'ameaca', titulo: 'Risco', causa: 'c', evento: 'e', consequencia: 'q', tags: [], dimensoes: [],
    escopo: 'obra', empreendimento_id: null, project_id: 'obra-1', contract_id: null, frente: null, localizacao: null, fase: null,
    partes_afetadas: null, owner_user_id: 'u1', owner_nome: 'Ana', avaliador_user_id: null, aprovador_user_id: null,
    data_identificacao: '2026-11-01', proxima_revisao: '2099-12-01', controles_existentes: null, estrategia: null,
    plano_resposta: null, contingencia: null, justificativa_aceite: null, status: 'identificado', encerramento_motivo: null,
    encerrado_em: null, gatilho_critico: false, gatilho_motivo: null, inerente_probabilidade: null, inerente_impacto: null,
    inerente_pontuacao: null, residual_probabilidade: null, residual_impacto: null, residual_pontuacao: null, valor_esperado: null,
    ultima_avaliacao_em: null, sst_document_tipo: null, sst_document_id: null,
    approval_status: null, approval_chain: [], approval_required_levels: null, created_at: '', updated_at: '', ...p,
});

const R1 = risco({ id: 'r1', numero: 1, codigo: 'RSC-0001', titulo: 'Recalque na torre B', catalog_id: 'cat-101', inerente_pontuacao: 12 });
const R2 = risco({ id: 'r2', numero: 2, codigo: 'RSC-0002', titulo: 'Atraso de aprovação na prefeitura' });
const R3 = risco({ id: 'r3', numero: 3, codigo: 'RSC-0003', titulo: 'Aceitar chuva de verão', estrategia: 'aceitar', justificativa_aceite: 'custo' });

const SINAL: RiskSinal = { project_risk_id: 'r1', link_id: 'l1', modulo: 'contrato', external_label: 'Contrato 012 · Grua', sinal: 'Contrato vencido', gravidade: 'alta' };
const LINK: RiskLink = { id: 'l1', organization_id: 'org-a', project_risk_id: 'r1', modulo: 'contrato', external_id: 'c1', external_ref: {}, external_label: 'Contrato 012 · Grua', created_at: '' };

const item = (p: Partial<RiskCatalogItem>): RiskCatalogItem => ({
    id: 'cat', organization_id: null, category_id: 'r05', codigo: 'R05.01', evento: 'Evento', causas: ['c'], consequencias: ['q'],
    controles_preventivos: [], controles_resposta: [], sinais_alerta: [], dimensoes: ['seguranca'], fases: ['fundacoes'],
    tipologias: ['residencial'], condicoes_sugestao: [], integracoes: [], referencias: [], gatilho_critico: false, gatilho_motivo: null,
    revisao_tecnica: 'rascunho', versao: 1, ativo: true, updated_at: '', ...p,
});

const montar = () => render(<ToastProvider><ConfirmProvider><RiscosModule podeEditar /></ConfirmProvider></ToastProvider>);

beforeEach(() => {
    localStorage.clear();
    Object.values(fn).forEach(f => f.mockReset());
    fn.listarRiscos.mockResolvedValue([R1, R2, R3]);
    fn.listarSinais.mockResolvedValue([SINAL]);
    fn.listarVinculos.mockResolvedValue([]);
    fn.listarCatalogo.mockResolvedValue([]);
    fn.obterPerfilObra.mockResolvedValue(null);
    fn.salvarPerfilObra.mockResolvedValue(undefined);
    useStore.setState({
        activeOrganizationId: 'org-a',
        activeEmpresaId: null,
        organizations: [{ id: 'org-a', name: 'Construtora A', address: {}, members: [
            { id: 'm1', name: 'Ana', email: 'ana@x.com', role: 'admin', joinedAt: '', userId: 'u1', permissions: {} },
        ] }] as never,
        projects: [{ id: 'obra-1', name: 'Residencial Aurora', settings: { tipoObra: 'residencial_multifamiliar' } as never, budget: [], organization_id: 'org-a' }],
        allProjects: [{ id: 'obra-1', name: 'Residencial Aurora', settings: { classification: 'OBRA' } as never, budget: [], organization_id: 'org-a' }],
        currentProfile: { ...useStore.getState().currentProfile, email: 'ana@x.com' },
        session: { user: { id: 'u1', email: 'ana@x.com' } } as never,
        viewFocus: null,
    });
});

const abrirFichaDoRegistro = async (user: ReturnType<typeof userEvent.setup>, titulo: string) => {
    localStorage.setItem('riscos:aba', JSON.stringify('registro'));
    montar();
    await user.click(await screen.findByText(titulo));
    return within(await screen.findByRole('dialog'));
};

describe('Riscos — Fase 2 na tela', () => {
    it('Painel "Com sinal ativo" abre o Registro com a mesma lista (CA11), e a coluna Sinais mostra a contagem', async () => {
        const user = userEvent.setup();
        montar();
        await waitFor(() => expect(fn.listarSinais).toHaveBeenCalledWith('org-a'));
        const cartao = await screen.findByTitle('Ver os riscos ativos com sinal nos vínculos na aba Registro');
        await waitFor(() => expect(within(cartao).getByText('1')).toBeTruthy());

        await user.click(cartao);
        expect(await screen.findByRole('heading', { level: 1, name: 'Registro de riscos' })).toBeTruthy();
        expect(screen.getByText(/Recorte do painel/).textContent).toContain('1 risco');
        expect(screen.getByText('Recalque na torre B')).toBeTruthy();
        expect(screen.queryByText('Atraso de aprovação na prefeitura')).toBeNull();
        expect(screen.getByTitle('Contrato vencido (Contrato 012 · Grua)')).toBeTruthy();
    });

    it('aba Aprovações lista o risco aceito não enviado; a ficha envia e, pendente, diz quem aprova o nível', async () => {
        const user = userEvent.setup();
        fn.enviarParaAprovacao.mockResolvedValue({ ...R3, approval_status: 'PENDENTE', approval_required_levels: 1 });
        fn.podeAprovar.mockResolvedValue(false);
        fn.aprovadoresDoNivel.mockResolvedValue([{ user_id: 'u9', nome: 'Bia', email: 'bia@x.com' }]);
        montar();
        await waitFor(() => expect(fn.listarRiscos).toHaveBeenCalled());
        await user.click(screen.getByRole('tab', { name: /Aprovações/ }));
        expect(await screen.findByRole('heading', { level: 1, name: 'Aprovações de risco' })).toBeTruthy();
        expect(screen.getByText('Exige aprovação, não enviado')).toBeTruthy();
        expect(screen.queryByText('Recalque na torre B')).toBeNull();

        await user.click(screen.getByText('Aceitar chuva de verão'));
        const ficha = within(await screen.findByRole('dialog'));
        await user.click(ficha.getByRole('button', { name: /Enviar para aprovação/ }));
        await waitFor(() => expect(fn.enviarParaAprovacao).toHaveBeenCalledWith(expect.objectContaining({ id: 'r3' }), 'Exige aprovação: a estratégia é aceitar o risco.'));
        expect(await ficha.findByText(/Este nível é aprovado por Bia/)).toBeTruthy();
        expect(fn.podeAprovar).toHaveBeenCalledWith('org-a', 1);
        expect(ficha.queryByRole('button', { name: /Aprovar nível/ })).toBeNull();
    });

    it('Vínculos: sinal do vínculo; seletor da obra do risco; já vinculado; duplicado vira frase legível', async () => {
        const user = userEvent.setup();
        fn.listarVinculos.mockResolvedValue([LINK]);
        fn.listarContratosVinculaveis.mockResolvedValue([
            { modulo: 'contrato', id: 'c1', rotulo: 'Contrato 012 · Grua', situacao: 'Ativo', data: '2026-10-01' },
            { modulo: 'contrato', id: 'c2', rotulo: 'Contrato 013 · Andaime', situacao: 'Ativo', data: '2027-01-01' },
        ]);
        fn.vincular.mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint "risk_links_unico"' });
        const ficha = await abrirFichaDoRegistro(user, 'Recalque na torre B');

        await user.click(ficha.getByRole('tab', { name: /Vínculos/ }));
        expect(await ficha.findByText('Contrato vencido')).toBeTruthy();

        await user.click(ficha.getByRole('button', { name: /^Vincular$/ }));
        await user.selectOptions(ficha.getByLabelText('Módulo'), 'contrato');
        await waitFor(() => expect(fn.listarContratosVinculaveis).toHaveBeenCalledWith('org-a', 'obra-1'));
        expect(await ficha.findByText('Contrato 013 · Andaime')).toBeTruthy();
        expect(ficha.getByText('Já vinculado')).toBeTruthy();

        await user.click(ficha.getByRole('button', { name: 'Vincular' }));
        await waitFor(() => expect(fn.vincular).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }),
            { modulo: 'contrato', externalId: 'c2', externalRef: undefined, rotulo: 'Contrato 013 · Andaime' }));
        expect(await screen.findByText('Este objeto já está vinculado a este risco.')).toBeTruthy();
    });

    it('Ocorrência que materializa: pergunta antes e o cabeçalho da ficha passa a "Materializado"', async () => {
        const user = userEvent.setup();
        fn.registrarOcorrencia.mockImplementation(async (r: ProjectRisk, input: { titulo: string; materializa: boolean }) => ({
            ocorrencia: { id: 'o1', organization_id: 'org-a', project_risk_id: r.id, project_id: 'obra-1', tipo: 'dano', data_ocorrencia: '2026-11-10',
                titulo: input.titulo, descricao: null, causa_raiz: null, impacto_financeiro: 1500, atraso_dias: null, dimensoes: [], acoes_corretivas: null,
                licoes_aprendidas: null, evidencia_url: null, evidencia_document_id: null, materializa: input.materializa,
                avaliacao_referencia_id: 'av1', status: 'aberta', created_at: '', updated_at: '' },
            risco: { ...r, status: 'materializado', updated_at: 'depois' },
        }));
        const ficha = await abrirFichaDoRegistro(user, 'Recalque na torre B');
        await user.click(ficha.getByRole('tab', { name: /Ocorrências/ }));
        await user.click(await ficha.findByRole('button', { name: /Nova ocorrência/ }));
        await user.type(ficha.getByLabelText('Título'), 'Fissura na laje');
        await user.click(ficha.getByLabelText('Este evento materializou o risco'));
        await user.click(ficha.getByRole('button', { name: 'Registrar e materializar' }));

        // useConfirm antes de gravar
        expect(await screen.findByText('Materializar RSC-0001?')).toBeTruthy();
        expect(fn.registrarOcorrencia).not.toHaveBeenCalled();
        const botoes = screen.getAllByRole('button', { name: 'Registrar e materializar' });
        await user.click(botoes[botoes.length - 1]);

        await waitFor(() => expect(fn.registrarOcorrencia).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }),
            expect.objectContaining({ titulo: 'Fissura na laje', materializa: true, project_id: 'obra-1' })));
        expect(await ficha.findByText('· Materializado')).toBeTruthy();
        expect(ficha.getByText('materializou o risco')).toBeTruthy();
    });

    it('Sugerir riscos: tipologia da obra, condição sobe o item, já usado fica fora; cria em lote e guarda o perfil', async () => {
        const user = userEvent.setup();
        fn.listarCatalogo.mockResolvedValue([
            item({ id: 'cat-101', codigo: 'R01.01', evento: 'Já usado na obra' }),
            item({ id: 'cat-102', codigo: 'R01.02', evento: 'Sem condição' }),
            item({ id: 'cat-506', codigo: 'R05.06', evento: 'Água subterrânea no subsolo', condicoes_sugestao: ['subsolo', 'contencao'] }),
            item({ id: 'cat-900', codigo: 'R09.01', evento: 'Só de galpão', tipologias: ['galpao_industrial'] }),
        ]);
        const criado = risco({ id: 'r9', numero: 9, codigo: 'RSC-0009', titulo: 'Água subterrânea no subsolo', catalog_id: 'cat-506' });
        fn.criarEmLote.mockResolvedValue({ criados: [criado], falhas: [] });
        localStorage.setItem('riscos:aba', JSON.stringify('registro'));
        montar();
        await waitFor(() => expect(fn.listarRiscos).toHaveBeenCalled());

        await user.click(screen.getByRole('button', { name: /Sugerir riscos/ }));
        const sheet = within(await screen.findByRole('dialog'));
        await waitFor(() => expect(fn.listarCatalogo).toHaveBeenCalledWith('org-a'));
        await user.selectOptions(sheet.getByLabelText('Obra'), 'obra-1');
        expect((sheet.getByLabelText('Tipologia') as HTMLSelectElement).value).toBe('residencial');
        await user.click(sheet.getByLabelText('Subsolo'));

        expect(await sheet.findByText('cita: Subsolo')).toBeTruthy();
        expect(sheet.queryByText('Só de galpão')).toBeNull();
        expect(sheet.queryByText('Já usado na obra')).toBeNull();
        const linhas = sheet.getAllByText(/^R0\d\.\d\d$/).map(e => e.textContent);
        expect(linhas[0]).toBe('R05.06');

        await user.click(sheet.getByRole('button', { name: /Marcar os 1 que citam/ }));
        await user.click(sheet.getByRole('button', { name: 'Criar 1 risco' }));
        await waitFor(() => expect(fn.criarEmLote).toHaveBeenCalled());
        const [org, fichas] = fn.criarEmLote.mock.calls[0];
        expect(org).toBe('org-a');
        expect(fichas).toHaveLength(1);
        expect(fichas[0]).toMatchObject({ catalog_id: 'cat-506', escopo: 'obra', project_id: 'obra-1', owner_user_id: 'u1' });
        expect(fn.salvarPerfilObra).toHaveBeenCalledWith({ project_id: 'obra-1', organization_id: 'org-a', tipologia: 'residencial', condicoes: ['subsolo'] });
        expect(await sheet.findByText(/1 risco criado na obra/)).toBeTruthy();
    });
});
