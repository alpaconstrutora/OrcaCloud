import { describe, it, expect } from 'vitest';
import { tiposUnicosPorSlug } from '../utils/empreendimentoTipos';

const t = (id: string, slug: string, organization_id: string | null) => ({ id, slug, organization_id });

describe('tiposUnicosPorSlug', () => {
  const replicados = [
    t('a1', 'apartamento', 'org-a'),
    t('a2', 'apartamento', 'org-b'),
    t('a3', 'apartamento', 'org-c'),
    t('l1', 'lote', 'org-a'),
    t('l2', 'lote', 'org-b'),
    t('v', 'VERTICAL', null),
  ];

  it('com "Todas" (sem org) deixa um por slug, na ordem de chegada', () => {
    const r = tiposUnicosPorSlug(replicados);
    expect(r.map(x => x.slug)).toEqual(['apartamento', 'lote', 'VERTICAL']);
    expect(r.map(x => x.id)).toEqual(['a1', 'l1', 'v']);
  });

  it('prefere a linha da org escolhida', () => {
    const r = tiposUnicosPorSlug(replicados, 'org-b');
    expect(r.map(x => x.id)).toEqual(['a2', 'l2', 'v']);
  });

  it('sem linha da org, prefere a de sistema à de outra org', () => {
    const r = tiposUnicosPorSlug([t('x1', 'misto', 'org-a'), t('x0', 'misto', null)], 'org-z');
    expect(r.map(x => x.id)).toEqual(['x0']);
  });

  it('lista sem repetição passa intacta', () => {
    const r = tiposUnicosPorSlug([t('1', 'a', null), t('2', 'b', 'org-a')], 'org-a');
    expect(r.map(x => x.id)).toEqual(['1', '2']);
  });
});
