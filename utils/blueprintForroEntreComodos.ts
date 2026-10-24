/**
 * NO FORRO, LUZ × LUZ DE CÔMODOS DIFERENTES PELAS TRAVESSIAS (24/10/2026).
 *
 * Pergunta do relatório do PR #137: *"quer que, no forro, a ligação entre luzes de cômodos diferentes use as passagens
 * já previstas junto às paredes?"* — resposta do usuário: *"sim"*. Plano:
 * `docs/planos/2026-10-24-forro-luz-pelas-travessias.md`.
 *
 * Com o PR #137 a árvore das luzes no forro ligava luz a luz (e quadro a luz) em RETA, mesmo entre cômodos diferentes, e
 * a reta furava a viga onde caísse. A casa automática já prevê, em cada parede comum a dois cômodos, as TRAVESSIAS
 * (`paredesDoForro`, ids `forro:travessia:A:B:…`): o furo da viga posto fora da zona de 2h junto dos apoios (NBR 6118,
 * 13.2.5.1, F14c). Esta é a árvore das luzes que só passa de um cômodo a outro por elas:
 *
 *   - a REGIÃO de cada nó é o cômodo dele (quem chama decide: `comodoDoPonto`);
 *   - a DISTÂNCIA entre dois nós é a reta no mesmo cômodo e, entre cômodos, o menor caminho num grafo cujos nós são as
 *     pontas das travessias e os dois nós, e cujas arestas são a reta entre dois nós da MESMA região e a própria
 *     travessia (ponta `a` → ponta `b`);
 *   - o Prim (o mesmo de `arvoreComRotaLimitada` com `limite: null`: a luz pendura no nó mais perto) mede por essa
 *     distância, e ligar é percorrer o caminho — cada trecho reto vai para `ligar` (no planejador, `ligarNaRede`, que
 *     desvia de pilar);
 *   - as pontas de travessia percorridas viram nós ALCANÇADOS: a próxima luz do outro cômodo reaproveita a mesma
 *     travessia, sem trecho duplicado;
 *   - sem caminho (cômodo sem travessia, ponto fora de todo cômodo), a reta até o alcançado mais perto, como antes:
 *     nunca deixa luz sem ligar.
 *
 * Num cômodo só, a escolha é a mesma de `arvoreComRotaLimitada` com `limite: null` (o teste confere): mesmas
 * distâncias, o mesmo desempate (pendente por x, y; alcançado na ordem de chegada).
 *
 * Correção 2 (24/10/2026): só é FONTE o alcançado com rota finita — ligado ao quadro. A ponta de uma rede existente
 * órfã (fragmento que não chega ao quadro) fica de fora: pendurar a luz nela a deixaria sem caminho até o quadro.
 */
import type { No, Ponto2 } from './blueprintGrafoDeRede';

/** Uma travessia do forro: a ponta no anel de um cômodo e a ponta no anel do vizinho. */
export interface TravessiaDoForro {
  a: Ponto2;
  b: Ponto2;
}

const dist = (p: Ponto2, q: Ponto2) => Math.hypot(q.x - p.x, q.y - p.y);

/**
 * A árvore das luzes do forro pelas travessias (ver o cabeçalho). `alcancados` e `rota` são MUTADOS, como em
 * `arvoreComRotaLimitada`: entram as pendentes e as pontas de travessia percorridas. `ligar` recebe cada trecho reto,
 * na ordem do caminho (do alcançado para a pendente).
 */
