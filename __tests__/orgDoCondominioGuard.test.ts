/**
 * Catraca + regra da org do condomínio (21/10/2026,
 * docs/planos/2026-10-21-sindico-operador-org-condominio.md).
 *
 * Um condomínio pode ter organização própria (`condominio_org_id`), operada pelo
 * síndico; o cadastro do prédio fica na org do empreendimento. Tela de
 * `components/condominio/` que grava com `empreendimento.organization_id`
 * manda o lançamento de volta para a construtora — e o síndico não o vê.
 * Toda leitura/gravação da operação passa por `utils/orgDoCondominio`.
 *
 * Exceções (lista fechada, cada uma com o porquê):
 *  - dependências de efeito (`[e.id, e.organization_id, e.condominio_org_id]`):
 *    não gravam nada;
 *  - CondominiosModule: o painel de IMPORTAR mostra a org dona do empreendimento,
 *    que é o que se quer ver ali.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { orgDoCondominio } from '../utils/orgDoCondominio';

const PASTA = path.join(process.cwd(), 'components', 'condominio');
const PADRAO = /\b(empreendimento|condominio|e)\.organization_id\b/;

const PERMITIDO: Array<{ arquivo: string; trecho: RegExp }> = [
    { arquivo: 'CondominioDetail.tsx', trecho: /^\s*\}, \[e\.id, e\.organization_id, e\.condominio_org_id\]\);/ },
    { arquivo: 'CondominioDetail.tsx', trecho: /^\s*\}, \[e\.organization_id, e\.condominio_org_id\]\);/ },
    { arquivo: 'CondominioDetail.tsx', trecho: /ehDaDona = minhasOrgs\.some\(o => o\.id === e\.organization_id\)/ },
    { arquivo: 'CondominiosModule.tsx', trecho: /isAllOrgs && organizations\.find\(\(o: any\) => o\.id === e\.organization_id\)/ },
    { arquivo: 'CondominiosModule.tsx', trecho: /\? ` · \$\{organizations\.find\(\(o: any\) => o\.id === e\.organization_id\)\?\.name\}`/ },
];

describe('orgDoCondominio', () => {
    it('org própria do condomínio vence; sem ela, a do empreendimento', () => {
        expect(orgDoCondominio({ organization_id: 'alpa', condominio_org_id: 'condo' })).toBe('condo');
        expect(orgDoCondominio({ organization_id: 'alpa', condominio_org_id: null })).toBe('alpa');
        expect(orgDoCondominio({ organization_id: 'alpa' })).toBe('alpa');
    });
});

describe('catraca: telas do condomínio não usam a org do empreendimento', () => {
    it('nenhum uso fora da lista fechada de exceções', () => {
        const achados: string[] = [];
        for (const arquivo of readdirSync(PASTA).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))) {
            const linhas = readFileSync(path.join(PASTA, arquivo), 'utf8').split('\n');
            linhas.forEach((linha, i) => {
                if (/^\s*(\/\/|\*|\{\/\*)/.test(linha)) return;      // comentário
                if (!PADRAO.test(linha)) return;
                if (PERMITIDO.some(p => p.arquivo === arquivo && p.trecho.test(linha))) return;
                achados.push(`${arquivo}:${i + 1}: ${linha.trim()}`);
            });
        }
        expect(achados).toEqual([]);
    });
});
