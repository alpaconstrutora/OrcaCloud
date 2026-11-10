/**
 * O CORTE 3D DA UNIDADE GERADO PELA PLANTA (Espelho de Vendas 3D, F9 — 10/11/2026): o que o 3D da Planta esconde,
 * onde corta e de onde olha para mostrar SÓ a unidade; a assinatura que diz "o desenho mudou"; e a situação do corte
 * nos portais. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { medirUnidade } from '../utils/blueprintUnidades';
import {
  assinaturaDoDecorado,
  cenaDoDecorado,
  pontoDeVistaDoCorte,
  situacaoDoCorte,
  textoDaSituacao,
  unidadeDaAssinatura,
  HIPOTESES_DO_CORTE_DECORADO,
  type CenaDoDecorado,
} from '../utils/espelhoDecoradoDaPlanta';

/**
 * Dois apartamentos lado a lado (6 × 6 m de eixo cada, a divisa em `divisa`) sobre um hall comum (12 × 2 m) — o
 * molde de `blueprintUnidades.test.ts`. 101 e 102 são unidades "Tipo A"; o hall não é de ninguém.
 */
function predio(divisa = 6000, tipologia101: string | null = 'Tipo A'): { m: BlueprintModel; u101: string; u102: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number, e: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: e, heightMm: 2800 });
  m = applyBatch(m, [
    w(0, 0, 12000, 0, 200),
    w(12000, 0, 12000, 8000, 200),
    w(12000, 8000, 0, 8000, 200),
    w(0, 8000, 0, 0, 200),
    w(divisa, 0, divisa, 6000, 150),
    w(0, 6000, 12000, 6000, 150),
  ]).model;
  const achar = (dentroX: number, dentroY: number) =>
    m.spaces.find((s) => {
      const xs = s.ring.map((p) => p.x);
      const ys = s.ring.map((p) => p.y);
      return dentroX > Math.min(...xs) && dentroX < Math.max(...xs) && dentroY > Math.min(...ys) && dentroY < Math.max(...ys);
    })!.id;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: achar(1000, 1000), name: 'Sala 101' },
    { type: 'NameSpace', spaceId: achar(11000, 1000), name: 'Sala 102' },
    { type: 'NameSpace', spaceId: achar(6000, 7000), name: 'Hall' },
  ]).model;
  const etiqueta = (nome: string) => m.labels.find((l) => l.name === nome)!.id;
  m = applyCommand(m, { type: 'AddUnidade', numero: '101', ...(tipologia101 ? { tipologia: tipologia101 } : {}), labelIds: [etiqueta('Sala 101')] }).model;
  m = applyCommand(m, { type: 'AddUnidade', numero: '102', tipologia: 'Tipo A', labelIds: [etiqueta('Sala 102')] }).model;
  return { m, u101: m.unidades.find((u) => u.numero === '101')!.id, u102: m.unidades.find((u) => u.numero === '102')!.id };
}

const cena = (m: BlueprintModel, id: string, ...resto: Parameters<typeof cenaDoDecorado> extends [unknown, unknown, ...infer R] ? R : never): CenaDoDecorado => {
  const r = cenaDoDecorado(m, id, ...resto);
  if (!r.ok) throw new Error(r.motivo);
  return r.cena;
};

