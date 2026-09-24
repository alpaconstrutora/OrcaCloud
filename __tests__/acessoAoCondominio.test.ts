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
    estadoDeAcesso, resumirAcessos, type EstadoDeAcesso,
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
