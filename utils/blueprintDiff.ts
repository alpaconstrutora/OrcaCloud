/**
 * RF-124 — comparar snapshots e emitir alterações SEMÂNTICAS.
 *
 * ─── ID NÃO SERVE PARA COMPARAR SNAPSHOT ────────────────────────────────────
 *
 * Cada snapshot é reconstruído por `modelFromCanonicalPayload`, que REATRIBUI os
 * ids pelo contador determinístico na ordem canônica. `wal_0003` na versão 2 e
 * `wal_0003` na versão 3 não são a mesma parede — são a terceira parede de cada
 * lista, e basta apagar a primeira para que passem a ser paredes diferentes.
 *
 * Um diff por id, então, não erra de vez em quando: erra sempre que alguma coisa
 * é apagada, e do jeito pior — reportando "parede alterada" onde houve remoção e
 * inserção. Aqui a identidade é GEOMÉTRICA: a parede é o par de pontas.
 *
 * ─── SEMÂNTICO, NÃO TEXTUAL ─────────────────────────────────────────────────
 *
 * "3 linhas mudaram no JSON" não ajuda ninguém a decidir se aprova a revisão.
 * "Parede de 4,00 m removida; Cozinha passou de 10,97 para 12,50 m²" ajuda. Por
 * isso o resultado sai em frases, com o número que muda a decisão junto.
 */

import type { BlueprintModel, Opening, Space, Structural, Wall } from './blueprintKernel';
import {
  medirEstrutura,
  nomeDoTipoDeAbertura,
  nomeDoTipoEstrutural,
  wallLength,
} from './blueprintKernel';

export type TipoAlteracao =
  | 'PAREDE_ADICIONADA'
  | 'PAREDE_REMOVIDA'
  | 'PAREDE_ESPESSURA'
  | 'ABERTURA_ADICIONADA'
  | 'ABERTURA_REMOVIDA'
  | 'ESTRUTURA_ADICIONADA'
  | 'ESTRUTURA_REMOVIDA'
  | 'ESTRUTURA_SECAO'
  | 'AMBIENTE_ADICIONADO'
  | 'AMBIENTE_REMOVIDO'
  | 'AMBIENTE_AREA'
  | 'AMBIENTE_RENOMEADO';

export interface Alteracao {
  tipo: TipoAlteracao;
  /** Frase pronta para leitura, com o número que importa. */
  descricao: string;
  /** Para ordenar por relevância: quanto essa mudança move o quantitativo. */
  pesoM2: number;
}

export interface DiffSnapshots {
  alteracoes: Alteracao[];
  resumo: {
    paredesAntes: number;
    paredesDepois: number;
    ambientesAntes: number;
    ambientesDepois: number;
    areaPisoAntesM2: number;
    areaPisoDepoisM2: number;
    /** Diferença de área de EIXO, que é a que o `Space` carrega. */
    deltaAreaM2: number;
  };
  /** `true` quando nada mudou — publicar de novo seria idempotente. */
  identicos: boolean;
}

/** Chave geométrica da parede, indiferente ao sentido em que foi desenhada. */
function chaveParede(w: Wall): string {
  const [p, q] =
    w.a.x < w.b.x || (w.a.x === w.b.x && w.a.y <= w.b.y) ? [w.a, w.b] : [w.b, w.a];
  return `${p.x},${p.y}|${q.x},${q.y}`;
}

/**
 * Chave da abertura: parede hospedeira + posição + vão.
 *
 * Inclui a parede porque duas portas de mesma medida em paredes diferentes não
 * são a mesma porta — e sem isso mover uma porta de parede não apareceria.
 */
function chaveAbertura(o: Opening, paredePorId: Map<string, Wall>): string {
  const w = paredePorId.get(o.wallId);
  return `${w ? chaveParede(w) : '?'}|${o.kind}|${o.offsetMm}|${o.widthMm}`;
}

