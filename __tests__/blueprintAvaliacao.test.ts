/**
 * Motor de avaliação (19/09/2026, E5.2): dezoito indicadores com explicação,
 * não avaliado quando falta o dado, nota geral ponderada pelos pesos, piores
 * três, réguas declaradas e a leitura tolerante das hipóteses.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { avaliar, CHAVES_DOS_INDICADORES, corDaNota, hipotesesDaAvaliacaoDaColuna, HIPOTESES_DA_AVALIACAO_PADRAO, PESOS_PADRAO } from '../utils/blueprintAvaliacao';
import { conferirPrograma } from '../utils/blueprintConferenciaDoPrograma';
import { adicionarItem, definirRelacao, novoItem, programaVazio } from '../utils/blueprintPrograma';
import { avaliarRegras, REGRAS_SEMENTE } from '../utils/blueprintRegras';

/** Casa 8 × 6 (E4.2/E5.1): Sala (janela O, porta S), Cozinha (cega), Dormitório (janela L); porta sala↔dorm de 0,70. */
function casa(): { m: BlueprintModel; t: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 8000, 0), w(8000, 0, 8000, 6000), w(8000, 6000, 0, 6000), w(0, 6000, 0, 0), w(4000, 0, 4000, 6000), w(4000, 3000, 8000, 3000)]).model;
  const sala = m.spaces.find((s) => s.ring.some((p) => p.x === 0))!;
  const coz = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y <= 3000))!;
  const dorm = m.spaces.find((s) => s.ring.every((p) => p.x >= 4000) && s.ring.every((p) => p.y >= 3000))!;
  const baixo = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  const esquerda = m.walls.find((x) => x.a.x === 0 && x.b.x === 0)!;
  const meio = m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!;
  const direita = m.walls.find((x) => x.a.x === 8000 && x.b.x === 8000)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'NameSpace', spaceId: coz.id, name: 'Cozinha', tipoDeAmbiente: 'COZINHA_SERVICO' },
    { type: 'NameSpace', spaceId: dorm.id, name: 'Dormitório', tipoDeAmbiente: 'SALA_DORMITORIO' },
    { type: 'AddOpening', wallId: baixo.id, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: esquerda.id, kind: 'window', offsetMm: 2000, widthMm: 1500, heightMm: 1200, sillMm: 1000 },
    { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: meio.id, kind: 'door', offsetMm: 4000, widthMm: 700, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: direita.id, kind: 'window', offsetMm: 4000, widthMm: 1200, heightMm: 1200, sillMm: 1000 },
  ]).model;
  return { m, t };
}

