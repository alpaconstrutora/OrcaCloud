import { describe, expect, it } from 'vitest';
import {
    TIPOS, tituloDoGrupo, detalheDoGrupo, brl,
    chefesEfetivos, equipe, arvore, resumoPorPessoa, filtrarSilenciados, colunaDaDeterminacao,
    kpisDoPainel, ultimaCobranca, semanaDe, lerSilenciados, juntarSilenciados,
    type GrupoExcecao, type Determinacao, type LinhaHierarquia,
} from '../utils/diretoria';

// Plano: docs/planos/2026-11-17-opura-ceo.md (Tarefa 5).
const HOJE = '2026-11-17';
const grupo = (p: Partial<GrupoExcecao>): GrupoExcecao => ({
    chave: p.chave ?? Math.random().toString(36), familia: p.familia ?? 'fam', tipo: 'conta_vencida', org_id: 'a', grupo: null,
    severidade: 'atencao', origem_responsavel: 'area', responsaveis: [], quantidade: 1, valor: null,
    dias: 10, data_ref: '2026-11-07', itens: [], ...p,
});
const det = (p: Partial<Determinacao>): Determinacao => ({
    id: p.id ?? Math.random().toString(36), organization_id: 'a', titulo: 'D', responsavel_user_id: 'r',
    prazo: '2026-11-20', status: 'aberta', origem: null, excecao_chave: null, criada_por: null,
    criada_em: '2026-11-10T10:00:00Z', concluida_em: null, atualizacoes: [], ...p,
});
const h = (user_id: string, chefe_user_id: string, atualizado_em = '2026-11-01T00:00:00Z', organization_id = 'a'): LinhaHierarquia =>
    ({ organization_id, user_id, chefe_user_id, atualizado_em });

describe('catálogo dos tipos (o mesmo do e-mail)', () => {
    it('cobre os 9 tipos que o banco devolve, cada um com nome, regra e tela de origem', () => {
        expect(Object.keys(TIPOS).sort()).toEqual([
            'aprovacao_parada', 'conta_vencida', 'contrato_vencendo', 'documento_vencido', 'entrega_atrasada',
            'extrato_sem_conciliar', 'ferias_vencendo', 'parcela_cliente', 'tarefa_vencida',
        ]);
        for (const t of Object.values(TIPOS)) {
            expect(t.nome.length).toBeGreaterThan(3);
            expect(t.regra.length).toBeGreaterThan(10);
            expect(t.tela.length).toBeGreaterThan(3);
        }
        expect(TIPOS.conta_vencida.tela).toBe('contas-a-pagar');
        expect(TIPOS.extrato_sem_conciliar.tela).toBe('bank-reconciliation');
    });

    it('título no singular e no plural; extrato traz a conta', () => {
        expect(tituloDoGrupo(grupo({ quantidade: 1 }))).toBe('1 conta a pagar vencida');
        expect(tituloDoGrupo(grupo({ quantidade: 694 }))).toBe('694 contas a pagar vencidas');
        expect(tituloDoGrupo(grupo({ tipo: 'extrato_sem_conciliar', grupo: 'Sicredi 3012', quantidade: 18 })))
            .toBe('Sicredi 3012: 18 linhas do extrato sem conciliar');
    });

    it('detalhe: valor e há quantos dias; "vence em" quando ainda não venceu', () => {
        expect(detalheDoGrupo(grupo({ valor: 1415562.4, dias: 45, data_ref: '2026-10-03' })))
            .toBe('R$ 1.415.562 · a mais antiga venceu em 03/10/2026 (há 45 dias)');
        expect(detalheDoGrupo(grupo({ tipo: 'contrato_vencendo', valor: null, dias: -12, data_ref: '2026-11-29' })))
            .toBe('o primeiro termina em 29/11/2026 (em 12 dias)');
        expect(detalheDoGrupo(grupo({ tipo: 'ferias_vencendo', dias: 0, data_ref: HOJE }))).toBe('o primeiro vence hoje');
        expect(detalheDoGrupo(grupo({ dias: 1, data_ref: '2026-11-16' }))).toBe('a mais antiga venceu em 16/11/2026 (há 1 dia)');
    });

    it('brl sem centavos', () => {
        expect(brl(38750)).toBe('R$ 38.750');
    });
});

