import { describe, it, expect } from 'vitest';
import {
    sanearPadroes, resolverPadroes, camposAPreencher, dataPrevistaDeEntrega, vazio,
    chavePessoal, CHAVE_EMPRESA, PADROES_DO_SISTEMA, type CampoPadrao,
} from '../lib/pedidoPreferencias';
import { FORMA_ENTREGA_FOB } from '../utils/formaEntrega';

describe('preferências do pedido · leitura do banco', () => {
    it('fica só com campos conhecidos e válidos', () => {
        expect(sanearPadroes({
            paymentMethod: 'Pix', paymentDays: 28, paymentInstallments: 3, paymentTermType: 'Parcelado',
            deliveryMethod: FORMA_ENTREGA_FOB, prazoEntregaDias: 7, notesVisibleToSupplier: false,
            campoVelho: 'x',
        })).toEqual({
            paymentMethod: 'Pix', paymentDays: 28, paymentInstallments: 3, paymentTermType: 'Parcelado',
            deliveryMethod: FORMA_ENTREGA_FOB, prazoEntregaDias: 7, notesVisibleToSupplier: false,
        });
    });

    it('valor errado vira "não definido" (herda), não quebra', () => {
        expect(sanearPadroes({ paymentMethod: 'Cheque', paymentDays: -1, paymentInstallments: 0, deliveryMethod: 'Correio', notes: '   ' })).toEqual({});
        expect(sanearPadroes(null)).toEqual({});
        expect(sanearPadroes('texto')).toEqual({});
        expect(vazio({ notes: '  ' })).toBe(true);
    });
});

describe('preferências do pedido · camadas', () => {
    it('pessoal > empresa > sistema, campo a campo, com a origem', () => {
        const { valores, origem } = resolverPadroes(
            { paymentMethod: 'Pix', costCenterId: 'cc-empresa', prazoEntregaDias: 10 },
            { costCenterId: 'cc-meu' },
        );
        expect(valores.paymentMethod).toBe('Pix');
        expect(origem.paymentMethod).toBe('EMPRESA');
        expect(valores.costCenterId).toBe('cc-meu');
        expect(origem.costCenterId).toBe('PESSOAL');
        expect(valores.deliveryLocation).toBe(PADROES_DO_SISTEMA.deliveryLocation);
        expect(origem.deliveryLocation).toBe('SISTEMA');
        expect(valores.planoDeContasId).toBeUndefined();
    });

    it('chaves: empresa fixa; pessoal por organização', () => {
        expect(CHAVE_EMPRESA).toBe('suprimentos.pedido.padroes');
        expect(chavePessoal('org-1')).toBe('suprimentos.pedido.padroes.org-1');
        expect(chavePessoal('3f2a9c10-77ab-4d1e-9b0c-1234567890ab').length).toBeLessThanOrEqual(100);
    });
});

describe('preferências do pedido · formulário', () => {
    it('não escreve campo que o usuário mexeu', () => {
        const mexidos = new Set<CampoPadrao>(['paymentMethod']);
        expect(camposAPreencher({ paymentMethod: 'Pix', costCenterId: 'cc' }, mexidos)).toEqual({ costCenterId: 'cc' });
    });

    it('previsão de entrega em data local, virando o mês', () => {
        expect(dataPrevistaDeEntrega(7, new Date(2026, 10, 27, 23, 30))).toBe('2026-12-04');
        expect(dataPrevistaDeEntrega(0, new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
    });
});