describe('avaliação', () => {
  it('modelo vazio: tudo não avaliado, nota geral nula, cada indicador diz por quê', () => {
    const a = avaliar({ model: emptyModel() });
    expect(a.indicadores).toHaveLength(CHAVES_DOS_INDICADORES.length);
    expect(a.notaGeral).toBeNull();
    expect(a.avaliados).toBe(0);
    expect(a.naoAvaliados).toBe(18);
    expect(a.indicadores.every((i) => i.nota === null && i.explicacao.length > 10)).toBe(true);
    expect(a.piores).toEqual([]);
  });

  it('casa: só do modelo, eficiência/circulação/compacidade/corredores/privacidade/modulação/paredes/fachada pontuam e explicam; o resto diz o que falta', () => {
    const { m } = casa();
    const a = avaliar({ model: m });
    const de = (k: string) => a.indicadores.find((i) => i.chave === k)!;
    // Eficiência: útil 22,52 + 10,97 + 10,97 = 44,47 de 50,12 construídos (8,15 × 6,15, meia parede externa) → 88,7 % → 96.
    expect(de('eficiencia').nota).toBe(96);
    expect(de('eficiencia').explicacao).toMatch(/44,47 m² \/ construída 50,12 m² = 88,7 %/);
    // Circulação 0 % → 100; limite padrão 15 % (sem programa).
    expect(de('circulacao')).toMatchObject({ nota: 100 });
    expect(de('circulacao').explicacao).toMatch(/limite 15 %, padrão/);
    // Compacidade: retângulo 8 × 6 → P²/A = 28²/48 = 16,33 → 98.
    expect(de('compacidade').nota).toBe(98);
    expect(de('compacidade').detalhes[0]).toMatch(/P²\/A = 16,3/);
    // Corredores/portas: 3 portas, uma de 0,70 → 2 de 3 = 67; o alvo é a porta.
    expect(de('corredores').nota).toBe(67);
    expect(de('corredores').detalhes).toEqual(['porta 0,70 m em Sala']);
    expect(de('corredores').alvos[0].rotulo).toBe('Porta 0,70 m');
    // Acessibilidade: mesma porta estreita; há saída.
    expect(de('acessibilidade').nota).toBe(67);
    // Privacidade: o dormitório só abre para a sala (social) → 100.
    expect(de('privacidade').nota).toBe(100);
    // Modulação: todas as paredes múltiplas de 100 mm → 100.
    expect(de('modulacao').nota).toBe(100);
    // Paredes: 28 + 6 + 4 = 38 m / 50,12 m² = 0,76 m/m² → régua 0,6→100, 1,4→0 → 80.
    expect(de('paredes').nota).toBe(80);
    expect(de('paredes').explicacao).toMatch(/0,76 m\/m²/);
    // Fachada: sala e dormitório exigem e têm janela → 100.
    expect(de('fachada').nota).toBe(100);
    // Não avaliados com o motivo.
    expect(de('programa')).toMatchObject({ nota: null });
    expect(de('programa').explicacao).toMatch(/Sem programa/);
    expect(de('legal').explicacao).toMatch(/Nenhuma regra avaliada/);
    expect(de('insolacao').explicacao).toMatch(/Insolação não calculada/);
    expect(de('estrutura').explicacao).toMatch(/Sem vigas nem pilares/);
    expect(de('custo').explicacao).toMatch(/Sem prévia de orçamento/);
    expect(de('shafts').explicacao).toMatch(/Um pavimento só/);
    expect(de('hidraulica').explicacao).toMatch(/Sem rede hidráulica/);
    // Nota geral = média ponderada só dos avaliados.
    const avaliados = a.indicadores.filter((i) => i.nota != null);
    const esperado = Math.round(avaliados.reduce((s, i) => s + i.nota! * i.peso, 0) / avaliados.reduce((s, i) => s + i.peso, 0));
    expect(a.notaGeral).toBe(esperado);
    expect(a.avaliados).toBe(avaliados.length);
    expect(a.piores[0].nota).toBeLessThanOrEqual(a.piores[1].nota!);
    // Peso zero tira o indicador da média geral.
    const semParedes = avaliar({ model: m }, { ...HIPOTESES_DA_AVALIACAO_PADRAO, pesos: { ...PESOS_PADRAO, paredes: 0 } });
    expect(semParedes.avaliados).toBe(avaliados.length - 1);
  });

  it('com programa, regras, insolação e custo: programa/legal/insolação/ventilação/adjacências/custo pontuam; a régua do custo e as hipóteses sanitizadas', () => {
    const { m } = casa();
    let p = programaVazio('Teste');
    const sala = novoItem('SALA');
    const coz = novoItem('COZINHA');
    const dorm = novoItem('DORMITORIO');
    const banho = novoItem('BANHEIRO');
    p = [sala, coz, dorm, banho].reduce((acc, i) => adicionarItem(acc, i), p);
    p = definirRelacao(p, sala.id, coz.id, 8); // porta direta → atendida (8)
    p = definirRelacao(p, coz.id, dorm.id, 6); // dividem parede → atendida (6)
    p = definirRelacao(p, sala.id, banho.id, 5); // banheiro não existe → não avaliada (fora do total)
    const conferencia = conferirPrograma(m, p);
    const regras = avaliarRegras(m, REGRAS_SEMENTE, {});
    const a = avaliar({ model: m, programa: p, conferencia, resultadosDeRegras: regras, insolacao: { latitudeGraus: -23.5, rotacaoNorteDeg: null, prismas: [] }, custoTotalBRL: 50.1225 * 3000 }, { ...HIPOTESES_DA_AVALIACAO_PADRAO, referenciaM2BRL: 3000 });
    const de = (k: string) => a.indicadores.find((i) => i.chave === k)!;
    expect(de('programa').nota).not.toBeNull();
    expect(de('programa').explicacao).toMatch(/atendido\(s\), \d+ falta\(s\)/);
    expect(de('programa').detalhes).toContain('Banheiro: faltam 1');
    expect(de('legal').nota).not.toBeNull();
    expect(de('legal').explicacao).toMatch(/conforme\(s\), \d+ erro\(s\) \(pesam dobrado\)/);
    // Insolação: sala (O) e dormitório (L) têm > 1 h de sol de inverno → 100; ventilação: sala cruza, dormitório não → 50.
    expect(de('insolacao').nota).toBe(100);
    expect(de('insolacao').explicacao).toMatch(/2 de 2 ambiente\(s\) de permanência.*mínimo suposto de 1 h/);
    expect(de('ventilacao').nota).toBe(50);
    expect(de('ventilacao').detalhes).toEqual(['Dormitório: abertura só na fachada L']);
    // Adjacências: 8 + 6 atendidos de 14 → 100.
    expect(de('adjacencias').nota).toBe(100);
    expect(de('adjacencias').explicacao).toBe('Σ peso das relações desejáveis atendidas 14 / 14.');
    // Custo: R$ 3.000/m² = 100 % da referência → régua 80 % → 100, 140 % → 0 → 67.
    expect(de('custo').nota).toBe(67);
    expect(de('custo').explicacao).toMatch(/100,0 %/);
    // Circulação usa o limite do programa (15 %).
    expect(de('circulacao').explicacao).toMatch(/do programa/);
    expect(a.notaGeral).not.toBeNull();
    // Hipóteses: pesos fora de 0–10 são presos; lixo volta ao padrão.
    const hip = hipotesesDaAvaliacaoDaColuna({ pesos: { programa: 25, legal: -3, custo: 'x' }, referenciaM2BRL: -1, moduloMm: 'a', vaoMaxDaVigaMm: 7000 });
    expect(hip.pesos.programa).toBe(10);
    expect(hip.pesos.legal).toBe(0);
    expect(hip.pesos.custo).toBe(PESOS_PADRAO.custo);
    expect(hip.referenciaM2BRL).toBeNull();
    expect(hip.moduloMm).toBe(100);
    expect(hip.vaoMaxDaVigaMm).toBe(7000);
    expect(corDaNota(80)).toBe('verde');
    expect(corDaNota(60)).toBe('ambar');
    expect(corDaNota(10)).toBe('vermelho');
    expect(corDaNota(null)).toBe('cinza');
  });
});