describe('hierarquia', () => {
    it('chefe efetivo: em conflito entre organizações vale o registro mais recente', () => {
        const c = chefesEfetivos([h('r', 'd', '2026-11-01T00:00:00Z', 'a'), h('r', 'm', '2026-11-10T00:00:00Z', 'b')]);
        expect(c.get('r')).toBe('m');
    });

    it('equipe inclui a pessoa e todos os níveis abaixo, sem laço infinito', () => {
        const c = chefesEfetivos([h('b', 'a'), h('c', 'b'), h('d', 'c'), h('x', 'y')]);
        expect(equipe('a', c).sort()).toEqual(['a', 'b', 'c', 'd']);
        expect(equipe('c', c).sort()).toEqual(['c', 'd']);
        // laço vindo de duas organizações (a→b numa, b→a noutra): não trava
        const laco = new Map([['a', 'b'], ['b', 'a']]);
        expect(equipe('a', laco).sort()).toEqual(['a', 'b']);
    });

    it('árvore: quem não responde a ninguém (ou responde a alguém fora da lista) é raiz', () => {
        const c = chefesEfetivos([h('b', 'a'), h('c', 'a'), h('d', 'fora')]);
        const raizes = arvore(['a', 'b', 'c', 'd', 'e'], c);
        expect(raizes.map(n => n.userId).sort()).toEqual(['a', 'd', 'e']);
        expect(raizes.find(n => n.userId === 'a')!.filhos.map(f => f.userId).sort()).toEqual(['b', 'c']);
    });

    it('resumo por pessoa soma a equipe; grupo com 2 responsáveis conta para os dois', () => {
        const c = chefesEfetivos([h('b', 'a')]);
        const ex = [
            grupo({ responsaveis: ['b'], severidade: 'critico' }),
            grupo({ responsaveis: ['a', 'b'], severidade: 'atencao' }),
            grupo({ responsaveis: ['z'], severidade: 'critico' }),
        ];
        const ds = [det({ responsavel_user_id: 'b', prazo: '2026-11-10' }), det({ responsavel_user_id: 'b', status: 'concluida', prazo: '2026-11-01' })];
        expect(resumoPorPessoa('a', ex, ds, c, HOJE)).toEqual({ criticos: 1, total: 2, determinacoes: 1, determinacoesVencidas: 1 });
        expect(resumoPorPessoa('b', ex, ds, c, HOJE, false)).toEqual({ criticos: 1, total: 2, determinacoes: 1, determinacoesVencidas: 1 });
        expect(resumoPorPessoa('a', ex, ds, c, HOJE, false)).toEqual({ criticos: 0, total: 1, determinacoes: 0, determinacoesVencidas: 0 });
    });
});

describe('filtros e determinações', () => {
    it('silenciados somem; a preferência guarda a lista como texto', () => {
        const ex = [grupo({ tipo: 'conta_vencida' }), grupo({ tipo: 'tarefa_vencida' })];
        expect(filtrarSilenciados(ex, ['conta_vencida']).map(g => g.tipo)).toEqual(['tarefa_vencida']);
        expect(lerSilenciados('conta_vencida,tarefa_vencida')).toEqual(['conta_vencida', 'tarefa_vencida']);
        expect(lerSilenciados(null)).toEqual([]);
        expect(lerSilenciados('nao_existe,conta_vencida')).toEqual(['conta_vencida']);
        expect(juntarSilenciados(['tarefa_vencida', 'conta_vencida', 'conta_vencida'])).toBe('conta_vencida,tarefa_vencida');
        expect(juntarSilenciados([])).toBeNull();
    });

    it('coluna da determinação: vencida ganha de aberta/andamento; concluída é concluída', () => {
        expect(colunaDaDeterminacao(det({ prazo: '2026-11-16' }), HOJE)).toBe('vencidas');
        expect(colunaDaDeterminacao(det({ prazo: '2026-11-16', status: 'andamento' }), HOJE)).toBe('vencidas');
        expect(colunaDaDeterminacao(det({ prazo: HOJE }), HOJE)).toBe('abertas');
        expect(colunaDaDeterminacao(det({ status: 'andamento' }), HOJE)).toBe('andamento');
        expect(colunaDaDeterminacao(det({ status: 'concluida', prazo: '2026-11-01' }), HOJE)).toBe('concluidas');
    });

    it('KPIs: pedem decisão, fora do trilho (grupos e itens), determinações vencidas, sem responsável', () => {
        const ex = [
            grupo({ severidade: 'critico', quantidade: 694 }),
            grupo({ severidade: 'atencao', quantidade: 3, origem_responsavel: 'nenhum' }),
        ];
        expect(kpisDoPainel(ex, [det({ prazo: '2026-11-10' }), det({})], HOJE)).toEqual({
            pedemDecisao: 1, foraDoTrilho: 2, itens: 697, determinacoesVencidas: 1, semResponsavel: 1,
        });
    });

    it('última cobrança de uma exceção', () => {
        const cs = [
            { organization_id: 'a', excecao_chave: 'k', tipo: 'conta_vencida', titulo: 't', responsavel_user_id: 'r', cobrado_por: 'd', cobrado_em: '2026-11-16T10:00:00Z' },
            { organization_id: 'a', excecao_chave: 'k', tipo: 'conta_vencida', titulo: 't', responsavel_user_id: 'r', cobrado_por: 'd', cobrado_em: '2026-11-17T09:00:00Z' },
        ];
        expect(ultimaCobranca('k', cs)?.cobrado_em).toBe('2026-11-17T09:00:00Z');
        expect(ultimaCobranca('outra', cs)).toBeNull();
    });

    it('semana: número ISO e segunda a domingo', () => {
        expect(semanaDe(HOJE)).toEqual({ numero: 47, inicio: '2026-11-16', fim: '2026-11-22' });
        expect(semanaDe('2026-11-22')).toEqual({ numero: 47, inicio: '2026-11-16', fim: '2026-11-22' });
    });
});
