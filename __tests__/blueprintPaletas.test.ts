/**
 * Filtros e templates de vista (19/09/2026, E8.2): paletas por ambiente /
 * tipo / unidade / uso / pavimento com legenda do recorte; configuração de
 * vista (sanitização do JSONB, diff, igualdade, templates de fábrica,
 * validação do nome). Nada aqui toca no modelo nem no hash.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, snapshotHash, type Command } from '../utils/blueprintKernel';
import { corDoAmbiente } from '../utils/blueprintCoresAmbiente';
import { coresDaVista, PALETA_DO_TIPO_DE_AMBIENTE, PALETA_DO_USO } from '../utils/blueprintPaletas';
import { CONFIGURACAO_PADRAO, configuracaoDaColuna, diferencas, mesmaConfiguracao, TEMPLATES_DE_FABRICA, validarTemplate } from '../utils/blueprintTemplatesDeVista';

function casa() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2800, defaultHeightMm: 2800 }).model;
  const [t, sup] = m.levels.map((l) => l.id);
  const w = (lv: string, ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: lv, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  // Térreo: dois ambientes lado a lado; Superior: um.
  m = applyBatch(m, [w(t, 0, 0, 8000, 0), w(t, 8000, 0, 8000, 3000), w(t, 8000, 3000, 0, 3000), w(t, 0, 3000, 0, 0), w(t, 4000, 0, 4000, 3000), w(sup, 0, 0, 4000, 0), w(sup, 4000, 0, 4000, 3000), w(sup, 4000, 3000, 0, 3000), w(sup, 0, 3000, 0, 0)]).model;
  const [a, b] = m.spaces.filter((s) => s.levelId === t).sort((p, q) => p.ring[0].x - q.ring[0].x);
  const c = m.spaces.find((s) => s.levelId === sup)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: a.id, name: 'Banheiro', tipoDeAmbiente: 'BANHEIRO' },
    { type: 'NameSpace', spaceId: b.id, name: 'Sala de estar', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'NameSpace', spaceId: c.id, name: 'Dormitório 1', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'AddUnidade', numero: '101' },
  ]).model;
  const und = m.unidades[0].id;
  m = applyBatch(m, [
    { type: 'SetUnidadeDoAmbiente', spaceId: m.spaces.find((s) => s.name === 'Banheiro')!.id, unidadeId: und, nome: 'Banheiro' },
    { type: 'SetUnidadeDoAmbiente', spaceId: m.spaces.find((s) => s.name === 'Sala de estar')!.id, unidadeId: und, nome: 'Sala de estar' },
  ]).model;
  return { m, t, sup };
}

describe('paletas e templates de vista (E8.2)', () => {
  it('colorir por: NENHUM vazio; AMBIENTE reusa a cor por nome; TIPO pela classe NBR 5410; UNIDADE pela unidade (área comum à parte); USO pelo programa; PAVIMENTO por índice — legenda conta só o recorte', () => {
    const { m, t, sup } = casa();
    const nome = (n: string) => m.spaces.find((s) => s.name === n)!;
    expect(coresDaVista(m, 'NENHUM').porAmbiente.size).toBe(0);
    const amb = coresDaVista(m, 'AMBIENTE', t);
    expect(amb.porAmbiente.get(nome('Banheiro').id)).toBe(corDoAmbiente(nome('Banheiro')));
    expect(amb.legenda).toEqual([]); // uma linha por ambiente não é legenda
    const tipo = coresDaVista(m, 'TIPO_DE_AMBIENTE', t);
    expect(tipo.porAmbiente.get(nome('Banheiro').id)).toBe(PALETA_DO_TIPO_DE_AMBIENTE.BANHEIRO);
    expect(tipo.porAmbiente.get(nome('Dormitório 1').id)).toBe(PALETA_DO_TIPO_DE_AMBIENTE.SALA_DORMITORIO); // colorido mesmo fora do recorte
    expect(tipo.legenda.map((l) => [l.rotulo, l.quantidade])).toEqual([['Banheiro', 1], ['Sala / dormitório', 1]]); // só o térreo conta
    expect(coresDaVista(m, 'TIPO_DE_AMBIENTE').legenda.map((l) => [l.rotulo, l.quantidade])).toEqual([['Banheiro', 1], ['Sala / dormitório', 2]]);
    const und = coresDaVista(m, 'UNIDADE');
    expect(und.porAmbiente.get(nome('Banheiro').id)).toBe(und.porAmbiente.get(nome('Sala de estar').id));
    expect(und.porAmbiente.get(nome('Dormitório 1').id)).not.toBe(und.porAmbiente.get(nome('Banheiro').id));
    expect(und.legenda.map((l) => l.rotulo).sort()).toEqual(['Un. 101', 'Área comum / sem unidade'].sort());
    const uso = coresDaVista(m, 'USO');
    expect(uso.porAmbiente.get(nome('Sala de estar').id)).toBe(PALETA_DO_USO.SALA);
    expect(uso.legenda.map((l) => l.rotulo).sort()).toEqual(['Banheiro', 'Dormitório', 'Sala'].sort());
    const pav = coresDaVista(m, 'PAVIMENTO');
    expect(pav.porAmbiente.get(nome('Banheiro').id)).toBe(pav.porAmbiente.get(nome('Sala de estar').id));
    expect(pav.legenda.map((l) => [l.rotulo, l.quantidade])).toEqual([['Superior', 1], ['Térreo', 2]]);
    expect(coresDaVista(m, 'PAVIMENTO', sup).legenda.map((l) => l.rotulo)).toEqual(['Superior']);
    // A paleta não toca no desenho.
    expect(snapshotHash(m)).toBe(snapshotHash(casa().m));
  });

  it('configuração de vista: JSONB estranho volta ao padrão chave a chave; diff lista o que muda; templates de fábrica são válidos e distintos; nome repetido é recusado', () => {
    const lida = configuracaoDaColuna({ planta: { medidas: true, lixo: 1, grade: 'sim' }, modoDeCor: 'ROXO', vista3d: { arestas: false }, estilo3d: 'TRANSPARENTE' });
    expect(lida.planta.medidas).toBe(true);
    expect(lida.planta.grade).toBe(CONFIGURACAO_PADRAO.planta.grade); // 'sim' não é booleano
    expect((lida.planta as unknown as Record<string, unknown>).lixo).toBeUndefined();
    expect(lida.modoDeCor).toBe('NENHUM');
    expect(lida.vista3d.arestas).toBe(false);
    expect(lida.estilo3d).toBe('TRANSPARENTE');
    expect(lida.estiloPlanta).toBe('TECNICA'); // ausente (template anterior à E8.4) → técnica
    expect(configuracaoDaColuna({ estiloPlanta: 'HUMANIZADA' }).estiloPlanta).toBe('HUMANIZADA');
    expect(configuracaoDaColuna({ estiloPlanta: 'AQUARELA' }).estiloPlanta).toBe('TECNICA');
    expect(diferencas(CONFIGURACAO_PADRAO, configuracaoDaColuna({ estiloPlanta: 'HUMANIZADA' }))).toEqual(['Planta: Humanizada']);
    expect(configuracaoDaColuna(null)).toEqual(CONFIGURACAO_PADRAO);
    expect(diferencas(CONFIGURACAO_PADRAO, lida)).toEqual(['Medidas das paredes: ligar', 'Arestas (3D): desligar', 'Estilo 3D: Transparente']);
    expect(mesmaConfiguracao(CONFIGURACAO_PADRAO, configuracaoDaColuna({}))).toBe(true);
    expect(TEMPLATES_DE_FABRICA).toHaveLength(5); // + Humanizada (venda), E8.4
    for (const tpl of TEMPLATES_DE_FABRICA) expect(configuracaoDaColuna(tpl.config)).toEqual(tpl.config); // já sanitizado
    const assinaturas = TEMPLATES_DE_FABRICA.map((tpl) => JSON.stringify(tpl.config));
    expect(new Set(assinaturas).size).toBe(5);
    expect(TEMPLATES_DE_FABRICA.find((t) => t.id === 'fab:humanizada')?.config.estiloPlanta).toBe('HUMANIZADA');
    expect(validarTemplate('', [])).toEqual(['nome é obrigatório']);
    expect(validarTemplate('Apresentação', TEMPLATES_DE_FABRICA)).toEqual(['já existe um template chamado "Apresentação"']);
    expect(validarTemplate('Minha vista', TEMPLATES_DE_FABRICA)).toEqual([]);
  });
});
