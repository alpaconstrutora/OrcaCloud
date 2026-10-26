/**
 * ELETRODUTO NÃO BIFURCA (25/10/2026).
 *
 * O pedido, com print do 3D da Garden: *"o conduite que sobe do painel e bifurca para dois lados. Isso nao acontece na
 * instalacao. deve sair dois eletrodutos um para cada lado. eletrodutos conduite nao bifurca."*
 *
 * Eletroduto só se encontra com outro DENTRO de uma caixa (a do ponto, a de passagem, o quadro). O motor monta uma
 * árvore a partir do quadro, e o tronco é compartilhado: sem caixa de passagem, o nó onde a árvore se divide é um "T"
 * que não existe na obra. Aqui a árvore do plano é desdobrada, em dois casos:
 *
 *   nó SOBRE uma caixa ... o nó no alto da descida até a caixa (a do ponto, o quadro — o motor já contava a caixa do ponto
 *                          como a da derivação). Cada eletroduto que chega ao nó DESCE até a caixa: a descida é
 *                          repetida, uma por eletroduto, com os circuitos dele. Na Garden, o "T" acima do quadro vira
 *                          dois eletrodutos que sobem do quadro, um para cada lado.
 *   nó no MEIO do forro .. sem caixa embaixo: cada ramo ganha o PRÓPRIO eletroduto de volta até a caixa anterior (ou o
 *                          quadro) — os trechos de cima são repetidos, um por ramo, cada um com os circuitos do seu ramo.
 *
 * Os repetidos têm as mesmas pontas (correm juntos); o desenho os separa lado a lado.
 *
 * Só a rede NOVA do plano: o nó da rede que já existe é tratado como caixa (não se mexe no que o usuário tem; o
 * "Refazer" lança tudo de novo).
 */

/** O trecho novo do plano, no formato do `AddTrecho`. */
export interface TrechoDoPlano {
  levelId: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
  cotaAMm: number;
  cotaBMm: number;
  circuitoIds?: string[] | null;
  bitolaMm: number;
}

export interface OpcoesDoDesdobramento {
  /** A chave do nó — a mesma do grafo do motor (`fazerChave`): junta o teto de um pavimento ao piso do de cima. */
  no: (levelId: string, x: number, y: number, cotaMm: number) => string;
  /** O nó do quadro: a raiz da árvore. */
  raiz: string;
  /** Há caixa neste nó (ponto, quadro, caixa de passagem, rede existente)? Ali o eletroduto pode se encontrar. */
  ehCaixa: (no: string) => boolean;
  /** A bitola do eletroduto que leva só estes circuitos. Ausente = a do trecho repetido. */
  bitolaDe?: (circuitoIds: readonly string[]) => number;
}

/**
 * Os trechos do plano sem derivação fora de caixa: cada trecho volta igual, ou repetido — um por ramo que passa por ele.
 * A ordem é a de entrada (os repetidos no lugar do original), para o lote continuar estável.
 */
