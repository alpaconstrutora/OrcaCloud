// @vitest-environment jsdom
/**
 * Portal do Síndico › Assembleias (Task B2) — components/sindico/PainelAssembleiasDoSindico.tsx
 * e `operacoesDoSindico` (services/sindicoPortalService.ts).
 * Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md (fase B).
 *
 * O que fica travado:
 *   • sem sessão (portal aberto só pelo link) a aba diz "Entre com e-mail e senha para
 *     conduzir a assembleia" e NÃO chama o banco — as RPCs da B1 recusam o link sozinho;
 *   • a administradora (portal pelo app) é mandada para a tela do gestor, sem chamar o banco;
 *   • logado, a lista, a gaveta e a TELA da assembleia (a mesma do gestor) usam
 *     operacoesDoSindico — as RPCs sindico_portal_assembleia_* com a identidade do síndico;
 *   • documento sobe pela Edge Function sindico-portal-documentos (FormData), com o motivo
 *     do corpo quando ela recusa;
 *   • erro da porta do síndico chega traduzido (HINT da B1).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({
    rpc: vi.fn(),
    invoke: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
    supabase: { rpc: sb.rpc, functions: { invoke: sb.invoke }, from: vi.fn(() => { throw new Error('o síndico não lê tabela'); }) },
}));

import { ConfirmProvider } from '../components/ui/confirm';
import PainelAssembleiasDoSindico, { MOTIVO_SEM_SESSAO } from '../components/sindico/PainelAssembleiasDoSindico';
import { operacoesDoSindico, type CondominioDoSindico } from '../services/sindicoPortalService';
import { ErroAssembleia } from '../services/condominioAssembleiaService';
import { SINDICO_PORTAL_TAB_IDS, SINDICO_PORTAL_TAB_LABELS } from '../utils/sindicoPortalTabs';

const CONDOMINIO: CondominioDoSindico = {
    id: 'c1', codigo: '010', nome: '010 - Galeria Altavista', cnpj: '12345678000190', razaoSocial: 'Condomínio Galeria Altavista',
    cidade: 'Uberaba', mandatoInicio: null, mandatoFim: null,
};

/** Linha crua (to_jsonb) de condominio_assembleias, como a RPC da B1 devolve. */
const linha = (over: Record<string, unknown> = {}) => ({
    id: 'a1', organization_id: 'org-condo', empreendimento_id: 'c1', tipo: 'AGO', titulo: 'AGO 2026', local: 'Salão',
    link_transmissao: null, primeira_convocacao_em: '2026-12-10T22:00:00+00:00', segunda_convocacao_em: '2026-12-10T22:30:00+00:00',
    status: 'RASCUNHO', convocada_em: null, aviso_id: null, edital_entregue_em: null, instalada_em: null,
    instalada_convocacao: null, quorum_instalacao: null, presidente_nome: null, secretario_nome: null, observacao_geral: null,
    encerrada_em: null, retrato: null, ata_documento_id: null, cancelada_em: null, motivo_cancelamento: null,
    created_by: null, created_at: '2026-11-26T12:00:00+00:00', updated_at: '2026-11-26T12:00:00+00:00',
    ...over,
});
const ITEM = { id: 'i1', assembleia_id: 'a1', ordem: 1, titulo: 'Aprovar contas', descricao: null, tipo: 'APROVACAO',
    opcoes: null, quorum: 'MAIORIA_PRESENTES', assunto: 'APROVAR_CONTAS', deliberacao: null };

/** Responde as RPCs pelo nome. */
function banco(respostas: Record<string, unknown>) {
    sb.rpc.mockImplementation(async (fn: string) => (fn in respostas
        ? { data: respostas[fn], error: null }
        : { data: null, error: { message: `RPC inesperada: ${fn}` } }));
}

const rpcs = () => sb.rpc.mock.calls.map(c => c[0] as string);

function montar(props: Partial<React.ComponentProps<typeof PainelAssembleiasDoSindico>> = {}) {
    const notify = vi.fn();
    render(
        <ConfirmProvider>
            <PainelAssembleiasDoSindico identidade={{ token: 'tok' }} condominios={[CONDOMINIO]} logado notify={notify} {...props} />
        </ConfirmProvider>,
    );
    return { notify };
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
});

describe('aba Assembleias do Portal do Síndico', () => {
    it('vem logo depois de Avisos (convocar publica o aviso; a ata cai em Documentos)', () => {
        const i = SINDICO_PORTAL_TAB_IDS.indexOf('assembleias');
        expect(SINDICO_PORTAL_TAB_IDS[i - 1]).toBe('avisos');
        expect(SINDICO_PORTAL_TAB_IDS[i + 1]).toBe('documentos');
        expect(SINDICO_PORTAL_TAB_LABELS.assembleias).toBe('Assembleias');
    });
});

