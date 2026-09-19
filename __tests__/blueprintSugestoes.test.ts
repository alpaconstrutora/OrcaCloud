/**
 * Sugestões (19/09/2026, E5.3): texto determinístico a partir dos indicadores
 * abaixo de 75, prioridade pelo impacto (100 − nota) × peso, uma sugestão por
 * alvo, desbloqueios para o que falta dado, ordem estável, texto corrido.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { avaliar, HIPOTESES_DA_AVALIACAO_PADRAO, PESOS_PADRAO } from '../utils/blueprintAvaliacao';
import { resumirSugestoes, sugerirMelhorias, textoDasSugestoes } from '../utils/blueprintSugestoes';

/** Casa 8 × 6 com porta de 0,70 entre sala e dormitório e uma parede fora do módulo (3,95 m). */
function casa(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 8000, 0), w(8000, 0, 8000, 6000), w(8000, 6000, 0, 6000), w(0, 6000, 0, 0), w(4050, 0, 4050, 6000), w(4050, 3000, 8000, 3000)]).model;
  const sala = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!;
  const dorm = m.spaces.find((s) => s.ring.every((p) => p.x >= 4050) && s.ring.every((p) => p.y >= 3000))!;
  const baixo = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  const meio = m.walls.find((x) => x.a.x === 4050 && x.b.x === 4050)!;
  const direita = m.walls.find((x) => x.a.x === 8000 && x.b.x === 8000)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'NameSpace', spaceId: dorm.id, name: 'Dormitório', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'AddOpening', wallId: baixo.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 4000, widthMm: 700, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: direita.id, kind: 'window', offsetMm: 4000, widthMm: 1200, heightMm: 1200, sillMm: 1000 },
  ]).model;
  return m;
}

describe('sugestões', () => {
  it('modelo vazio: só desbloqueios (programa, regras, saída), sem melhoria de projeto', () => {
    const s = sugerirMelhorias(avaliar({ model: emptyModel() }));
    expect(s.every((x) => x.desbloqueio && x.prioridade === 'BAIXA')).toBe(true);
    expect(s.map((x) => x.titulo)).toEqual(expect.arrayContaining(['Defina o programa de necessidades', 'Desenhe ambientes fechados e aplique uma zona', 'Ponha uma porta para o exterior']));
    expect(resumirSugestoes(s)).toMatchObject({ altas: 0, medias: 0, baixas: 0, desbloqueios: s.length });
  });

  it('casa: a porta de 0,70 vira sugestão com alvo (corredores e acessibilidade), a parede fora do módulo também; prioridade pelo impacto; ordem estável; texto corrido', () => {
    const m = casa();
    const av = avaliar({ model: m });
    const s = sugerirMelhorias(av);
    const daPorta = s.filter((x) => x.alvo?.rotulo === 'Porta 0,70 m');
    expect(daPorta.map((x) => x.indicador).sort()).toEqual(['acessibilidade', 'corredores']);
    expect(daPorta.find((x) => x.indicador === 'corredores')!.titulo).toBe('Alargue a porta 0,70 m para 0,80 m');
    expect(daPorta.find((x) => x.indicador === 'acessibilidade')!.titulo).toBe('Alargue a porta 0,70 m para 0,80 m (NBR 9050)');
    expect(daPorta[0].texto).toMatch(/porta 0,70 m/);
    // Modulação: com módulo de 100 mm só uma parede (3,95 m) foge → nota 83, sem sugestão; com módulo de 3 m quase todas fogem → sugestão geral + uma por parede.
    expect(s.some((x) => x.indicador === 'modulacao' && !x.desbloqueio)).toBe(false);
    const modulacao = sugerirMelhorias(avaliar({ model: m }, { ...HIPOTESES_DA_AVALIACAO_PADRAO, moduloMm: 3000 })).filter((x) => x.indicador === 'modulacao');
    expect(modulacao[0].titulo).toBe('Ajuste as paredes ao módulo');
    expect(modulacao.some((x) => x.alvo?.rotulo === 'Parede 3,95 m')).toBe(true);
    // Prioridade: o terço de maior impacto é ALTA; impacto = (100 − nota) × peso.
    const melhorias = s.filter((x) => !x.desbloqueio);
    const impactos = [...new Set(melhorias.map((x) => x.impacto))];
    expect(impactos).toEqual([...impactos].sort((a, b) => b - a)); // ordenado desc
    expect(melhorias[0].prioridade).toBe('ALTA');
    expect(melhorias.every((x) => x.impacto === (100 - av.indicadores.find((i) => i.chave === x.indicador)!.nota!) * av.indicadores.find((i) => i.chave === x.indicador)!.peso)).toBe(true);
    // Desbloqueios: sem programa e sem prévia de orçamento.
    expect(s.find((x) => x.id === 'programa-desbloqueio')).toMatchObject({ destino: 'programa', desbloqueio: true });
    expect(s.find((x) => x.id === 'custo-desbloqueio')).toMatchObject({ destino: 'orcamento' });
    // Determinístico: duas chamadas, mesma lista.
    expect(sugerirMelhorias(avaliar({ model: m }))).toEqual(s);
    // Peso 0 no indicador tira as sugestões dele.
    const semCorredores = sugerirMelhorias(avaliar({ model: m }, { ...HIPOTESES_DA_AVALIACAO_PADRAO, pesos: { ...PESOS_PADRAO, corredores: 0 } }));
    expect(semCorredores.some((x) => x.indicador === 'corredores')).toBe(false);
    // Texto corrido: cabeçalho com a nota, seções por prioridade, desbloqueios no fim.
    const txt = textoDasSugestoes(av, s);
    expect(txt.split('\n')[0]).toMatch(/^# Avaliação: nota geral \d+ \(\d+ indicador/);
    expect(txt).toMatch(/## Prioridade alta\n- \[/);
    expect(txt).toMatch(/\[Corredores e passagens\] Alargue a porta 0,70 m para 0,80 m — Porta 0,70 m: porta 0,70 m em Sala/);
    expect(txt).toMatch(/## Para avaliar o que falta\n- Defina o programa/);
  });
});
