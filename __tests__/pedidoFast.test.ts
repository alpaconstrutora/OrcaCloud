import { describe, it, expect } from 'vitest';
import {
    normalizarLeitura,
    leituraVazia,
    itensDaLeitura,
    conferirTotal,
    normalizarUnidade,
    digitosDoDocumento,
    documentoComMascara,
    tipoDoFornecedor,
    nomeParaCasar,
    dataDaCompra,
    categoriaDoAnexo,
    codigosComConfiancaBaixa,
    observacoesDoFast,
    montarPedidoFast,
    type LeituraFast,
} from '../lib/pedidoFast';
import { FORMA_ENTREGA_FOB, ehFob } from '../utils/formaEntrega';
import { totalEfetivoDoPedido } from '../utils/pedidoItemValor';

// Pedido Fast — docs/planos/2026-11-14-pedido-fast.md (Parte 1, item 4).

const notaCompleta = (): LeituraFast => normalizarLeitura({
    legivel: true,
    tipo_documento: 'CUPOM_FISCAL',
    fornecedor: { nome: 'Casa do Construtor Ltda', cnpj_cpf: '11.222.333/0001-81' },
    data: '2026-11-13',
    numero_documento: '004512',
    itens: [
        { descricao: 'Cimento CP II 50kg', unidade: 'sc', quantidade: 10, valor_unitario: 38.9, valor_total: 389, confidence: 0.95 },
        { descricao: 'Areia média', unidade: 'm³', quantidade: 2, valor_unitario: 0, valor_total: 260, confidence: 0.9 },
        { descricao: 'Prego 17x27', unidade: 'Kg.', quantidade: 0, valor_unitario: 21.5, valor_total: 0, confidence: 0.4 },
    ],
    desconto: 0,
    acrescimo: 0,
    total: 670.5,
    observacoes: '',
});

const entrada = (leitura: LeituraFast, extra: Partial<Parameters<typeof montarPedidoFast>[0]> = {}) => ({
    numero: 'PC-EMP-OB-0001',
    projectId: 'obra-1',
    supplierId: 'forn-1',
    leitura,
    compradorUserId: 'user-1',
    compradorNome: 'Iago',
    retiradoPorEmployeeId: 'emp-1',
    fornecedorIdentificado: true,
    hoje: '2026-11-14',
    agora: '2026-11-14T13:00:00.000Z',
    ...extra,
});

describe('Pedido Fast · leitura completa', () => {
    it('itens com código FAST-n, unidade normalizada, valor derivado quando falta', () => {
        const itens = itensDaLeitura(notaCompleta());
        expect(itens.map(i => i.code)).toEqual(['FAST-1', 'FAST-2', 'FAST-3']);
        expect(itens.map(i => i.unit)).toEqual(['SC', 'M3', 'KG']);
        // unitário ausente → total / quantidade
        expect(itens[1]).toMatchObject({ quantity: 2, unitPrice: 130, total: 260 });
        // quantidade 0 → 1; total ausente → quantidade × unitário
        expect(itens[2]).toMatchObject({ quantity: 1, unitPrice: 21.5, total: 21.5 });
        expect(itens.every(i => i.avulso === true)).toBe(true);
    });

    it('a soma confere com o total da nota', () => {
        const l = notaCompleta();
        const c = conferirTotal(l, itensDaLeitura(l));
        expect(c).toMatchObject({ somaDosItens: 670.5, totalDaNota: 670.5, diferenca: 0, confere: true });
    });

    it('monta a linha: Entregue, FOB, data da nota, autoria, observações internas', () => {
        const linha = montarPedidoFast(entrada(notaCompleta()));
        expect(linha).toMatchObject({
            number: 'PC-EMP-OB-0001',
            project_id: 'obra-1',
            supplier_id: 'forn-1',
            status: 'Entregue',
            delivery_date: '2026-11-13',
            actual_delivery_date: '2026-11-13',
            delivery_method: FORMA_ENTREGA_FOB,
            retirado_por_employee_id: 'emp-1',
            notes_visible_to_supplier: false,
            origem: 'FAST',
            criado_por: 'user-1',
        });
        expect(ehFob(linha.delivery_method)).toBe(true);
        expect(linha.notes).toContain('comprado por Iago');
        expect(linha.notes).toContain('Documento nº 004512');
        expect(linha.leitura_ia.conferencia.confere).toBe(true);
        expect(linha.leitura_ia.comprador).toEqual({ id: 'user-1', nome: 'Iago' });
        expect(linha.leitura_ia.falhaDaLeitura).toBeNull();
    });

    it('o valor efetivo do pedido é o da nota (sem par cotado)', () => {
        const linha = montarPedidoFast(entrada(notaCompleta()));
        expect(totalEfetivoDoPedido(linha.items)).toBe(670.5);
    });

    it('item com confiança baixa é marcado pelo código', () => {
        expect(codigosComConfiancaBaixa(notaCompleta())).toEqual(['FAST-3']);
    });
});