export function arvorePelasTravessias(opts: {
  alcancados: Map<No, Ponto2>;
  rota: Map<No, number>;
  pendentes: Map<No, Ponto2>;
  travessias: readonly TravessiaDoForro[];
  /** O cômodo do ponto (`null` = fora de todos: só a reta o alcança). */
  regiao: (p: Ponto2) => string | null;
  /** A chave do nó na rede (a cota da faixa é de quem chama). */
  chave: (p: Ponto2) => No;
  ligar: (de: { no: No; pos: Ponto2 }, para: { no: No; pos: Ponto2 }) => void;
}): void {
  const { alcancados, rota, ligar } = opts;
  const regiaoDoNo = new Map<No, string | null>();
  const regiao = (k: No, p: Ponto2) => {
    if (!regiaoDoNo.has(k)) regiaoDoNo.set(k, opts.regiao(p));
    return regiaoDoNo.get(k)!;
  };
  // As pontas das travessias e, de cada uma, a do outro lado.
  const pontas = new Map<No, Ponto2>();
  const outroLado = new Map<No, { no: No; mm: number }[]>();
  for (const t of opts.travessias) {
    const ka = opts.chave(t.a);
    const kb = opts.chave(t.b);
    if (ka === kb) continue;
    pontas.set(ka, t.a);
    pontas.set(kb, t.b);
    const mm = dist(t.a, t.b);
    outroLado.set(ka, [...(outroLado.get(ka) ?? []), { no: kb, mm }]);
    outroLado.set(kb, [...(outroLado.get(kb) ?? []), { no: ka, mm }]);
  }
  const restantes = [...opts.pendentes.entries()].sort(([, p], [, q]) => p.x - q.x || p.y - q.y);
  /** Alcançado E ligado ao quadro (rota finita). */
  const ligado = (k: No) => alcancados.has(k) && Number.isFinite(rota.get(k) ?? Infinity);

  while (restantes.length > 0) {
    const pendente = new Map(restantes);
    const posDe = (k: No): Ponto2 => alcancados.get(k) ?? pendente.get(k) ?? pontas.get(k)!;
    // Os nós ainda não alcançados (pontas livres e pendentes), por região — os vizinhos em reta.
    const porRegiao = new Map<string, No[]>();
    const livres = [...[...pontas.keys()].filter((k) => !ligado(k) && !pendente.has(k)), ...pendente.keys()];
    for (const k of livres) {
      const r = regiao(k, posDe(k));
      if (r != null) porRegiao.set(r, [...(porRegiao.get(r) ?? []), k]);
    }
    // Dijkstra a partir de TODOS os alcançados (distância 0, na ordem de chegada — o desempate do Prim). A pendente
    // não é passagem: é destino.
    const d = new Map<No, number>();
    const anterior = new Map<No, No>();
    const abertos = new Set<No>();
    for (const k of alcancados.keys()) {
      if (!ligado(k)) continue;
      d.set(k, 0);
      abertos.add(k);
    }
    while (abertos.size > 0) {
      let u: No | null = null;
      for (const n of abertos) if (u == null || d.get(n)! < d.get(u)!) u = n;
      abertos.delete(u!);
      if (pendente.has(u!)) continue;
      const pu = posDe(u!);
      const du = d.get(u!)!;
      const r = regiao(u!, pu);
      const vizinhos = [
        ...(r != null ? (porRegiao.get(r) ?? []) : []).map((v) => ({ no: v, mm: dist(pu, posDe(v)) })),
        ...(outroLado.get(u!) ?? []).filter((v) => !ligado(v.no)),
      ];
      for (const v of vizinhos) {
        if (v.no === u) continue;
        const nova = du + v.mm;
        // Folga numérica: um caminho com escala que empata com a reta não a troca.
        if (nova < (d.get(v.no) ?? Infinity) - 1e-6) {
          d.set(v.no, nova);
          anterior.set(v.no, u!);
          abertos.add(v.no);
        }
      }
    }
    // A pendente de menor distância (sem caminho: a reta até o alcançado mais perto).
    let melhor: { i: number; custo: number; reta: No | null } | null = null;
    for (let i = 0; i < restantes.length; i++) {
      const [k, p] = restantes[i];
      let custo = d.get(k) ?? Infinity;
      let reta: No | null = null;
      if (!Number.isFinite(custo)) {
        for (const [ka, a] of alcancados) {
          if (!ligado(ka)) continue;
          const mm = dist(a, p);
          if (mm < custo) {
            custo = mm;
            reta = ka;
          }
        }
      }
      if (!melhor || custo < melhor.custo) melhor = { i, custo, reta };
    }
    if (!melhor || !Number.isFinite(melhor.custo)) break;
    const [[k]] = restantes.splice(melhor.i, 1);
    const caminho: No[] = [k];
    if (melhor.reta != null) caminho.unshift(melhor.reta);
    else while (!ligado(caminho[0])) caminho.unshift(anterior.get(caminho[0])!);
    for (let j = 1; j < caminho.length; j++) {
      const de = { no: caminho[j - 1], pos: posDe(caminho[j - 1]) };
      const para = { no: caminho[j], pos: posDe(caminho[j]) };
      ligar(de, para);
      alcancados.set(para.no, para.pos);
      rota.set(para.no, (rota.get(de.no) ?? Infinity) + dist(de.pos, para.pos));
    }
  }
}
