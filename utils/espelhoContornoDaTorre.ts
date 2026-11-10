// utils/espelhoContornoDaTorre.ts
//
// O CONTORNO DA TORRE para o Espelho de Vendas 3D (F1b, 10/11/2026). Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
//
// A forma real do prédio só existe no Bloco da Planta Inteligente, e o casamento bloco ↔ torre só existe com o editor
// aberto (`comandosDoAjuste`, sobre o modelo). Os portais não abrem o estudo: por isso o contorno é MATERIALIZADO na
// torre (`empreendimento_towers.contorno_*`) por uma ação da Planta, e daí em diante o espelho o lê de lá.
//
//  - `contornosDasTorres`: do modelo aberto para o que se grava — um contorno por torre.
//  - `contornoDaLinha`: do que o banco devolve (jsonb) para o que a cena aceita; qualquer coisa fora do formato vira
//    null, e a torre sai esquemática — nunca um erro no portal.
//  - `mesmoContorno`: o desenho mudou desde o último envio? (o botão da Planta só liga quando mudou.)
// Puro. ⚠️ Só `import type` do kernel da Planta: `contornoDaLinha` entra no pacote dos portais.

import type { Point } from './blueprintKernel';
import type { ReferenciasDaPlanta } from './blueprintUnidadesNoPavimento';
import type { ContornoDaTorre } from './espelhoDeVendas3d';

interface BlocoComContorno {
  id: string;
  pontos: readonly Point[];
}

interface PapelComTorre {
  torre: string;
  torreId?: string;
  tipo: 'TORRE' | 'GARAGEM';
}

export interface ContornoParaATorre {
  torreId: string;
  torre: string;
  contorno: Required<ContornoDaTorre>;
}

/** O contorno de cada torre: o do bloco de TORRE casado com ela (a garagem tem o mesmo contorno, e não conta). */
export function contornosDasTorres(
  blocos: readonly BlocoComContorno[],
  papeis: ReadonlyMap<string, PapelComTorre>,
  referencias: ReadonlyMap<string, ReferenciasDaPlanta>,
): ContornoParaATorre[] {
  const out: ContornoParaATorre[] = [];
  const vistas = new Set<string>();
  for (const b of blocos) {
    const papel = papeis.get(b.id);
    if (!papel || papel.tipo !== 'TORRE' || !papel.torreId || b.pontos.length < 3 || vistas.has(papel.torreId)) continue;
    vistas.add(papel.torreId);
    const ref = referencias.get(b.id);
    out.push({
      torreId: papel.torreId,
      torre: papel.torre,
      contorno: {
        anel: b.pontos.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
        frenteParaFora: ref?.frenteParaFora ?? null,
        rotacaoNorteDeg: ref?.rotacaoNorteDeg ?? null,
      },
    });
  }
  return out;
}

const ehPonto = (p: unknown): p is Point =>
  !!p && typeof p === 'object' && typeof (p as Point).x === 'number' && typeof (p as Point).y === 'number' && Number.isFinite((p as Point).x) && Number.isFinite((p as Point).y);

/** As colunas `contorno_*` de uma torre, como o banco as devolve. */
export interface LinhaComContorno {
  contorno_na_planta?: unknown;
  contorno_frente?: unknown;
  contorno_norte_deg?: unknown;
}

export function contornoDaLinha(linha: LinhaComContorno | null | undefined): Required<ContornoDaTorre> | null {
  const anel = linha?.contorno_na_planta;
  if (!Array.isArray(anel) || anel.length < 3 || !anel.every(ehPonto)) return null;
  const frente = linha?.contorno_frente;
  const norte = Number(linha?.contorno_norte_deg);
  return {
    anel: anel.map((p) => ({ x: p.x, y: p.y })),
    frenteParaFora: ehPonto(frente) ? { x: frente.x, y: frente.y } : null,
    // `numeric` do Postgres pode chegar como texto ("12.5"); nulo e lixo ficam sem norte.
    rotacaoNorteDeg: linha?.contorno_norte_deg != null && linha.contorno_norte_deg !== '' && Number.isFinite(norte) ? norte : null,
  };
}

const mesmoPonto = (a: Point | null | undefined, b: Point | null | undefined) => (!a || !b ? !a && !b : Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);

export function mesmoContorno(a: ContornoDaTorre | null | undefined, b: ContornoDaTorre | null | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.anel.length === b.anel.length &&
    a.anel.every((p, i) => mesmoPonto(p, b.anel[i])) &&
    mesmoPonto(a.frenteParaFora, b.frenteParaFora) &&
    (a.rotacaoNorteDeg ?? null) === (b.rotacaoNorteDeg ?? null)
  );
}