/**
 * Chave da estrutura: tipo + posição, SEM a seção.
 *
 * A seção fica de fora de propósito. Com ela dentro, engrossar um pilar de 20×40
 * para 25×40 apareceria como "pilar removido" + "pilar adicionado", quando é a
 * MESMA peça com outra medida — e a frase que interessa ("P1: 20×40 → 25×40") só
 * existe se as duas versões se reconhecerem primeiro. É a mesma decisão que faz
 * `chaveParede` ignorar a espessura.
 */
function chaveEstrutura(s: Structural): string {
  return `${s.kind}|${s.pontos.map((p) => `${p.x},${p.y}`).join(';')}`;
}

/** Como a seção aparece na frase: "20×40 cm", "⌀30 cm", "e=12 cm". */
function secaoLegivel(s: Structural): string {
  if (s.kind === 'LAJE') return `e=${(s.alturaMm / 10).toFixed(0)} cm`;
  if (s.circular) return `⌀${(s.larguraMm / 10).toFixed(0)} cm`;
  const segunda = s.kind === 'VIGA' || s.kind === 'VIGA_FUNDACAO' ? s.alturaMm : s.profundidadeMm;
  return `${(s.larguraMm / 10).toFixed(0)}×${(segunda / 10).toFixed(0)} cm`;
}

/** Chave do ambiente: o anel, normalizado para começar no vértice menor. */
function chaveAmbiente(s: Space): string {
  if (s.ring.length === 0) return '';
  let melhor = 0;
  for (let i = 1; i < s.ring.length; i++) {
    const a = s.ring[i];
    const b = s.ring[melhor];
    if (a.x < b.x || (a.x === b.x && a.y < b.y)) melhor = i;
  }
  return s.ring
    .slice(melhor)
    .concat(s.ring.slice(0, melhor))
    .map((p) => `${p.x},${p.y}`)
    .join(';');
}

const M2 = 1_000_000;

function metros(mm: number): string {
  return (mm / 1000).toFixed(2).replace('.', ',');
}

function m2(mm2: number): string {
  return (mm2 / M2).toFixed(2).replace('.', ',');
}

