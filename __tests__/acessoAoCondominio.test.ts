// Por qual caminho a pessoa vê o condomínio.
//
// 01/09/2026: a aba Condomínio entrou no Portal do Cliente, e a definição de
// "acesso" do módulo Comercial › Condomínios — uma linha viva em
// `condomino_portal_access` — virou mentira. Na base havia ZERO links de
// condômino ativos e 3 pessoas entrando pelo Portal do Cliente; a tela dizia
// "Sem acesso" para as três.
import { describe, it, expect } from 'vitest';
import {
    estadoDeAcesso, resumirAcessos, type EstadoDeAcesso,
} from '../utils/acessoAoCondominio';

const emDias = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

const cliente = (over: Partial<{ ativo: boolean; expiraEm: string; abaLigada: boolean }> = {}) =>
    ({ ativo: true, expiraEm: emDias(45), abaLigada: true, ...over });

const condomino = (over: Partial<{ is_active: boolean; expires_at: string }> = {}) =>
    ({ is_active: true, expires_at: emDias(30), ...over });

describe('precedência entre os dois caminhos', () => {
    it('Portal do Cliente vence o link de condômino', () => {
        // O link de condômino é o legado; desde 01/09 não é mais o que se
        // emite. Quem tem os dois usa o do cliente.
        const e = estadoDeAcesso(cliente(), condomino());
        expect(e.via).toBe('PORTAL_CLIENTE');
        expect(e.ve).toBe(true);
    });

    it('sem link de cliente, o de condômino decide', () => {
        expect(estadoDeAcesso(null, condomino()).via).toBe('LINK_CONDOMINO');
        expect(estadoDeAcesso(undefined, condomino()).ve).toBe(true);
    });

    it('link de cliente INATIVO não atropela o de condômino', () => {
        // O `if` de cima olha `cliente.ativo`, não a mera existência do objeto.
        const e = estadoDeAcesso(cliente({ ativo: false }), condomino());
        expect(e.via).toBe('LINK_CONDOMINO');
    });
});

describe('AGUARDA_ABA — o estado que não existia', () => {
    it('link ativo com a aba desligada não é "sem acesso" nem "com acesso"', () => {
        // É o estado real de Defensoria, Dynamis e Filtrelec em 01/09: entram
        // no portal todo dia e o condomínio não aparece. Chamar isso de "sem
        // acesso" é a mentira que este arquivo corrige; chamar de "com acesso"
        // é pior ainda.
        const e = estadoDeAcesso(cliente({ abaLigada: false }), null);
        expect(e.via).toBe('AGUARDA_ABA');
        expect(e.ve).toBe(false);       // não vê o condomínio
        expect(e.temPorta).toBe(true);  // mas o link funciona
    });

    it('aba desligada vence até um link de condômino ativo', () => {
        // Discutível? Não: o link de cliente ativo é por onde a pessoa entra.
        // Dizer "link de condômino" esconderia que basta ligar a aba.
        expect(estadoDeAcesso(cliente({ abaLigada: false }), condomino()).via).toBe('AGUARDA_ABA');
    });
});

describe('estados do link de condômino (comportamento preservado)', () => {
    it('revogado e expirado não se confundem', () => {
        // Revogado é decisão de alguém; expirado é o prazo vencendo sozinho.
        expect(estadoDeAcesso(null, condomino({ is_active: false })).via).toBe('REVOGADO');
        expect(estadoDeAcesso(null, condomino({ expires_at: emDias(-1) })).via).toBe('EXPIRADO');
    });

    it('nada de nada é SEM_ACESSO', () => {
        const e = estadoDeAcesso(null, null);
        expect(e.via).toBe('SEM_ACESSO');
        expect(e.ve).toBe(false);
        expect(e.temPorta).toBe(false);
    });

    it('conta os dias e faz o plural', () => {
        expect(estadoDeAcesso(null, condomino({ expires_at: emDias(1) })).texto).toContain('1 dia');
        expect(estadoDeAcesso(null, condomino({ expires_at: emDias(9) })).texto).toContain('9 dias');
        expect(estadoDeAcesso(cliente({ expiraEm: emDias(45) }), null).texto).toContain('45 dias');
    });
});

describe('resumirAcessos — o KPI para de ser resíduo aritmético', () => {
    it('separa quem vê, quem só precisa da aba, e quem não tem porta', () => {
        // Antes, `sem` era `total - ativos`: revogado, expirado e "já entra
        // pelo Portal do Cliente" caíam todos no mesmo balde.
        const estados: EstadoDeAcesso[] = [
            estadoDeAcesso(cliente(), null),                        // vê
            estadoDeAcesso(null, condomino()),                      // vê
            estadoDeAcesso(cliente({ abaLigada: false }), null),    // aguarda aba
            estadoDeAcesso(null, condomino({ is_active: false })),  // sem
            estadoDeAcesso(null, null),                             // sem
        ];
        expect(resumirAcessos(estados)).toEqual({ total: 5, ve: 2, aguardaAba: 1, sem: 2 });
    });

    it('os três baldes sempre somam o total', () => {
        // Se algum estado novo escapar da classificação, esta conta quebra —
        // é a trava contra o balde silencioso.
        const estados = [
            estadoDeAcesso(cliente(), condomino()),
            estadoDeAcesso(cliente({ abaLigada: false }), condomino()),
            estadoDeAcesso(null, condomino({ expires_at: emDias(-5) })),
            estadoDeAcesso(null, null),
        ];
        const r = resumirAcessos(estados);
        expect(r.ve + r.aguardaAba + r.sem).toBe(r.total);
    });

    it('lista vazia não vira NaN', () => {
        expect(resumirAcessos([])).toEqual({ total: 0, ve: 0, aguardaAba: 0, sem: 0 });
    });
});
