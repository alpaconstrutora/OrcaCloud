/**
 * Beneficiário de boleto (16/10/2026): o nome do arquivo aparecia como
 * beneficiário nos boletos da captura por e-mail. Plano:
 * docs/planos/2026-10-16-captura-padroes-do-remetente.md (passo H).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beneficiarioDoBoleto, nomeDoBeneficiario, limparNomeDoBeneficiario } from '../utils/boletoBeneficiario';

const nomes = { f1: 'Energisa', f2: 'LL Contábil' };
const b = (x: Partial<{ supplier_id: string | null; sugestao_supplier_id: string | null; beneficiario_nome: string | null }>) =>
    ({ supplier_id: null, sugestao_supplier_id: null, beneficiario_nome: null, ...x });

describe('beneficiário do boleto', () => {
    it('fornecedor confirmado → nome lido do boleto → sugerido → nada', () => {
        expect(beneficiarioDoBoleto(b({ supplier_id: 'f1', beneficiario_nome: 'ENERGISA SUL' }), nomes)).toEqual({ nome: 'Energisa', origem: 'fornecedor' });
        expect(beneficiarioDoBoleto(b({ beneficiario_nome: 'ACME LTDA - CNPJ: 11.222.333/0001-81' }), nomes)).toEqual({ nome: 'ACME LTDA', origem: 'boleto' });
        expect(beneficiarioDoBoleto(b({ sugestao_supplier_id: 'f2' }), nomes)).toEqual({ nome: 'LL Contábil', origem: 'sugerido' });
        expect(beneficiarioDoBoleto(b({}), nomes)).toEqual({ nome: null, origem: 'nenhum' });
        expect(nomeDoBeneficiario(b({}), nomes)).toBe('—');
    });

    it('fornecedor que não está no mapa cai no nome do boleto, não no arquivo', () => {
        expect(beneficiarioDoBoleto(b({ supplier_id: 'fx', beneficiario_nome: 'XPTO' }), nomes)).toEqual({ nome: 'XPTO', origem: 'boleto' });
        expect(beneficiarioDoBoleto(b({ supplier_id: 'fx' }), nomes).nome).toBeNull();
    });

    it('limpa o CNPJ colado ao nome', () => {
        expect(limparNomeDoBeneficiario('FULANO 12345678000199 RUA X')).toBe('FULANO');
        expect(limparNomeDoBeneficiario('   ')).toBeNull();
    });
});

describe('trava: nenhuma tela volta a usar o nome do arquivo como beneficiário', () => {
    const raiz = join(__dirname, '..');
    for (const arq of ['components/BoletoManager.tsx', 'components/BoletoEdicaoEmLoteModal.tsx', 'services/boletoService.ts']) {
        it(arq, () => {
            const s = readFileSync(join(raiz, arq), 'utf8');
            expect(s).not.toMatch(/beneficiario_nome\s*(\?\?|\|\|)\s*[\w.]*documento_nome/);
        });
    }
});
