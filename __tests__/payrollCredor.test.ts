/**
 * Credor das linhas de folha em Contas a Pagar.
 *
 * Existe porque a coluna Credor ficou vazia em TODA linha com Origem = "Folha"
 * até 23/08/2026: `payableParty` lê `party_name || entity_name`, e nenhum dos
 * 12 pontos de inserção de `payrollService` gravava qualquer um dos dois.
 * O que se trava aqui é a regra do rótulo agregado — a parte com decisão de
 * produto dentro (quantos nomes cabem antes do "(+N)").
 */
import { describe, it, expect, vi } from 'vitest';

// `payrollService` importa o client do Supabase no topo; o teste só quer as
// funções puras do módulo.
vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { credorDeColaboradores, CREDOR_ENCARGOS } from '../services/payrollService';

describe('credorDeColaboradores', () => {
    it('um colaborador vira o próprio nome', () => {
        expect(credorDeColaboradores(['João da Silva'])).toBe('João da Silva');
    });

    it('até três nomes aparecem inteiros', () => {
        expect(credorDeColaboradores(['João', 'Maria', 'Pedro']))
            .toBe('João, Maria, Pedro');
    });

    it('do quarto em diante o excedente vira (+N)', () => {
        expect(credorDeColaboradores(['João', 'Maria', 'Pedro', 'Ana', 'Luís', 'Rita', 'Caio']))
            .toBe('João, Maria, Pedro (+4)');
    });

    it('nomes repetidos contam uma vez só', () => {
        // A lista chega de `summary[worksiteId].employees`, montada por
        // alocação: o mesmo colaborador em duas alocações da mesma obra não
        // pode virar "(+1)".
        expect(credorDeColaboradores(['João', 'João', 'Maria'])).toBe('João, Maria');
    });

    it('ignora vazio e nulo no meio da lista', () => {
        expect(credorDeColaboradores(['', 'Maria', undefined as unknown as string])).toBe('Maria');
    });

    it('lista vazia cai no rótulo genérico, nunca em string vazia', () => {
        // String vazia devolveria a célula ao travessão — que é o bug.
        expect(credorDeColaboradores([])).toBe('Folha de Pagamento');
        expect(credorDeColaboradores(['', ''])).toBe('Folha de Pagamento');
    });
});

describe('CREDOR_ENCARGOS', () => {
    it('encargos patronais têm credor institucional, não o colaborador', () => {
        expect(CREDOR_ENCARGOS).toBe('INSS/FGTS');
    });
});
