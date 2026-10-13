// Por qual caminho a pessoa vê o condomínio.
//
// 01/09/2026: a aba Condomínio entrou no Portal do Cliente, e a definição de
// "acesso" do módulo Comercial › Condomínios — uma linha viva em
// `condomino_portal_access` — virou mentira. Na base havia ZERO links de
// condômino ativos e 3 pessoas entrando pelo Portal do Cliente; a tela dizia
// "Sem acesso" para as três.
//
// 23/09/2026: o portal legado foi APOSENTADO (2 linhas na tabela, 0 ativas, 0
// leituras de aviso apontando para elas). Os testes de precedência e dos
// estados `LINK_CONDOMINO`/`EXPIRADO`/`REVOGADO` saíram junto — não há mais
// segundo caminho a precedir. O que permanece, e é o coração do arquivo, é
// `AGUARDA_ABA`.
import { describe, it, expect } from 'vitest';
import {
    estadoDeAcesso, resumirAcessos, agruparPapeisPorPessoa, type EstadoDeAcesso,
} from '../utils/acessoAoCondominio';

const emDias = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

const cliente = (over: Partial<{ ativo: boolean; expiraEm: string; abaLigada: boolean }> = {}) =>
    ({ ativo: true, expiraEm: emDias(45), abaLigada: true, ...over });

describe('Portal do Cliente — o único caminho', () => {
    it('link ativo com a aba ligada vê o condomínio', () => {
        const e = estadoDeAcesso(cliente());
        expect(e.via).toBe('PORTAL_CLIENTE');
        expect(e.ve).toBe(true);
        expect(e.temPorta).toBe(true);
    });

    it('link INATIVO é sem acesso — o teste olha `ativo`, não a existência do objeto', () => {
        const e = estadoDeAcesso(cliente({ ativo: false }));
        expect(e.via).toBe('SEM_ACESSO');
        expect(e.ve).toBe(false);
    });

    it('nada de nada é SEM_ACESSO', () => {
        for (const entrada of [null, undefined]) {
            const e = estadoDeAcesso(entrada);
            expect(e.via).toBe('SEM_ACESSO');
            expect(e.ve).toBe(false);
            expect(e.temPorta).toBe(false);
        }
    });

    it('conta os dias e faz o plural', () => {
        expect(estadoDeAcesso(cliente({ expiraEm: emDias(1) })).texto).toContain('1 dia');
        expect(estadoDeAcesso(cliente({ expiraEm: emDias(9) })).texto).toContain('9 dias');
        expect(estadoDeAcesso(cliente({ expiraEm: emDias(45) })).texto).toContain('45 dias');
    });

    it('sem prazo, o rótulo não inventa "0 dias"', () => {
        expect(estadoDeAcesso(cliente({ expiraEm: null as any })).texto).toBe('Portal do Cliente');
    });
});

describe('AGUARDA_ABA — o estado que não existia', () => {
    it('link ativo com a aba desligada não é "sem acesso" nem "com acesso"', () => {
        // É o estado real de Defensoria, Dynamis e Filtrelec em 01/09: entram
        // no portal todo dia e o condomínio não aparece. Chamar isso de "sem
        // acesso" é a mentira que este arquivo corrige; chamar de "com acesso"
        // é pior ainda. Continua valendo depois da aposentadoria do legado: é o
        // estado de Reginaldo, que tem `portal_tabs` explícito sem `condominio`.
        const e = estadoDeAcesso(cliente({ abaLigada: false }));
        expect(e.via).toBe('AGUARDA_ABA');
        expect(e.ve).toBe(false);       // não vê o condomínio
        expect(e.temPorta).toBe(true);  // mas o link funciona
    });
});

describe('resumirAcessos — o KPI para de ser resíduo aritmético', () => {
    it('separa quem vê, quem só precisa da aba, e quem não tem porta', () => {
        // Antes, `sem` era `total - ativos`: "já entra pelo Portal do Cliente"
        // caía no mesmo balde de quem não tem nada.
        const estados: EstadoDeAcesso[] = [
            estadoDeAcesso(cliente()),                       // vê
            estadoDeAcesso(cliente()),                       // vê
            estadoDeAcesso(cliente({ abaLigada: false })),   // aguarda aba
            estadoDeAcesso(cliente({ ativo: false })),       // sem
            estadoDeAcesso(null),                            // sem
        ];
        expect(resumirAcessos(estados)).toEqual({ total: 5, ve: 2, aguardaAba: 1, sem: 2 });
    });

    it('os três baldes sempre somam o total', () => {
        // Se algum estado novo escapar da classificação, esta conta quebra —
        // é a trava contra o balde silencioso.
        const estados = [
            estadoDeAcesso(cliente()),
            estadoDeAcesso(cliente({ abaLigada: false })),
            estadoDeAcesso(cliente({ ativo: false })),
            estadoDeAcesso(null),
        ];
        const r = resumirAcessos(estados);
        expect(r.ve + r.aguardaAba + r.sem).toBe(r.total);
    });

    it('lista vazia não vira NaN', () => {
        expect(resumirAcessos([])).toEqual({ total: 0, ve: 0, aguardaAba: 0, sem: 0 });
    });
});