export function desdobrarDerivacoes<T extends TrechoDoPlano>(trechos: readonly T[], o: OpcoesDoDesdobramento): T[] {
  const pontas = trechos.map((t) => ({ de: o.no(t.levelId, t.a.x, t.a.y, t.cotaAMm), para: o.no(t.levelId, t.b.x, t.b.y, t.cotaBMm) }));
  const incidentes = new Map<string, number[]>();
  pontas.forEach((p, i) => {
    for (const k of [p.de, p.para]) incidentes.set(k, [...(incidentes.get(k) ?? []), i]);
  });

  // A árvore a partir do quadro (e, nos pedaços que não chegam a ele, a partir de uma caixa deles): quem é filho de quem.
  const filhos = new Map<string, number[]>(); // nó → trechos que descem dele
  const abaixo = new Map<number, string>(); // trecho → o nó de baixo (o mais longe da raiz)
  const visitado = new Set<string>();
  const percorrer = (raiz: string) => {
    visitado.add(raiz);
    const fila = [raiz];
    while (fila.length) {
      const n = fila.shift()!;
      for (const i of incidentes.get(n) ?? []) {
        if (abaixo.has(i)) continue;
        const outro = pontas[i].de === n ? pontas[i].para : pontas[i].de;
        if (visitado.has(outro)) continue; // fecharia anel: o trecho fica como está
        abaixo.set(i, outro);
        filhos.set(n, [...(filhos.get(n) ?? []), i]);
        visitado.add(outro);
        fila.push(outro);
      }
    }
  };
  if (incidentes.has(o.raiz)) percorrer(o.raiz);
  for (const k of incidentes.keys()) if (!visitado.has(k) && o.ehCaixa(k)) percorrer(k);

  // O nó SOBRE uma caixa: a descida reta (mesmo x, y) dele até uma caixa logo abaixo — qualquer que seja o lado da árvore.
  const vertical = (i: number) => trechos[i].a.x === trechos[i].b.x && trechos[i].a.y === trechos[i].b.y;
  const outraPonta = (i: number, n: string) => (pontas[i].de === n ? pontas[i].para : pontas[i].de);
  const cotaDaPonta = (i: number, n: string) => (pontas[i].de === n ? trechos[i].cotaAMm : trechos[i].cotaBMm);
  const descidaAteCaixa = (n: string): number | null => {
    if (o.ehCaixa(n)) return null;
    for (const i of incidentes.get(n) ?? []) {
      if (!vertical(i) || !(abaixo.has(i))) continue;
      const outro = outraPonta(i, n);
      if (o.ehCaixa(outro) && cotaDaPonta(i, outro) < cotaDaPonta(i, n)) return i;
    }
    return null;
  };
  const acima = new Map<number, string>(); // trecho → o nó de cima (o mais perto da raiz)
  for (const [n, fs] of filhos) for (const i of fs) acima.set(i, n);

  // As FAIXAS de cada trecho: os circuitos de cada eletroduto que passa por ele. De baixo para cima: o trecho que chega
  // numa caixa (ou numa ponta, ou num nó sobre caixa) é um eletroduto só; o que chega num nó sem caixa leva as faixas de
  // todos os que descem dali.
  const circuitos = (i: number) => [...(trechos[i].circuitoIds ?? [])];
  const faixas = new Map<number, string[][]>();
  const faixasDe = (i: number): string[][] => {
    const memo = faixas.get(i);
    if (memo) return memo;
    const n = abaixo.get(i);
    let r: string[][];
    const d = n != null ? descidaAteCaixa(n) : null;
    if (n == null || o.ehCaixa(n)) r = [circuitos(i)];
    else if (d != null && d !== i) r = [circuitos(i)]; // chega ao nó sobre caixa: desce até ela, sozinho
    else if (d === i) r = repetidasDaDescida(n, i); // a descida que é o pai do nó (o quadro embaixo)
    else {
      const descem = filhos.get(n) ?? [];
      r = descem.length === 0 ? [circuitos(i)] : descem.flatMap(faixasDe);
    }
    faixas.set(i, r);
    return r;
  };
  /** As cópias da descida `d` do nó `n`: uma por eletroduto que chega a `n` (o pai, inteiro; cada filho, por faixa). */
  function repetidasDaDescida(n: string, d: number): string[][] {
    const pai = [...acima.keys()].find((i) => abaixo.get(i) === n && i !== d);
    const doPai = pai != null && pai !== d ? [circuitos(pai)] : [];
    const dosFilhos = (filhos.get(n) ?? []).filter((f) => f !== d).flatMap(faixasDe);
    const todas = [...doPai, ...dosFilhos];
    return todas.length > 0 ? todas : [circuitos(d)];
  }
  // A descida que é FILHA do nó sobre caixa (o ponto embaixo): repetida igual, uma por eletroduto que chega.
  for (const [n] of filhos) {
    const d = descidaAteCaixa(n);
    if (d == null || abaixo.get(d) === n) continue; // a descida que é o PAI do nó sai em `faixasDe`
    if (!faixas.has(d)) faixas.set(d, repetidasDaDescida(n, d));
  }

  const saida: T[] = [];
  trechos.forEach((t, i) => {
    const f = abaixo.has(i) ? faixasDe(i) : [circuitos(i)];
    if (f.length <= 1) {
      saida.push(t);
      return;
    }
    for (const ids of f) saida.push({ ...t, circuitoIds: ids, bitolaMm: o.bitolaDe ? o.bitolaDe(ids) : t.bitolaMm });
  });
  return saida;
}