describe('sem sessão', () => {
    it('sem sessão mostra "Entre com e-mail e senha para conduzir a assembleia" e não chama o banco', async () => {
        montar({ logado: false });
        expect(await screen.findByText(MOTIVO_SEM_SESSAO)).toBeInTheDocument();
        expect(MOTIVO_SEM_SESSAO).toBe('Entre com e-mail e senha para conduzir a assembleia');
        expect(screen.queryByRole('button', { name: /Nova assembleia/ })).not.toBeInTheDocument();
        expect(sb.rpc).not.toHaveBeenCalled();
        expect(sb.invoke).not.toHaveBeenCalled();
    });

    it('administradora pelo app: conduz pela tela do gestor, sem chamar a porta do síndico', async () => {
        montar({ identidade: { clientId: 's1' }, logado: false, comoAdministradora: true });
        expect(await screen.findByText('Como administradora, conduza a assembleia pelo app')).toBeInTheDocument();
        expect(screen.queryByText(MOTIVO_SEM_SESSAO)).not.toBeInTheDocument();
        expect(sb.rpc).not.toHaveBeenCalled();
    });
});

describe('usa operacoesDoSindico', () => {
    it('lista pela porta do síndico, com o token e o condomínio', async () => {
        banco({ sindico_portal_assembleia_listar: [linha(), linha({ id: 'a2', titulo: 'AGE fachada', status: 'CONVOCADA' })] });
        montar();
        expect(await screen.findByText('AGO 2026')).toBeInTheDocument();
        expect(screen.getByText('AGE fachada')).toBeInTheDocument();
        expect(sb.rpc).toHaveBeenCalledWith('sindico_portal_assembleia_listar',
            { p_token: 'tok', p_client_id: null, p_empreendimento: 'c1' });
        // Editar/Excluir só no rascunho.
        expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(1);
    });

    it('abrir a assembleia monta a MESMA tela do gestor, lendo pela porta do síndico', async () => {
        banco({
            sindico_portal_assembleia_listar: [linha()],
            sindico_portal_assembleia_carregar: { assembleia: linha(), itens: [ITEM], unidades: [], votos: [] },
            sindico_portal_assembleia_cotas_conferidas: true,
            sindico_portal_assembleia_unidades_fora: ['Torre A — Estacionamento'],
        });
        montar();
        fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }));

        // A tela da A7: migalha "Assembleias › condomínio › assembleia" e a ação do estado.
        expect(await screen.findByRole('heading', { name: 'AGO 2026' })).toBeInTheDocument();
        expect(sb.rpc).toHaveBeenCalledWith('sindico_portal_assembleia_carregar',
            { p_token: 'tok', p_client_id: null, p_assembleia: 'a1' });
        fireEvent.click(screen.getByRole('button', { name: 'Convocar' }));
        const gaveta = await screen.findByRole('dialog', { name: 'Convocar assembleia' });
        expect(await within(gaveta).findByText('Torre A — Estacionamento')).toBeInTheDocument();
        expect(sb.rpc).toHaveBeenCalledWith('sindico_portal_assembleia_unidades_fora',
            { p_token: 'tok', p_client_id: null, p_assembleia: 'a1' });
        // Nada pela porta do gestor.
        expect(rpcs().every(fn => fn.startsWith('sindico_portal_assembleia_'))).toBe(true);
    });

    it('nova assembleia: a gaveta grava rascunho e pauta pela porta do síndico', async () => {
        banco({
            sindico_portal_assembleia_listar: [],
            sindico_portal_assembleia_salvar_rascunho: linha({ id: 'a9', titulo: 'AGO 2027', primeira_convocacao_em: null, segunda_convocacao_em: null }),
            sindico_portal_assembleia_salvar_itens: [{ ...ITEM, id: 'i9', assembleia_id: 'a9' }],
        });
        const { notify } = montar();
        fireEvent.click(await screen.findByRole('button', { name: /Nova assembleia/ }));
        fireEvent.change(await screen.findByLabelText('Título'), { target: { value: 'AGO 2027' } });
        fireEvent.change(screen.getByLabelText('Título do item'), { target: { value: 'Aprovar contas' } });
        fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));

        await waitFor(() => expect(notify).toHaveBeenCalledWith('Rascunho salvo. Para publicar, abra a assembleia e convoque.'));
        expect(sb.rpc).toHaveBeenCalledWith('sindico_portal_assembleia_salvar_rascunho', expect.objectContaining({
            p_token: 'tok', p_client_id: null, p_assembleia: null, p_empreendimento: 'c1', p_tipo: 'AGO', p_titulo: 'AGO 2027',
            p_local: null, p_link_transmissao: null, p_primeira_convocacao_em: null, p_segunda_convocacao_em: null,
        }));
        expect(sb.rpc).toHaveBeenCalledWith('sindico_portal_assembleia_salvar_itens', {
            p_token: 'tok', p_client_id: null, p_assembleia: 'a9',
            p_itens: [{ titulo: 'Aprovar contas', descricao: null, tipo: 'APROVACAO', opcoes: null, quorum: 'MAIORIA_PRESENTES', assunto: 'OUTRO' }],
        });
        expect(await screen.findByText('AGO 2027')).toBeInTheDocument();
    });

    it('erro do banco aparece traduzido e com "Tentar de novo"', async () => {
        sb.rpc.mockResolvedValue({ data: null, error: { code: '42501', hint: 'sindico_sem_sessao', message: 'x' } });
        montar();
        expect(await screen.findByText(/Para conduzir a assembleia, entre no Portal do Síndico com seu e-mail e senha\./))
            .toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    });
});