describe('agruparPapeisPorPessoa — uma linha por pessoa × unidade', () => {
    // 13/10/2026: proprietário que também é responsável financeiro aparecia
    // duas vezes, idêntico, em Portais › Portal do Condômino.
    const oc = (unit_id: string, client_id: string, role: string, id = `${unit_id}-${client_id}-${role}`) =>
        ({ id, unit_id, client_id, role });

    it('mesma pessoa com dois papéis na mesma unidade vira UMA linha com os dois', () => {
        const r = agruparPapeisPorPessoa([
            oc('u11', 'marcos', 'RESPONSAVEL_FINANCEIRO'),
            oc('u11', 'marcos', 'PROPRIETARIO'),
        ]);
        expect(r).toHaveLength(1);
        expect(r[0].key).toBe('u11:marcos');
        expect(r[0].papeis).toEqual(['PROPRIETARIO', 'RESPONSAVEL_FINANCEIRO']);
    });

    it('mesma pessoa em duas unidades continua em duas linhas', () => {
        const r = agruparPapeisPorPessoa([
            oc('u11', 'marcos', 'PROPRIETARIO'),
            oc('u12', 'marcos', 'PROPRIETARIO'),
        ]);
        expect(r.map(g => g.key)).toEqual(['u11:marcos', 'u12:marcos']);
    });

    it('duas pessoas na mesma unidade continuam em duas linhas', () => {
        const r = agruparPapeisPorPessoa([
            oc('u32', 'sonia', 'RESPONSAVEL_FINANCEIRO'),
            oc('u32', 'outro', 'PROPRIETARIO'),
        ]);
        expect(r).toHaveLength(2);
    });

    it('papel repetido aparece uma vez só', () => {
        const r = agruparPapeisPorPessoa([
            oc('u21', 'francisco', 'PROPRIETARIO', 'a'),
            oc('u21', 'francisco', 'PROPRIETARIO', 'b'),
        ]);
        expect(r[0].papeis).toEqual(['PROPRIETARIO']);
    });

    it('ordem fixa dos papéis; desconhecido vai para o fim', () => {
        const r = agruparPapeisPorPessoa([
            oc('u1', 'p', 'XPTO'),
            oc('u1', 'p', 'RESPONSAVEL_FINANCEIRO'),
            oc('u1', 'p', 'MORADOR'),
            oc('u1', 'p', 'INQUILINO'),
            oc('u1', 'p', 'PROPRIETARIO'),
        ]);
        expect(r[0].papeis).toEqual(['PROPRIETARIO', 'INQUILINO', 'MORADOR', 'RESPONSAVEL_FINANCEIRO', 'XPTO']);
    });

    it('a linha carrega a primeira ocupação do grupo e preserva a ordem de entrada', () => {
        const primeira = oc('u22', 'joao', 'RESPONSAVEL_FINANCEIRO');
        const r = agruparPapeisPorPessoa([primeira, oc('u31', 'ricardo', 'PROPRIETARIO'), oc('u22', 'joao', 'PROPRIETARIO')]);
        expect(r.map(g => g.key)).toEqual(['u22:joao', 'u31:ricardo']);
        expect(r[0].ocupacao).toBe(primeira);
    });

    it('lista vazia devolve vazio', () => {
        expect(agruparPapeisPorPessoa([])).toEqual([]);
    });

    it('`ocupacoes` traz TODOS os registros do grupo, em ordem de papel — encerrar/excluir agem sobre eles', () => {
        const rf = oc('u11', 'marcos', 'RESPONSAVEL_FINANCEIRO');
        const pr = oc('u11', 'marcos', 'PROPRIETARIO');
        const r = agruparPapeisPorPessoa([rf, pr]);
        expect(r[0].ocupacoes).toEqual([pr, rf]);
    });

    it('ocupação ENCERRADA não se junta: é histórico, cada uma na sua linha', () => {
        // Com "Incluir encerradas" na aba Ocupações: o proprietário antigo que
        // saiu não pode virar papel da linha vigente da mesma pessoa.
        const vigente = oc('u11', 'marcos', 'RESPONSAVEL_FINANCEIRO');
        const enc1 = { ...oc('u11', 'marcos', 'PROPRIETARIO'), ended_at: '2025-01-01' };
        const enc2 = { ...oc('u11', 'marcos', 'MORADOR'), ended_at: '2025-01-01' };
        const r = agruparPapeisPorPessoa([vigente, enc1, enc2]);
        expect(r.map(g => g.key)).toEqual(['u11:marcos', `enc:${enc1.id}`, `enc:${enc2.id}`]);
        expect(r[0].papeis).toEqual(['RESPONSAVEL_FINANCEIRO']);
    });
});
