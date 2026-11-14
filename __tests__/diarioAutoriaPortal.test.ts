import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * "Registrado por" do Diário é INTERNO (2026-11-13): o Portal do Cliente não
 * exibe a autoria. Duas camadas:
 *  - o banco: client_portal_get_data devolve settings.diaryEntries sem
 *    registradoPor/editadoPor (aplicar_20271113300000; prova em
 *    scripts/teste-diario-registrado-por.sql, seção 6);
 *  - a tela: o portal (ClientArea) não lê esses campos nem o helper de autoria.
 */
const ler = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf-8');
const AUTORIA = /registradoPor|editadoPor|diaryAutoria|linhasAutoria|textoAutoria/;

describe('Portal do Cliente não mostra a autoria do Diário', () => {
    it('ClientArea e o serviço do portal não tocam nos campos de autoria', () => {
        for (const arq of ['components/ClientArea.tsx', 'services/clientPortalService.ts']) {
            expect(AUTORIA.test(ler(arq)), arq).toBe(false);
        }
    });

    it('a migration tira registradoPor/editadoPor do retorno de client_portal_get_data', () => {
        const sql = ler('supabase/migrations/aplicar_20271113300000_diario_registrado_por.sql');
        const corpo = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.client_portal_get_data'));
        expect(corpo).toMatch(/e - 'registradoPor' - 'editadoPor'/);
        expect(corpo).not.toMatch(/'settings',\s*v_proj\.settings\)/);
    });
});