describe('operacoesDoSindico (porta)', () => {
    const ops = operacoesDoSindico({ token: 'tok' }, 'c1');

    it('a condução chama o núcleo pela porta do síndico, com a identidade', async () => {
        sb.rpc.mockResolvedValue({ data: { unidades: 8, fora: [], avisoId: 'av1' }, error: null });
        await ops.convocar('a1', 'Texto');
        expect(sb.rpc).toHaveBeenLastCalledWith('sindico_portal_assembleia_convocar',
            { p_token: 'tok', p_client_id: null, p_assembleia: 'a1', p_corpo_aviso: 'Texto' });

        sb.rpc.mockResolvedValue({ data: { votoId: 'v1', itemId: 'i1', unitId: 'u1', opcao: 'SIM', origem: 'PRESENCIAL', anterior: null }, error: null });
        await ops.lancarVoto('i1', 'u1', 'SIM');
        expect(sb.rpc).toHaveBeenLastCalledWith('sindico_portal_assembleia_lancar_voto',
            { p_token: 'tok', p_client_id: null, p_item: 'i1', p_unit: 'u1', p_opcao: 'SIM' });

        sb.rpc.mockResolvedValue({ data: 2, error: null });
        expect(await ops.leiturasDoAviso('a1')).toBe(2);
        expect(sb.rpc).toHaveBeenLastCalledWith('sindico_portal_assembleia_leituras', { p_token: 'tok', p_client_id: null, p_assembleia: 'a1' });
    });

    it('pela prévia (clientId), o clientId vai e o token não', async () => {
        sb.rpc.mockResolvedValue({ data: true, error: null });
        await operacoesDoSindico({ clientId: 's1' }, 'c1').cotasConferidas('a1');
        expect(sb.rpc).toHaveBeenLastCalledWith('sindico_portal_assembleia_cotas_conferidas',
            { p_token: null, p_client_id: 's1', p_assembleia: 'a1' });
    });

    it('pauta conferida ANTES de ir ao banco (mesma frase do gestor)', async () => {
        await expect(ops.salvarItens('a1', [{ titulo: '', tipo: 'APROVACAO', quorum: 'MAIORIA_PRESENTES' }]))
            .rejects.toThrow('Item 1: informe o título.');
        expect(sb.rpc).not.toHaveBeenCalled();
    });

    it('erro da porta vira ErroAssembleia com a frase do HINT', async () => {
        sb.rpc.mockResolvedValue({ data: null, error: { code: '42501', hint: 'sindico_fora_do_mandato', message: 'x' } });
        const e = await ops.carregar('a1').catch(err => err);
        expect(e).toBeInstanceOf(ErroAssembleia);
        expect(e.message).toBe('Este condomínio não está no seu mandato de síndico.');
    });

    it('enviarDocumento sobe pela Edge Function (FormData) no condomínio do síndico', async () => {
        sb.invoke.mockResolvedValue({ data: { documentoId: 'doc1' }, error: null });
        const arquivo = new File(['%PDF-1.4'], 'procuracao.pdf', { type: 'application/pdf' });
        const r = await ops.enviarDocumento('a1', arquivo, { categoria: 'OUTRO', titulo: 'Procuração — 102', visivelPortal: false });
        expect(r).toEqual({ documentoId: 'doc1' });
        const [fn, { body }] = sb.invoke.mock.calls[0] as [string, { body: FormData }];
        expect(fn).toBe('sindico-portal-documentos');
        expect(body).toBeInstanceOf(FormData);
        expect(body.get('token')).toBe('tok');
        expect(body.get('clientId')).toBeNull();
        expect(body.get('empreendimentoId')).toBe('c1');
        expect(body.get('categoria')).toBe('OUTRO');
        expect(body.get('titulo')).toBe('Procuração — 102');
        expect(body.get('visivelPortal')).toBe('false');
        expect((body.get('file') as File).name).toBe('procuracao.pdf');
    });

    it('a Edge Function recusa: o motivo do corpo chega à tela', async () => {
        sb.invoke.mockResolvedValue({
            data: null,
            error: { context: { json: async () => ({ error: 'Este condomínio não está no seu mandato de síndico.' }) } },
        });
        await expect(ops.enviarDocumento('a1', new File(['x'], 'ata.pdf', { type: 'application/pdf' }),
            { categoria: 'ATA', titulo: 'Ata', visivelPortal: true })).rejects.toThrow('Este condomínio não está no seu mandato de síndico.');
    });

    it('abrirDocumento vai pelo download do portal do síndico', async () => {
        sb.invoke.mockResolvedValue({ data: { url: 'https://assinada/ata.pdf' }, error: null });
        expect(await ops.abrirDocumento('a1', 'doc-ata')).toBe('https://assinada/ata.pdf');
        expect(sb.invoke).toHaveBeenCalledWith('client-portal-condominio-download',
            { body: { portal: 'sindico', token: 'tok', documentoId: 'doc-ata' } });
    });
});