describe('Pedido Fast · fornecedor', () => {
    it('documento só vale se for CPF/CNPJ válido; máscara e tipo', () => {
        expect(digitosDoDocumento('11.222.333/0001-81')).toBe('11222333000181');
        expect(digitosDoDocumento('11.222.333/0001-82')).toBe('');
        expect(digitosDoDocumento('')).toBe('');
        expect(documentoComMascara('11222333000181')).toBe('11.222.333/0001-81');
        expect(documentoComMascara('52998224725')).toBe('529.982.247-25');
        expect(tipoDoFornecedor('11222333000181')).toBe('PJ');
        expect(tipoDoFornecedor('52998224725')).toBe('PF');
        expect(tipoDoFornecedor('')).toBe('PJ');
    });

    it('sem CNPJ: casa pelo nome normalizado; não identificado vai para as observações', () => {
        expect(nomeParaCasar('  CASA  do Construtor  ')).toBe(nomeParaCasar('Casa do construtor'));
        expect(nomeParaCasar('Depósito São José')).toBe('deposito sao jose');
        const l = normalizarLeitura({ ...notaCompleta(), fornecedor: { nome: 'Depósito do Zé', cnpj_cpf: '' } });
        const linha = montarPedidoFast(entrada(l, { supplierId: null, fornecedorIdentificado: false }));
        expect(linha.supplier_id).toBeNull();
        expect(linha.notes).toContain('Fornecedor a conferir: Depósito do Zé.');
    });
});

describe('Pedido Fast · leitura vazia ou que falhou', () => {
    it('a compra não se perde: pedido sem itens com o motivo', () => {
        const linha = montarPedidoFast(entrada(leituraVazia(), {
            supplierId: null, fornecedorIdentificado: false, falhaDaLeitura: 'foto ilegível',
        }));
        expect(linha.items).toEqual([]);
        expect(linha.status).toBe('Entregue');
        expect(linha.delivery_date).toBe('2026-11-14');
        expect(linha.notes).toContain('Itens a lançar — leitura da foto falhou: foto ilegível');
        expect(linha.notes).toContain('Fornecedor a conferir: não identificado na foto.');
    });

    it('normalizar é defensivo: lixo, negativos, item sem descrição, legível sem itens', () => {
        expect(normalizarLeitura(null).legivel).toBe(false);
        expect(normalizarLeitura('x').itens).toEqual([]);
        const l = normalizarLeitura({
            legivel: true,
            tipo_documento: 'INVENTADO',
            itens: [
                { descricao: '  ', quantidade: 1, valor_total: 5 },
                { descricao: 'Tijolo', quantidade: -3, valor_unitario: '1,50', valor_total: -9, confidence: 7 },
            ],
            desconto: -10,
            total: 'abc',
        });
        expect(l.tipo_documento).toBe('OUTRO');
        expect(l.itens).toHaveLength(1);
        expect(l.itens[0]).toMatchObject({ descricao: 'Tijolo', quantidade: 0, valor_unitario: 1.5, valor_total: 0, confidence: 1 });
        expect(l.desconto).toBe(0);
        expect(l.total).toBe(0);
        expect(normalizarLeitura({ legivel: true, itens: [] }).legivel).toBe(false);
    });
});