export function diffSnapshots(antes: BlueprintModel, depois: BlueprintModel): DiffSnapshots {
  const alteracoes: Alteracao[] = [];

  // ── Paredes ───────────────────────────────────────────────────────────────
  const paredesAntes = new Map(antes.walls.map((w) => [chaveParede(w), w]));
  const paredesDepois = new Map(depois.walls.map((w) => [chaveParede(w), w]));

  for (const [chave, w] of paredesDepois) {
    if (!paredesAntes.has(chave)) {
      alteracoes.push({
        tipo: 'PAREDE_ADICIONADA',
        descricao: `Parede de ${metros(wallLength(w))} m adicionada`,
        pesoM2: (wallLength(w) * w.heightMm) / M2,
      });
    }
  }
  for (const [chave, w] of paredesAntes) {
    if (!paredesDepois.has(chave)) {
      alteracoes.push({
        tipo: 'PAREDE_REMOVIDA',
        descricao: `Parede de ${metros(wallLength(w))} m removida`,
        pesoM2: (wallLength(w) * w.heightMm) / M2,
      });
    }
  }
  for (const [chave, wDepois] of paredesDepois) {
    const wAntes = paredesAntes.get(chave);
    if (!wAntes || wAntes.thicknessMm === wDepois.thicknessMm) continue;
    alteracoes.push({
      tipo: 'PAREDE_ESPESSURA',
      descricao:
        `Parede de ${metros(wallLength(wDepois))} m: espessura ` +
        `${wAntes.thicknessMm} → ${wDepois.thicknessMm} mm`,
      // Mudança de espessura mexe no volume e na área de piso, não na face.
      pesoM2: (wallLength(wDepois) * Math.abs(wAntes.thicknessMm - wDepois.thicknessMm)) / M2,
    });
  }

  // ── Aberturas ─────────────────────────────────────────────────────────────
  const idsAntes = new Map(antes.walls.map((w) => [w.id, w]));
  const idsDepois = new Map(depois.walls.map((w) => [w.id, w]));
  const abAntes = new Map(antes.openings.map((o) => [chaveAbertura(o, idsAntes), o]));
  const abDepois = new Map(depois.openings.map((o) => [chaveAbertura(o, idsDepois), o]));

  const nomeAbertura = (o: Opening) =>
    `${nomeDoTipoDeAbertura(o.kind)} de ${metros(o.widthMm)} m`;

  for (const [chave, o] of abDepois) {
    if (!abAntes.has(chave)) {
      alteracoes.push({
        tipo: 'ABERTURA_ADICIONADA',
        descricao: `${nomeAbertura(o)} adicionada`,
        pesoM2: (o.widthMm * o.heightMm) / M2,
      });
    }
  }
  for (const [chave, o] of abAntes) {
    if (!abDepois.has(chave)) {
      alteracoes.push({
        tipo: 'ABERTURA_REMOVIDA',
        descricao: `${nomeAbertura(o)} removida`,
        pesoM2: (o.widthMm * o.heightMm) / M2,
      });
    }
  }

  // ── Estrutura ─────────────────────────────────────────────────────────────
  //
  // Sem este bloco, publicar uma versão que só acrescentou pilares diria "nada
  // mudou" na aba Versões — e diria isso depois de o hash TER mudado, o que é
  // pior do que não comparar: uma tela afirmando que duas versões diferentes
  // são iguais.
  //
  // `pesoM2` aqui é a área de FÔRMA, não a área de piso. É a grandeza da peça
  // que mais se aproxima de "quanto isto move o orçamento", e mantém a ordenação
  // comparável com paredes e aberturas, que também pesam por área.
  const estAntes = new Map((antes.structures ?? []).map((s) => [chaveEstrutura(s), s]));
  const estDepois = new Map((depois.structures ?? []).map((s) => [chaveEstrutura(s), s]));

  const nomeEstrutura = (s: Structural) =>
    `${s.rotulo ? `${s.rotulo} · ` : ''}${nomeDoTipoEstrutural(s.kind)} ${secaoLegivel(s)}`;

  // A MESMA fórmula do quantitativo, importada e não recopiada: uma segunda
  // conta de fôrma aqui divergiria da primeira no dia em que uma das duas fosse
  // corrigida, e a lista de alterações passaria a ordenar por um número que
  // nenhuma outra tela reconhece.
  const pesoDaEstrutura = (s: Structural) => medirEstrutura(s).areaFormaMm2 / M2;

  for (const [chave, s] of estDepois) {
    if (!estAntes.has(chave)) {
      alteracoes.push({
        tipo: 'ESTRUTURA_ADICIONADA',
        descricao: `${nomeEstrutura(s)} adicionada`,
        pesoM2: pesoDaEstrutura(s),
      });
    }
  }
  for (const [chave, s] of estAntes) {
    if (!estDepois.has(chave)) {
      alteracoes.push({
        tipo: 'ESTRUTURA_REMOVIDA',
        descricao: `${nomeEstrutura(s)} removida`,
        pesoM2: pesoDaEstrutura(s),
      });
    }
  }
  for (const [chave, sDepois] of estDepois) {
    const sAntes = estAntes.get(chave);
    if (!sAntes) continue;
    const mudou =
      sAntes.larguraMm !== sDepois.larguraMm ||
      sAntes.profundidadeMm !== sDepois.profundidadeMm ||
      sAntes.alturaMm !== sDepois.alturaMm ||
      sAntes.circular !== sDepois.circular;
    if (!mudou) continue;
    alteracoes.push({
      tipo: 'ESTRUTURA_SECAO',
      descricao:
        `${sDepois.rotulo ? `${sDepois.rotulo} · ` : ''}${nomeDoTipoEstrutural(sDepois.kind)}: ` +
        `${secaoLegivel(sAntes)} → ${secaoLegivel(sDepois)}`,
      pesoM2: Math.abs(pesoDaEstrutura(sDepois) - pesoDaEstrutura(sAntes)),
    });
  }

  // ── Ambientes ─────────────────────────────────────────────────────────────
  const ambAntes = new Map(antes.spaces.map((s) => [chaveAmbiente(s), s]));
  const ambDepois = new Map(depois.spaces.map((s) => [chaveAmbiente(s), s]));

  for (const [chave, s] of ambDepois) {
    const igual = ambAntes.get(chave);
    if (!igual) continue;
    if (igual.name !== s.name) {
      alteracoes.push({
        tipo: 'AMBIENTE_RENOMEADO',
        descricao: `Ambiente "${igual.name ?? 'sem nome'}" renomeado para "${s.name ?? 'sem nome'}"`,
        // Renomear não move quantidade — mas move o de-para, quando há filtro
        // por nome. Peso zero mantém a ordenação honesta.
        pesoM2: 0,
      });
    }
  }

  // Ambiente cujo contorno mudou aparece como um removido e um adicionado, o que
  // é fiel: o polígono é outro. O que evita ruído é a comparação de ÁREA logo
  // abaixo, que junta os dois numa frase só quando o nome é o mesmo.
  const removidos = [...ambAntes].filter(([c]) => !ambDepois.has(c)).map(([, s]) => s);
  const adicionados = [...ambDepois].filter(([c]) => !ambAntes.has(c)).map(([, s]) => s);

  const usados = new Set<Space>();
  for (const antigo of removidos) {
    const par = adicionados.find(
      (novo) => !usados.has(novo) && antigo.name && novo.name === antigo.name,
    );
    if (!par) continue;
    usados.add(par);

    const delta = par.areaMm2 - antigo.areaMm2;
    const pct = antigo.areaMm2 > 0 ? (delta / antigo.areaMm2) * 100 : 0;
    alteracoes.push({
      tipo: 'AMBIENTE_AREA',
      descricao:
        `${antigo.name}: ${m2(antigo.areaMm2)} → ${m2(par.areaMm2)} m² ` +
        `(${delta >= 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%)`,
      pesoM2: Math.abs(delta) / M2,
    });
  }

  for (const s of removidos) {
    if (adicionados.some((n) => usados.has(n) && n.name === s.name)) continue;
    alteracoes.push({
      tipo: 'AMBIENTE_REMOVIDO',
      descricao: `Ambiente ${s.name ? `"${s.name}" ` : ''}de ${m2(s.areaMm2)} m² deixou de existir`,
      pesoM2: s.areaMm2 / M2,
    });
  }
  for (const s of adicionados) {
    if (usados.has(s)) continue;
    alteracoes.push({
      tipo: 'AMBIENTE_ADICIONADO',
      descricao: `Ambiente ${s.name ? `"${s.name}" ` : ''}de ${m2(s.areaMm2)} m² apareceu`,
      pesoM2: s.areaMm2 / M2,
    });
  }

  // Mais pesado primeiro: quem revisa quer ver o que move o orçamento, não a
  // ordem em que o kernel percorreu as listas.
  alteracoes.sort((a, b) => b.pesoM2 - a.pesoM2);

  const areaAntes = antes.spaces.reduce((s, e) => s + e.areaMm2, 0) / M2;
  const areaDepois = depois.spaces.reduce((s, e) => s + e.areaMm2, 0) / M2;

  return {
    alteracoes,
    resumo: {
      paredesAntes: antes.walls.length,
      paredesDepois: depois.walls.length,
      ambientesAntes: antes.spaces.length,
      ambientesDepois: depois.spaces.length,
      areaPisoAntesM2: areaAntes,
      areaPisoDepoisM2: areaDepois,
      deltaAreaM2: areaDepois - areaAntes,
    },
    identicos: alteracoes.length === 0,
  };
}
