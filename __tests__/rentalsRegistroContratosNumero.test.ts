/**
 * Comercial › Locação › Gestão de Unidades › Registro de contratos (27/11/2026):
 * "A tabela tem duas colunas Id e Código. Substitua as duas por uma chamada Número
 * do Contrato e traga o número do contrato de cada."
 *
 * O número vem de contracts.number (por deal_id): o campo da negociação
 * (commercial_deals.contract_number) está vazio em 9 das 10 locações.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const fonte = fs.readFileSync(path.resolve(__dirname, '../components/RentalsModule.tsx'), 'utf8');
const bloco = (inicio: string, fim: string) => fonte.slice(fonte.indexOf(inicio), fonte.indexOf(fim, fonte.indexOf(inicio)));

describe('Registro de contratos — coluna Número do Contrato', () => {
    const colunas = bloco('const DEAL_COLUMNS: ColumnConfig[] = [', '];');

    it('ID e Código saíram; Número do Contrato é a primeira coluna', () => {
        expect(colunas).not.toMatch(/key: 'id'/);
        expect(colunas).not.toMatch(/key: 'code'/);
        const chaves = [...colunas.matchAll(/key: '([^']+)'/g)].map(m => m[1]);
        expect(chaves[0]).toBe('_contractNumber');
        expect(colunas).toContain("label: 'Número do Contrato'");
    });

    it('o número vem do contrato de cada negociação (contracts.number por deal_id)', () => {
        expect(fonte).toMatch(/\.from\('contracts'\)\s*\.select\('deal_id, number'\)/);
        expect(fonte).toContain("_contractNumber: numeroDoContrato[d.id] ?? ''");
    });

    it('a busca procura pelo número; o card da visão em grade também o mostra', () => {
        expect(fonte).toContain('d._contractNumber.toLowerCase().includes(term)');
        expect(fonte).not.toContain('#{deal.id.substring(0, 8).toUpperCase()}');
        expect(fonte).toContain('placeholder="Buscar por número do contrato, imóvel ou cliente..."');
    });
});
