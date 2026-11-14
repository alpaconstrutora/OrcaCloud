/**
 * Empreendimento de unidade única (09/11/2026): "quando o empreendimento for um lote a unidade é o
 * próprio lote" — e Chácara e Casa Residencial. Plano: docs/planos/2026-11-09-empreendimento-unidade-unica.md.
 */
import { describe, expect, it } from 'vitest';
import { estruturaDoTipo } from '../utils/empreendimentoTipos';
import { camposDoLote, ehUnidadeUnica, foraDoMolde, nomeDaTorreImplicita, temTerrenoProprio } from '../utils/empreendimentoUnidadeUnica';

const t = (slug: string, organization_id: string | null, estrutura?: string) => ({ slug, organization_id, estrutura });

describe('estruturaDoTipo', () => {
  it('lê a estrutura do tipo do empreendimento', () => {
    const tipos = [t('lote', 'org-a', 'LOTE'), t('teste', 'org-a', 'IMOVEL_UNICO'), t('VERTICAL', null, 'TORRES')];
    expect(estruturaDoTipo(tipos, 'lote', 'org-a')).toBe('LOTE');
    expect(estruturaDoTipo(tipos, 'teste', 'org-a')).toBe('IMOVEL_UNICO');
    expect(estruturaDoTipo(tipos, 'VERTICAL', 'org-a')).toBe('TORRES');
  });

  it('slug repetido entre orgs: vale o da org do empreendimento', () => {
    const tipos = [t('lote', 'org-a', 'TORRES'), t('lote', 'org-b', 'LOTE')];
    expect(estruturaDoTipo(tipos, 'lote', 'org-b')).toBe('LOTE');
    expect(estruturaDoTipo(tipos, 'lote', 'org-a')).toBe('TORRES');
  });

  it('sem tipo, tipo fora do catálogo, ou coluna ausente/estranha → TORRES (o de sempre)', () => {
    const tipos = [t('lote', 'org-a'), t('casa', 'org-a', 'QUALQUER')];
    expect(estruturaDoTipo(tipos, null, 'org-a')).toBe('TORRES');
    expect(estruturaDoTipo(tipos, 'nao-existe', 'org-a')).toBe('TORRES');
    expect(estruturaDoTipo(tipos, 'lote', 'org-a')).toBe('TORRES');
    expect(estruturaDoTipo(tipos, 'casa', 'org-a')).toBe('TORRES');
  });
});

describe('unidade única', () => {
  it('LOTE, IMOVEL_UNICO e UNIDADE_AUTONOMA são unidade única; TORRES não', () => {
    expect(ehUnidadeUnica('LOTE')).toBe(true);
    expect(ehUnidadeUnica('IMOVEL_UNICO')).toBe(true);
    expect(ehUnidadeUnica('UNIDADE_AUTONOMA')).toBe(true);
    expect(ehUnidadeUnica('TORRES')).toBe(false);
  });

  it('só a UNIDADE_AUTONOMA (apartamento) não tem terreno próprio', () => {
    expect(temTerrenoProprio('LOTE')).toBe(true);
    expect(temTerrenoProprio('IMOVEL_UNICO')).toBe(true);
    expect(temTerrenoProprio('UNIDADE_AUTONOMA')).toBe(false);
  });

  it('a estrutura UNIDADE_AUTONOMA gravada no banco é reconhecida (não cai em TORRES)', () => {
    const tipos = [{ slug: 'apartamento_residencial', organization_id: 'org-a', estrutura: 'UNIDADE_AUTONOMA' }];
    expect(estruturaDoTipo(tipos, 'apartamento_residencial', 'org-a')).toBe('UNIDADE_AUTONOMA');
    expect(nomeDaTorreImplicita('UNIDADE_AUTONOMA', undefined)).toBe('Unidade');
  });

  it('fora do molde = mais de uma torre ou de uma unidade', () => {
    expect(foraDoMolde(0, 0)).toBe(false);
    expect(foraDoMolde(1, 1)).toBe(false);
    expect(foraDoMolde(2, 1)).toBe(true);
    expect(foraDoMolde(1, 3)).toBe(true);
  });

  it('a torre implícita leva o nome do tipo', () => {
    expect(nomeDaTorreImplicita('LOTE', 'Lote')).toBe('Lote');
    expect(nomeDaTorreImplicita('IMOVEL_UNICO', 'Casa Residencial')).toBe('Casa Residencial');
    expect(nomeDaTorreImplicita('LOTE', '  ')).toBe('Lote');
    expect(nomeDaTorreImplicita('IMOVEL_UNICO', undefined)).toBe('Imóvel');
  });

  it('no LOTE a unidade é o terreno: área privativa = total = área do terreno; testada = frente', () => {
    expect(camposDoLote({ terreno_area: 134, terreno_frente: 8.5 }))
      .toEqual({ private_area: 134, total_area: 134, common_area: null, testada_m: 8.5 });
  });

  it('terreno vazio limpa a unidade (não fica número que a ficha já não tem)', () => {
    expect(camposDoLote({ terreno_area: null, terreno_frente: undefined }))
      .toEqual({ private_area: null, total_area: null, common_area: null, testada_m: null });
  });
});
