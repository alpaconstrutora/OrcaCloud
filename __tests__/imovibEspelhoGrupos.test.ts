/**
 * "Agrupar" do Espelho de vendas do estudo (plano docs/planos/2026-11-20-imovib-espelho-aba-tabela-padrao.md):
 * Torre, Andar (ordem numérica), Status (ordem do fluxo) e No VGV; total do grupo = o que a unidade soma no VGV.
 */
import { describe, it, expect } from 'vitest';
import { agruparLinhas } from '../utils/agruparLinhas';
import { OPCOES_AGRUPAR_ESPELHO, chaveDoEspelho, ordemDoEspelho, SEM_ROTULO_ESPELHO, valorNoVgv } from '../utils/imovibEspelhoGrupos';

const linha = (over: Record<string, unknown> = {}) => ({ torre: 'Torre A', andar: 1, status: 'DISPONÍVEL', marca: undefined, preco: 100, area: 50, precoM2: 2, ...over });
const grupos = (campo: string, linhas: ReturnType<typeof linha>[]) => agruparLinhas(linhas, {
    chave: l => chaveDoEspelho(campo, l), semRotulo: SEM_ROTULO_ESPELHO[campo as keyof typeof SEM_ROTULO_ESPELHO],
    ordem: ordemDoEspelho(campo), valor: valorNoVgv,
}).map(g => `${g.label}:${g.itens.length}:${g.total}`);

describe('imovibEspelhoGrupos', () => {
    it('opções: Torre, Andar, Status, No VGV', () => {
        expect(OPCOES_AGRUPAR_ESPELHO.map(o => o.label)).toEqual(['Torre', 'Andar', 'Status', 'No VGV']);
    });

    it('Torre: pelo nome; total = soma no VGV', () => {
        expect(grupos('torre', [linha(), linha({ torre: 'Torre B', preco: 300 }), linha({ preco: 50 })])).toEqual(['Torre A:2:150', 'Torre B:1:300']);
    });

    it('Andar: ordem numérica, subsolo antes do térreo; rótulo = o número da célula', () => {
        expect(grupos('andar', [linha({ andar: 10 }), linha({ andar: -3 }), linha({ andar: 2 }), linha({ andar: 0 })]).map(s => s.split(':')[0]))
            .toEqual(['-3', '0', '2', '10']);
    });

    it('Status: ordem do fluxo, com o texto da célula', () => {
        expect(grupos('status', [linha({ status: 'VENDIDO' }), linha({ status: 'DISPONÍVEL' }), linha({ status: 'RESERVADO' })]).map(s => s.split(':')[0]))
            .toEqual(['DISPONÍVEL', 'RESERVADO', 'VENDIDO']);
    });

    it('No VGV: Conta → Não vendável → Sem unidade; marcada não soma', () => {
        expect(grupos('vgv', [linha({ marca: 'sem_unidade', preco: 9 }), linha(), linha({ marca: 'nao_vendavel', preco: 9 })]))
            .toEqual(['Conta no VGV:1:100', 'Não vendável no empreendimento:1:0', 'Sem unidade no empreendimento:1:0']);
    });

    it('valor no VGV: preço; sem preço = área × preço/m²; permutada e marcada = nada', () => {
        expect(valorNoVgv(linha())).toBe(100);
        expect(valorNoVgv(linha({ preco: 0 }))).toBe(100); // 50 × 2
        expect(valorNoVgv(linha({ status: 'PERMUTADO' }))).toBeNull();
        expect(valorNoVgv(linha({ marca: 'nao_vendavel' }))).toBeNull();
    });
});