describe('cenaDoDecorado — o que mostrar', () => {
  it('esconde as paredes do pavimento que não cercam a unidade, e mostra todas as que a cercam', () => {
    const { m, u101 } = predio();
    const c = cena(m, u101, {}, { mobiliarSugerido: false });
    const daUnidade = new Set(medirUnidade(m, m.unidades.find((u) => u.id === u101)!).paredes.map((p) => p.wallId));
    for (const id of daUnidade) expect(c.ocultos.has(id)).toBe(false);
    const outras = m.walls.filter((w) => !daUnidade.has(w.id));
    expect(outras.length).toBeGreaterThan(0);
    for (const w of outras) expect(c.ocultos.has(w.id)).toBe(true);
    expect(c).toMatchObject({ numero: '101', tipologia: 'Tipo A', levelId: m.levels[0].id });
  });

  it('a caixa é o retângulo da unidade com a folga, do pouco abaixo do piso até a altura do corte', () => {
    const { m, u101 } = predio();
    const c = cena(m, u101, {}, { mobiliarSugerido: false });
    const f = HIPOTESES_DO_CORTE_DECORADO.folgaMm / 1000;
    expect(c.caixa.min).toEqual([0 - f, -0.3, 0 - f]);
    expect(c.caixa.max).toEqual([6 + f, 2.2, 6 + f]);
    // Paredes inteiras: até a altura delas (2,8 m), nunca acima.
    expect(cena(m, u101, { alturaDoCorteMm: null }, { mobiliarSugerido: false }).caixa.max[1]).toBe(2.8);
    expect(cena(m, u101, { alturaDoCorteMm: 9000 }, { mobiliarSugerido: false }).caixa.max[1]).toBe(2.8);
  });

  it('unidade sem móvel: a cópia sai mobiliada com o kit dos ambientes, e o estudo não muda', () => {
    const { m, u101 } = predio();
    const c = cena(m, u101);
    expect(c.moveisDoEstudo).toBe(0);
    expect(c.moveisSugeridos).toBeGreaterThan(0);
    expect(c.modelo).not.toBe(m);
    expect(m.componentes ?? []).toHaveLength(0);
    // Os móveis sugeridos ficam à mostra (estão dentro da unidade).
    expect((c.modelo.componentes ?? []).every((k) => !c.ocultos.has(k.id))).toBe(true);
  });

  it('sem pedir o kit, o modelo é o do estudo', () => {
    const { m, u101 } = predio();
    const c = cena(m, u101, {}, { mobiliarSugerido: false });
    expect(c.modelo).toBe(m);
    expect(c.moveisSugeridos).toBe(0);
  });

  it('o móvel do estudo na vizinha some; o da unidade fica — e com móvel, o kit não entra sozinho', () => {
    let { m, u101 } = predio();
    m = applyBatch(m, [
      { type: 'AddComponente', levelId: m.levels[0].id, tipoId: 'SOFA', at: point(3000, 3000), larguraMm: 2000, profundidadeMm: 900, rotacaoGraus: 0, rotulo: null },
      { type: 'AddComponente', levelId: m.levels[0].id, tipoId: 'SOFA', at: point(9000, 3000), larguraMm: 2000, profundidadeMm: 900, rotacaoGraus: 0, rotulo: null },
    ] as Command[]).model;
    const [naUnidade, naVizinha] = m.componentes!;
    const c = cena(m, u101);
    expect(c.moveisDoEstudo).toBe(1);
    expect(c.moveisSugeridos).toBe(0);
    expect(c.ocultos.has(naUnidade.id)).toBe(false);
    expect(c.ocultos.has(naVizinha.id)).toBe(true);
  });

  it('o que impede o corte vem com o motivo', () => {
    const semTipologia = predio(6000, null);
    const r = cenaDoDecorado(semTipologia.m, semTipologia.u101);
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/não tem tipologia/) });
    expect(cenaDoDecorado(predio().m, 'nao-existe')).toEqual({ ok: false, motivo: 'A unidade não existe mais no desenho.' });
    const { m } = predio();
    const vazia = applyCommand(m, { type: 'AddUnidade', numero: '103', tipologia: 'Tipo A' }).model;
    const r103 = cenaDoDecorado(vazia, vazia.unidades.find((u) => u.numero === '103')!.id);
    expect(r103).toEqual({ ok: false, motivo: expect.stringMatching(/não tem ambiente/) });
  });
});

describe('pontoDeVistaDoCorte', () => {
  const caixa = { min: [0, 0, 0] as [number, number, number], max: [6, 2.2, 6] as [number, number, number] };

  it('olha de cima, do lado pedido, e de fora da caixa', () => {
    const v = pontoDeVistaDoCorte(caixa, HIPOTESES_DO_CORTE_DECORADO);
    expect(v.posicao[1]).toBeGreaterThan(v.alvo[1]);
    // Sudeste: mais a leste (+x) e mais ao sul (−Z do desenho) que o centro.
    expect(v.posicao[0]).toBeGreaterThan(v.alvo[0]);
    expect(v.posicao[2]).toBeLessThan(v.alvo[2]);
    expect(Math.hypot(v.posicao[0] - v.alvo[0], v.posicao[1] - v.alvo[1], v.posicao[2] - v.alvo[2])).toBeGreaterThan(Math.hypot(6, 2.2, 6) / 2);
    const no = pontoDeVistaDoCorte(caixa, { ...HIPOTESES_DO_CORTE_DECORADO, lado: 'NOROESTE' });
    expect(no.posicao[0]).toBeLessThan(no.alvo[0]);
    expect(no.posicao[2]).toBeGreaterThan(no.alvo[2]);
    // A chave muda com o lado: o 3D reposiciona a câmera por ela.
    expect(no.chave).not.toBe(v.chave);
  });
});

