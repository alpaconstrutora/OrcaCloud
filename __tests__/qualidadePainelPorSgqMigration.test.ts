import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Qualidade SiAC — pendência da fase 2 (26/11): o painel conta igual para quem olha.
// A RPC quality_inspecoes_aprovadas_do_sgq (aplicar_20271126140000) entrega só CONTAGEM — o membro
// da Alpa conta as OEs da SPE sem ver nomes nem ids delas. Esta trava lê o texto da migration (o CI
// não tem banco); a prova no banco é o script de BEGIN … ROLLBACK da frente.

const SQL = readFileSync(
  path.join(process.cwd(), 'supabase', 'migrations', 'aplicar_20271126140000_qualidade_painel_por_sgq.sql'),
  'utf8',
);
const semComentarios = SQL.replace(/--.*$/gm, '');

describe('migration 140000 — quality_inspecoes_aprovadas_do_sgq', () => {
  it('devolve só as 5 colunas de contagem — nenhum nome, id de OE ou de colaborador', () => {
    const m = /RETURNS TABLE\s*\(([\s\S]*?)\)\s*LANGUAGE/i.exec(semComentarios);
    expect(m).not.toBeNull();
    const colunas = (m as RegExpExecArray)[1].split(',').map((c) => c.trim().replace(/\s+/g, ' '));
    expect(colunas).toEqual([
      'controlled_item_id uuid',
      'aprovado_em timestamptz',
      'obra_em_andamento boolean',
      'executores_total integer',
      'executores_treinados integer',
    ]);
  });

  it('SECURITY DEFINER com search_path fixo, autoriza dentro (membro do SGQ ou superadmin; senão 42501)', () => {
    expect(semComentarios).toMatch(/SECURITY DEFINER\s+SET search_path = public, pg_temp/);
    expect(semComentarios).toMatch(/public\.is_superadmin\(\)/);
    expect(semComentarios).toMatch(/p_sgq IN \(SELECT public\.minhas_orgs_membro\(\)\)/);
    expect(semComentarios).toMatch(/ERRCODE = '42501'/);
  });

  it('REVOKE de PUBLIC e anon + GRANT para authenticated, literais', () => {
    expect(semComentarios).toContain(
      'REVOKE EXECUTE ON FUNCTION public.quality_inspecoes_aprovadas_do_sgq(uuid) FROM PUBLIC, anon;',
    );
    expect(semComentarios).toContain(
      'GRANT  EXECUTE ON FUNCTION public.quality_inspecoes_aprovadas_do_sgq(uuid) TO authenticated;',
    );
  });

  it('só inspeção aprovada de OE cujo serviço é do SGQ pedido', () => {
    expect(semComentarios).toMatch(/v\.type = 'inspection'/);
    expect(semComentarios).toMatch(/v\.status = 'approved'/);
    expect(semComentarios).toMatch(/i\.organization_id = p_sgq/);
  });

  it('só OE de organização cujo SGQ ATUAL é p_sgq (SPE que deixou de apontar para ele não conta)', () => {
    // sem linha em quality_settings (ou apontando para si) = a própria organização é o SGQ
    expect(semComentarios.replace(/\s+/g, ' ')).toMatch(
      /AND COALESCE\(\(SELECT s\.sgq_organization_id FROM public\.quality_settings s WHERE s\.organization_id = wo\.org_id\), wo\.org_id\) = p_sgq/,
    );
    expect(SQL).not.toMatch(/de qualquer organiza/);
  });
});
