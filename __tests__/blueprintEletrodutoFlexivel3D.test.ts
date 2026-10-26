/**
 * O ELETRODUTO FLEXÍVEL NO 3D (25/10/2026): *"o conduite e flexivel e nao deve fazer curva em 90 graus (veja Print).
 * refaça com curva continuada e sem corte"*.
 */
import { describe, expect, it } from 'vitest';
import { CURVA_EM_DIAMETROS, VAO_ENTRE_ELETRODUTOS_MM, caminhosDosEletrodutos, type P3, type TrechoDoTubo } from '../utils/blueprintEletrodutoFlexivel3D';

const L = 'L0';
let n = 0;
/** Um trecho reto, ou em "L" quando se dão os pedaços. */
const trecho = (pedacos: [number, number, number, number, number, number][], circuitos: string[] = ['c1']): TrechoDoTubo => {
  const [ax, ay, ca] = pedacos[0];
  const ult = pedacos[pedacos.length - 1];
  return {
    id: `t${++n}`,
    levelId: L,
    a: { x: ax, y: ay },
    b: { x: ult[3], y: ult[4] },
    cotaAMm: ca,
    cotaBMm: ult[5],
    bitolaMm: 25,
    circuitoIds: circuitos,
    segmentos: pedacos.map(([x1, y1, c1, x2, y2, c2]) => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, cotaAMm: c1, cotaBMm: c2 })),
    elevacaoMm: 0,
  };
};
const angulo = (u: P3, v: P3) => {
  const nu = Math.hypot(...u);
  const nv = Math.hypot(...v);
  return (Math.acos(Math.min(1, Math.max(-1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv)))) * 180) / Math.PI;
};
const dir = (p: P3, q: P3): P3 => [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
/** O maior desvio de direção entre dois pedaços seguidos da linha, em graus. */
const maiorQuebra = (pts: P3[]) => {
  let m = 0;
  for (let k = 1; k + 1 < pts.length; k++) m = Math.max(m, angulo(dir(pts[k - 1], pts[k]), dir(pts[k], pts[k + 1])));
  return m;
};
const semCaixa = () => false;

describe('caminhosDosEletrodutos', () => {
  it('⚠️ o "L" do trecho (sobe na parede, corre no forro) vira curva: nenhuma quebra de 90°, tangente às duas retas', () => {
    const t = trecho([[0, 0, 300, 0, 0, 2800], [0, 0, 2800, 3000, 0, 2800]]);
    const pts = caminhosDosEletrodutos([t], semCaixa).get(t.id)!;
    // Começa e termina onde o trecho começa e termina.
    expect(pts[0]).toEqual([0, 0, 300]);
    expect(pts[pts.length - 1]).toEqual([3000, 0, 2800]);
    // O canto de 90° vira oito passos de no máximo ~12°.
    expect(maiorQuebra(pts)).toBeLessThan(15);
    // A curva começa a 6 × Ø (150 mm) do canto, nas duas retas.
    expect(pts).toContainEqual([0, 0, 2800 - CURVA_EM_DIAMETROS * 25]);
    expect(pts).toContainEqual([CURVA_EM_DIAMETROS * 25, 0, 2800]);
  });

  it('a curva nunca toma mais que 45 % do pedaço menor', () => {
    const t = trecho([[0, 0, 2700, 0, 0, 2800], [0, 0, 2800, 3000, 0, 2800]]); // 100 mm de subida
    const pts = caminhosDosEletrodutos([t], semCaixa).get(t.id)!;
    expect(pts).toContainEqual([0, 0, 2755]);
  });

  it('⚠️ SEM CORTE na emenda: dois trechos num nó sem caixa formam uma linha só, e cada um recebe a sua parte (mesmo ponto, mesma direção)', () => {
    const subida = trecho([[0, 0, 300, 0, 0, 2800]]);
    const forro = trecho([[0, 0, 2800, 3000, 0, 2800]]);
    const r = caminhosDosEletrodutos([subida, forro], semCaixa);
    const a = r.get(subida.id)!;
    const b = r.get(forro.id)!;
    // As partes se encontram no MEIO da curva…
    expect(a[a.length - 1]).toEqual(b[0]);
    // …e chegam e saem na mesma direção (nada de quebra na emenda).
    expect(angulo(dir(a[a.length - 2], a[a.length - 1]), dir(b[0], b[1]))).toBeLessThan(15);
    expect(maiorQuebra([...a, ...b.slice(1)])).toBeLessThan(15);
  });

  it('numa CAIXA a linha termina: dois eletrodutos que chegam à caixa não se emendam', () => {
    const um = trecho([[0, 0, 2800, 1000, 0, 2800]]);
    const outro = trecho([[1000, 0, 2800, 1000, 1000, 2800]]);
    const r = caminhosDosEletrodutos([um, outro], (_l, x, y) => x === 1000 && y === 0);
    // Cada um reto, sem curva: o canto fica na caixa.
    expect(r.get(um.id)).toEqual([[0, 0, 2800], [1000, 0, 2800]]);
    expect(r.get(outro.id)).toEqual([[1000, 0, 2800], [1000, 1000, 2800]]);
  });

  it('os que correm JUNTOS (as mesmas pontas) saem lado a lado, afastados um diâmetro mais o vão', () => {
    const um = trecho([[0, 0, 2800, 3000, 0, 2800]], ['c1']);
    const outro = trecho([[0, 0, 2800, 3000, 0, 2800]], ['c2']);
    const r = caminhosDosEletrodutos([um, outro], () => true);
    const y1 = r.get(um.id)![0][1];
    const y2 = r.get(outro.id)![0][1];
    expect(Math.abs(y1 - y2)).toBeCloseTo(25 + VAO_ENTRE_ELETRODUTOS_MM);
    // Simétricos em torno da linha do trecho.
    expect(y1 + y2).toBeCloseTo(0);
  });

  it('vários juntos num nó sem caixa: cada um segue o que tem os MESMOS circuitos', () => {
    // Do quadro (caixa em 0,0,1600) sobem dois (c1 e c2) até o nó no forro; dali cada um segue para o seu lado.
    const sobeC1 = trecho([[0, 0, 1600, 0, 0, 2800]], ['c1']);
    const sobeC2 = trecho([[0, 0, 1600, 0, 0, 2800]], ['c2']);
    const vaiC1 = trecho([[0, 0, 2800, 3000, 0, 2800]], ['c1']);
    const vaiC2 = trecho([[0, 0, 2800, -3000, 0, 2800]], ['c2']);
    const r = caminhosDosEletrodutos([sobeC1, sobeC2, vaiC1, vaiC2], (_l, x, y, c) => x === 0 && y === 0 && c === 1600);
    // A subida do c1 emenda com o que vai para +x: o fim de uma é o começo da outra.
    expect(r.get(sobeC1.id)![r.get(sobeC1.id)!.length - 1]).toEqual(r.get(vaiC1.id)![0]);
    expect(r.get(sobeC2.id)![r.get(sobeC2.id)!.length - 1]).toEqual(r.get(vaiC2.id)![0]);
    // E as duas subidas não ficam uma dentro da outra.
    expect(r.get(sobeC1.id)![0]).not.toEqual(r.get(sobeC2.id)![0]);
  });
});
