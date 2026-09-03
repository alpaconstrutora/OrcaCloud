// O que a categoria do cliente decide no Portal do Cliente.
//
// 01/09/2026: foram criadas "Locação e Condominio" e "Síndico". O portal
// decidia por comparação literal (`=== 'Locação'`) em 11 pontos, e uma
// categoria nova falha em todos de uma vez — sem quebrar a tela, só mostrando
// a coisa errada. Estes testes travam o comportamento no lugar das 11 strings.
import { describe, it, expect } from 'vitest';
import {
    ehLocacao, ehCondominio, ehSindico, ehServicos, ehVendas,
    presetDeAbas, rotuloDaCategoria,
} from '../utils/clientCategory';

describe('categorias novas de 01/09', () => {
    it('"Locação e Condominio" é locação E condomínio ao mesmo tempo', () => {
        // É o ponto todo: 5 clientes reais têm esta categoria e os 5 são
        // condôminos. Perder o lado "locação" tira deles o Financeiro de
        // Locação, que é onde a cota condominial aparece.
        expect(ehLocacao('Locação e Condominio')).toBe(true);
        expect(ehCondominio('Locação e Condominio')).toBe(true);
    });

    it('"Síndico" é condomínio', () => {
        expect(ehCondominio('Síndico')).toBe(true);
        expect(ehSindico('Síndico')).toBe(true);
        expect(ehLocacao('Síndico')).toBe(false);
    });
});

describe('normalização — acento e caixa não podem decidir nada', () => {
    it('acha com e sem acento', () => {
        // A categoria gravada hoje é "Locação e Condominio", SEM o acento em
        // "Condomínio". No dia em que alguém corrigir isso no catálogo, nada
        // pode mudar de comportamento.
        expect(ehCondominio('Locação e Condominio')).toBe(true);
        expect(ehCondominio('Locação e Condomínio')).toBe(true);
        expect(ehSindico('Sindico')).toBe(true);
        expect(ehSindico('Síndico')).toBe(true);
        expect(ehLocacao('LOCAÇÃO')).toBe(true);
        expect(ehServicos('Serviços')).toBe(true);
        expect(ehServicos('Servicos')).toBe(true);
    });

    it('ignora caixa e espaço nas pontas', () => {
        expect(ehLocacao('  locação  ')).toBe(true);
        expect(ehVendas('vendas')).toBe(true);
    });

    it('vazio e nulo não são categoria nenhuma', () => {
        for (const v of [null, undefined, '', '   ']) {
            expect(ehLocacao(v)).toBe(false);
            expect(ehCondominio(v)).toBe(false);
            expect(presetDeAbas(v)).toBeUndefined();
            expect(rotuloDaCategoria(v)).toBeNull();
        }
    });

    it('não confunde categorias alheias', () => {
        for (const v of ['Fiador (a)', 'Representante']) {
            expect(ehLocacao(v)).toBe(false);
            expect(ehCondominio(v)).toBe(false);
            expect(presetDeAbas(v)).toBeUndefined();
        }
    });
});

describe('presetDeAbas', () => {
    it('"Locação e Condominio" ganha a aba Condomínio SEM perder as de locação', () => {
        const p = presetDeAbas('Locação e Condominio')!;
        expect(p).toContain('condominio');
        // as de locação continuam todas lá
        for (const aba of ['dashboard', 'obra', 'financeiro', 'contratos', 'documentos', 'manutencao']) {
            expect(p).toContain(aba);
        }
    });

    it('locação pura NÃO ganha a aba de condomínio', () => {
        expect(presetDeAbas('Locação')).not.toContain('condominio');
    });

    it('condomínio e síndico não veem abas de obra em construção', () => {
        for (const cat of ['Condomínio', 'Síndico']) {
            const p = presetDeAbas(cat)!;
            expect(p).toContain('condominio');
            // o prédio está entregue: nada de jornada, visual, personalização
            for (const aba of ['jornada', 'visual', 'personalizacao', 'diario', 'obra']) {
                expect(p).not.toContain(aba);
            }
        }
    });

    it('a ordem dos testes importa: o combinado vence o puro', () => {
        // "Locação e Condominio" satisfaz ehLocacao E ehCondominio. Se o
        // primeiro `if` vencesse, ela cairia no preset de locação pura e a aba
        // Condomínio sumiria — exatamente o bug que este arquivo evita.
        expect(presetDeAbas('Locação e Condominio')).not.toEqual(presetDeAbas('Locação'));
        expect(presetDeAbas('Locação e Condominio')).not.toEqual(presetDeAbas('Condomínio'));
    });

    it('categorias antigas seguem com o preset de antes', () => {
        expect(presetDeAbas('Vendas')).toEqual([
            'dashboard', 'unidade', 'jornada', 'obra', 'visual', 'personalizacao',
            'diario', 'documentos', 'contratos', 'financeiro', 'suporte']);
        expect(presetDeAbas('Locação')).toEqual([
            'dashboard', 'unidade', 'obra', 'financeiro', 'contratos', 'documentos', 'manutencao']);
        expect(presetDeAbas('Serviços')).toEqual([
            'dashboard', 'obra', 'cronograma-ff', 'financeiro', 'contratos', 'documentos']);
    });

    it('quem negocia imóvel vê "Dados da Unidade"; quem contrata serviço, não', () => {
        // Venda e locação têm imóvel por definição — a aba é a ficha dele.
        // Serviços não tem unidade negociada, e Condomínio/Síndico já veem a
        // sua unidade pela aba Condomínio (unit_occupancies), que é outra coisa.
        expect(presetDeAbas('Vendas')).toContain('unidade');
        expect(presetDeAbas('Locação')).toContain('unidade');
        expect(presetDeAbas('Locação e Condominio')).toContain('unidade');
        expect(presetDeAbas('Serviços')).not.toContain('unidade');
        expect(presetDeAbas('Condomínio')).not.toContain('unidade');
        expect(presetDeAbas('Síndico')).not.toContain('unidade');
    });
});

describe('rotuloDaCategoria', () => {
    it('mostra a categoria como ela é, sem inventar rótulo', () => {
        expect(rotuloDaCategoria('Locação e Condominio')).toBe('Locação e Condominio');
        expect(rotuloDaCategoria('Síndico')).toBe('Síndico');
    });

    it('categoria alheia ao portal cai na saudação genérica', () => {
        expect(rotuloDaCategoria('Representante')).toBeNull();
    });
});