describe('Pedido Fast · soma ≠ total da nota', () => {
    it('diferença acima da tolerância aparece na conferência e nas observações', () => {
        const l = normalizarLeitura({ ...notaCompleta(), total: 700 });
        const c = conferirTotal(l, itensDaLeitura(l));
        expect(c).toMatchObject({ totalCalculado: 670.5, totalDaNota: 700, diferenca: 29.5, confere: false });
        const linha = montarPedidoFast(entrada(l));
        expect(linha.notes).toContain('Total da nota R$ 700,00 difere do calculado pelos itens R$ 670,50.');
    });

    it('desconto e frete entram no cálculo e nas observações', () => {
        const l = normalizarLeitura({ ...notaCompleta(), desconto: 20.5, acrescimo: 50, total: 700 });
        const c = conferirTotal(l, itensDaLeitura(l));
        expect(c.confere).toBe(true);
        const notes = observacoesDoFast({ compradorNome: 'Iago', leitura: l, conferencia: c, fornecedorIdentificado: true });
        expect(notes).toContain('Desconto na nota: R$ 20,50.');
        expect(notes).toContain('Frete/acréscimo na nota: R$ 50,00.');
        expect(notes).not.toContain('difere');
    });

    it('arredondamento de centavos não dispara alerta; nota sem total também não', () => {
        const l = normalizarLeitura({ ...notaCompleta(), total: 670.54 });
        expect(conferirTotal(l, itensDaLeitura(l)).confere).toBe(true);
        const semTotal = normalizarLeitura({ ...notaCompleta(), total: 0 });
        expect(conferirTotal(semTotal, itensDaLeitura(semTotal))).toMatchObject({ diferenca: 0, confere: true });
    });
});

describe('Pedido Fast · unidade e data fora do padrão', () => {
    it('unidade desconhecida fica maiúscula e curta; vazia vira UN', () => {
        expect(normalizarUnidade('')).toBe('UN');
        expect(normalizarUnidade(null)).toBe('UN');
        expect(normalizarUnidade('und.')).toBe('UN');
        expect(normalizarUnidade('Pç')).toBe('PC');
        expect(normalizarUnidade('m²')).toBe('M2');
        expect(normalizarUnidade('galão')).toBe('GL');
        expect(normalizarUnidade('fardo de 12')).toBe('FARDODE12');
        expect(normalizarUnidade('embalagemgigante')).toBe('EMBALAGEMG');
    });

    it('data ilegível, impossível, futura ou antiga demais vira hoje', () => {
        expect(dataDaCompra('2026-11-13', '2026-11-14')).toBe('2026-11-13');
        expect(dataDaCompra('2026-11-15', '2026-11-14')).toBe('2026-11-15'); // amanhã: fuso
        expect(dataDaCompra('2026-11-20', '2026-11-14')).toBe('2026-11-14');
        expect(dataDaCompra('2024-01-10', '2026-11-14')).toBe('2026-11-14');
        expect(dataDaCompra('2026-02-30', '2026-11-14')).toBe('2026-11-14');
        expect(dataDaCompra('13/11/2026', '2026-11-14')).toBe('2026-11-14');
        expect(dataDaCompra('', '2026-11-14')).toBe('2026-11-14');
    });

    it('categoria do anexo pelo tipo de documento', () => {
        expect(categoriaDoAnexo('NOTA_FISCAL')).toBe('NOTA_FISCAL');
        expect(categoriaDoAnexo('CUPOM_FISCAL')).toBe('NOTA_FISCAL');
        expect(categoriaDoAnexo('RECIBO')).toBe('RECIBO');
        expect(categoriaDoAnexo('OUTRO')).toBe('OUTRO');
    });
});