describe('assinaturaDoDecorado', () => {
  it('é estável, começa pela unidade, e muda quando a geometria da unidade muda', () => {
    const { m, u101 } = predio();
    const a = assinaturaDoDecorado(m, u101)!;
    expect(assinaturaDoDecorado(m, u101)).toBe(a);
    expect(unidadeDaAssinatura(a)).toBe(m.unidades.find((u) => u.id === u101)!.uid);
    const outra = predio(5000);
    expect(assinaturaDoDecorado(outra.m, outra.u101)!.split('|')[1]).not.toBe(a.split('|')[1]);
  });

  it('renomear um ambiente de fora da unidade não muda a assinatura dela', () => {
    const { m, u101 } = predio();
    const a = assinaturaDoDecorado(m, u101);
    const hall = m.spaces.find((s) => m.labels.find((l) => l.uid === s.labelUid)?.name === 'Hall')!;
    const renomeado = applyCommand(m, { type: 'NameSpace', spaceId: hall.id, name: 'Circulação' }).model;
    expect(assinaturaDoDecorado(renomeado, u101)).toBe(a);
  });

  it('unidade que não dá corte não tem assinatura', () => {
    const { m, u101 } = predio(6000, null);
    expect(assinaturaDoDecorado(m, u101)).toBeNull();
  });
});

describe('situacaoDoCorte', () => {
  const base = { temEmpreendimento: true, tipologia: 'Tipo A', tipologiaNoEmpreendimento: true, assinaturaAtual: 'u1|aaaa', numeroPorUid: new Map([['u1', '101'], ['u2', '102']]) };
  const gravado = (origem: 'ENVIADA' | 'PLANTA', planta_assinatura: string | null) => ({ origem, planta_assinatura, updated_at: '2026-11-10T12:00:00Z' });

  it('cada caso, na ordem em que se resolve', () => {
    expect(situacaoDoCorte({ ...base, temEmpreendimento: false, gravado: null }).tipo).toBe('SEM_EMPREENDIMENTO');
    expect(situacaoDoCorte({ ...base, tipologiaNoEmpreendimento: false, gravado: null })).toEqual({ tipo: 'TIPOLOGIA_FORA', tipologia: 'Tipo A' });
    expect(situacaoDoCorte({ ...base, gravado: null }).tipo).toBe('NUNCA_ENVIADO');
    expect(situacaoDoCorte({ ...base, gravado: gravado('ENVIADA', null) }).tipo).toBe('IMAGEM_ENVIADA');
    expect(situacaoDoCorte({ ...base, gravado: gravado('PLANTA', 'u2|bbbb') })).toMatchObject({ tipo: 'DE_OUTRA_UNIDADE', numero: '102' });
    expect(situacaoDoCorte({ ...base, gravado: gravado('PLANTA', 'u1|bbbb') }).tipo).toBe('DESATUALIZADO');
    expect(situacaoDoCorte({ ...base, gravado: gravado('PLANTA', 'u1|aaaa') }).tipo).toBe('EM_DIA');
  });

  it('a frase diz a data e de qual unidade veio', () => {
    expect(textoDaSituacao({ tipo: 'DE_OUTRA_UNIDADE', numero: '102', em: '2026-11-10T12:00:00Z' })).toBe('Enviado da unidade 102 em 10/11/2026.');
    expect(textoDaSituacao({ tipo: 'DESATUALIZADO', em: null })).toBe('O desenho mudou desde o envio.');
    expect(textoDaSituacao({ tipo: 'TIPOLOGIA_FORA', tipologia: 'Tipo Z' })).toBe('O Empreendimento não tem a tipologia "Tipo Z".');
  });
});
