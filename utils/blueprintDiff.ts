/**
 * RF-124 — comparar snapshots e emitir alterações SEMÂNTICAS.
 *
 * ─── DUAS IDENTIDADES, NESTA ORDEM ──────────────────────────────────────────
 *
 * 1. **`uid`** (desde 04/09/2026). Cada elemento tem identidade persistente que
 *    sobrevive ao publish — ver `identity.ts`. Quando os DOIS lados têm o mesmo
 *    uid, é a mesma peça, e mover uma parede vira "Parede P-1A2B movida" em vez
 *    de "removida + adicionada".
 *
 * 2. **Geometria** (fallback). Snapshot gravado antes da identidade existir tem
 *    uids DERIVADOS do próprio hash — diferentes entre duas revisões por
 *    construção —, e um snapshot novo comparado com um antigo não casa uid
 *    nenhum. Para esses (e para o que sobrar do passo 1), a parede é o par de
 *    pontas, a abertura é parede+posição+vão, a estrutura é tipo+posição, o
 *    ambiente é o anel.
 *
 * O `id` (`wal_0003`) NÃO serve em nenhum dos dois: é reatribuído por posição em
 * `modelFromCanonicalPayload`, então basta apagar a primeira parede para que o
 * `wal_0003` de uma versão seja outra parede na seguinte.
 *
 * ─── SEMÂNTICO, NÃO TEXTUAL ─────────────────────────────────────────────────
 *
 * "3 linhas mudaram no JSON" não ajuda ninguém a decidir se aprova a revisão.
 * "Parede de 4,00 m removida; Cozinha passou de 10,97 para 12,50 m²" ajuda. Por
 * isso o resultado sai em frases, com o número que muda a decisão junto.
 */

import type { Agua, BlueprintModel, Corte, Escada, Opening, Space, Structural, Wall } from './blueprintKernel';
import {
  assinaturaDasCamadas,
  medirAgua,
  medirEscada,
  medirEstrutura,
  nomeDoTipoDeAbertura,
  nomeDoTipoEstrutural,
  rotuloCurto,
  wallLength,
} from './blueprintKernel';

export type TipoAlteracao =
  | 'PAREDE_ADICIONADA'
  | 'PAREDE_REMOVIDA'
  | 'PAREDE_MOVIDA'
  | 'PAREDE_ESPESSURA'
  | 'PAREDE_CAMADAS'
  | 'ABERTURA_ADICIONADA'
  | 'ABERTURA_REMOVIDA'
  | 'ABERTURA_MOVIDA'
  | 'ABERTURA_ALTERADA'
  | 'ABERTURA_TIPO'
  | 'ESTRUTURA_ADICIONADA'
  | 'ESTRUTURA_REMOVIDA'
  | 'ESTRUTURA_MOVIDA'
  | 'ESTRUTURA_SECAO'
  | 'TELHADO_ADICIONADO'
  | 'TELHADO_REMOVIDO'
  | 'TELHADO_MOVIDO'
  | 'TELHADO_INCLINACAO'
  | 'CORTE_ADICIONADO'
  | 'CORTE_REMOVIDO'
  | 'CORTE_MOVIDO'
  | 'CORTE_LADO'
  | 'ESCADA_ADICIONADA'
  | 'ESCADA_REMOVIDA'
  | 'ESCADA_MOVIDA'
  | 'ESCADA_ALTERADA'
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
  /** uid da peça, quando a alteração é sobre UMA peça identificável. */
  uid?: string;
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

// ─────────────────────────────────────────────────────────────────────────────
// Pareamento
// ─────────────────────────────────────────────────────────────────────────────

interface Pareamento<T> {
  /** [antes, depois] reconhecidos como a mesma peça (por uid ou por geometria). */
  pares: [T, T][];
  soAntes: T[];
  soDepois: T[];
}

/**
 * Casa os elementos de duas versões: primeiro por uid, depois pela chave
 * geométrica. A chave é uma FUNÇÃO POR LADO porque a da abertura depende da
 * parede hospedeira daquele modelo.
 *
 * As sobras geométricas usam LISTA por chave, não `Map` de um só: duas paredes
 * idênticas sobrepostas são duas peças, e um `Map` engoliria uma delas —
 * reportando "removida" para uma parede que continua lá.
 */
function parear<T extends { uid?: string }>(
  antes: T[],
  depois: T[],
  chaveAntes: (t: T) => string,
  chaveDepois: (t: T) => string = chaveAntes,
): Pareamento<T> {
  const pares: [T, T][] = [];
  const usadosAntes = new Set<T>();
  const restoDepois: T[] = [];

  const porUid = new Map<string, T>();
  for (const a of antes) if (a.uid) porUid.set(a.uid, a);

  for (const d of depois) {
    const a = d.uid ? porUid.get(d.uid) : undefined;
    if (a && !usadosAntes.has(a)) {
      pares.push([a, d]);
      usadosAntes.add(a);
    } else {
      restoDepois.push(d);
    }
  }

  const porChave = new Map<string, T[]>();
  for (const a of antes) {
    if (usadosAntes.has(a)) continue;
    const k = chaveAntes(a);
    porChave.set(k, [...(porChave.get(k) ?? []), a]);
  }

  const soDepois: T[] = [];
  for (const d of restoDepois) {
    const fila = porChave.get(chaveDepois(d));
    const a = fila?.shift();
    if (a) {
      pares.push([a, d]);
      usadosAntes.add(a);
    } else {
      soDepois.push(d);
    }
  }

  const soAntes = antes.filter((a) => !usadosAntes.has(a));
  return { pares, soAntes, soDepois };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chaves geométricas (o fallback)
// ─────────────────────────────────────────────────────────────────────────────

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

/** Chave da água: o contorno em planta, sem inclinação — como a estrutura ignora a seção. */
function chaveAgua(r: Agua): string {
  return r.pontos.map((p) => `${p.x},${p.y}`).join(';');
}

/** Chave do corte: as duas pontas. Inverter o lado NÃO muda a chave. */
function chaveCorte(c: Corte): string {
  return `${c.a.x},${c.a.y};${c.b.x},${c.b.y}`;
}

/** Chave da escada: o eixo. Largura e alvo NÃO entram — mudam sem mover. */
function chaveEscada(e: Escada): string {
  return e.pontos.map((p) => `${p.x},${p.y}`).join(';');
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

/** "P-1A2B" quando a peça tem uid; vazio quando não (modelo de teste). */
function rotulo(uid: string | undefined, familia: Parameters<typeof rotuloCurto>[1]): string {
  return uid ? ` ${rotuloCurto(uid, familia)}` : '';
}

// ─────────────────────────────────────────────────────────────────────────────

export function diffSnapshots(antes: BlueprintModel, depois: BlueprintModel): DiffSnapshots {
  const alteracoes: Alteracao[] = [];

  // ── Paredes ───────────────────────────────────────────────────────────────
  const paredes = parear(antes.walls, depois.walls, chaveParede);
  const faceM2 = (w: Wall) => (wallLength(w) * w.heightMm) / M2;

  for (const w of paredes.soDepois) {
    alteracoes.push({
      tipo: 'PAREDE_ADICIONADA',
      descricao: `Parede de ${metros(wallLength(w))} m adicionada`,
      pesoM2: faceM2(w),
      uid: w.uid,
    });
  }
  for (const w of paredes.soAntes) {
    alteracoes.push({
      tipo: 'PAREDE_REMOVIDA',
      descricao: `Parede de ${metros(wallLength(w))} m removida`,
      pesoM2: faceM2(w),
      uid: w.uid,
    });
  }
  for (const [wAntes, wDepois] of paredes.pares) {
    // Só um par POR UID pode ter geometria diferente — o par geométrico é, por
    // definição, a mesma chave.
    if (chaveParede(wAntes) !== chaveParede(wDepois)) {
      const lA = wallLength(wAntes);
      const lD = wallLength(wDepois);
      alteracoes.push({
        tipo: 'PAREDE_MOVIDA',
        descricao:
          lA === lD
            ? `Parede${rotulo(wDepois.uid, 'wall')} de ${metros(lD)} m movida`
            : `Parede${rotulo(wDepois.uid, 'wall')} movida: ${metros(lA)} → ${metros(lD)} m`,
        pesoM2: faceM2(wDepois),
        uid: wDepois.uid,
      });
    }

    if (wAntes.thicknessMm !== wDepois.thicknessMm) {
      alteracoes.push({
        tipo: 'PAREDE_ESPESSURA',
        descricao:
          `Parede de ${metros(wallLength(wDepois))} m: espessura ` +
          `${wAntes.thicknessMm} → ${wDepois.thicknessMm} mm`,
        // Mudança de espessura mexe no volume e na área de piso, não na face.
        pesoM2:
          (wallLength(wDepois) * Math.abs(wAntes.thicknessMm - wDepois.thicknessMm)) / M2,
        uid: wDepois.uid,
      });
    }

    // A COMPOSIÇÃO, à parte da espessura. Sem esta passagem, trocar 190 mm de
    // bloco por 190 mm de concreto não apareceria em revisão nenhuma: a
    // espessura não mudou, a geometria não mudou, e o que mudou foi o material —
    // que é o que decide o preço. Comparada pela ASSINATURA, que ignora a
    // descrição: recadastro no catálogo com outra grafia não é alteração de
    // projeto.
    if (assinaturaDasCamadas(wAntes.camadas) !== assinaturaDasCamadas(wDepois.camadas)) {
      const descreve = (w: Wall) =>
        w.camadas?.length ? `${w.camadas.length} camada(s)` : 'sem camadas';
      alteracoes.push({
        tipo: 'PAREDE_CAMADAS',
        descricao:
          `Parede de ${metros(wallLength(wDepois))} m: composição ` +
          `${descreve(wAntes)} → ${descreve(wDepois)}`,
        // Peso pela face: o que mudou foi o material que reveste e preenche a
        // parede inteira, não uma fatia dela.
        pesoM2: faceM2(wDepois),
        uid: wDepois.uid,
      });
    }
  }

  // ── Aberturas ─────────────────────────────────────────────────────────────
  const idsAntes = new Map(antes.walls.map((w) => [w.id, w]));
  const idsDepois = new Map(depois.walls.map((w) => [w.id, w]));
  const aberturas = parear(
    antes.openings,
    depois.openings,
    (o) => chaveAbertura(o, idsAntes),
    (o) => chaveAbertura(o, idsDepois),
  );

  const nomeAbertura = (o: Opening) =>
    `${nomeDoTipoDeAbertura(o.kind)} de ${metros(o.widthMm)} m`;
  const vaoM2 = (o: Opening) => (o.widthMm * o.heightMm) / M2;

  for (const o of aberturas.soDepois) {
    alteracoes.push({
      tipo: 'ABERTURA_ADICIONADA',
      descricao: `${nomeAbertura(o)} adicionada`,
      pesoM2: vaoM2(o),
      uid: o.uid,
    });
  }
  for (const o of aberturas.soAntes) {
    alteracoes.push({
      tipo: 'ABERTURA_REMOVIDA',
      descricao: `${nomeAbertura(o)} removida`,
      pesoM2: vaoM2(o),
      uid: o.uid,
    });
  }
  for (const [oAntes, oDepois] of aberturas.pares) {
    const hA = idsAntes.get(oAntes.wallId);
    const hD = idsDepois.get(oDepois.wallId);
    // A hospedeira "mudou" se é OUTRA parede — pelo uid quando os dois têm,
    // pela geometria quando não. Parede que se moveu levando a porta junto não
    // conta como porta movida: a porta continua no mesmo lugar DA PAREDE, e a
    // parede já foi reportada.
    const outraHospedeira =
      hA && hD
        ? hA.uid && hD.uid
          ? hA.uid !== hD.uid
          : chaveParede(hA) !== chaveParede(hD)
        : false;
    const moveu = outraHospedeira || oAntes.offsetMm !== oDepois.offsetMm;
    const mudouMedida =
      oAntes.kind !== oDepois.kind ||
      oAntes.widthMm !== oDepois.widthMm ||
      oAntes.heightMm !== oDepois.heightMm ||
      oAntes.sillMm !== oDepois.sillMm;

    if (moveu) {
      alteracoes.push({
        tipo: 'ABERTURA_MOVIDA',
        descricao: `${nomeAbertura(oDepois)}${rotulo(oDepois.uid, 'opening')} movida${
          outraHospedeira ? ' para outra parede' : ''
        }`,
        pesoM2: vaoM2(oDepois),
        uid: oDepois.uid,
      });
    }
    if (mudouMedida) {
      alteracoes.push({
        tipo: 'ABERTURA_ALTERADA',
        descricao:
          `${nomeDoTipoDeAbertura(oAntes.kind)}${rotulo(oDepois.uid, 'opening')}: ` +
          `${metros(oAntes.widthMm)}×${metros(oAntes.heightMm)} → ` +
          `${metros(oDepois.widthMm)}×${metros(oDepois.heightMm)} m` +
          (oAntes.kind !== oDepois.kind ? ` (${nomeDoTipoDeAbertura(oDepois.kind)})` : ''),
        pesoM2: Math.abs(vaoM2(oDepois) - vaoM2(oAntes)),
        uid: oDepois.uid,
      });
    }
    // O TIPO é frase própria: trocar P1 por P2 sem mexer na medida muda o que
    // se compra, e "alterada" com as mesmas medidas não diria o quê. `descricao`
    // fica fora da comparação — é cache de rótulo.
    const tA = oAntes.esquadria;
    const tD = oDepois.esquadria;
    const mudouTipo =
      (tA?.nome ?? '') !== (tD?.nome ?? '') || (tA?.itemCode ?? '') !== (tD?.itemCode ?? '');
    if (mudouTipo) {
      const rot = (t: typeof tA) => (t ? `${t.nome}${t.itemCode ? ` (${t.itemCode})` : ''}` : 'sem tipo');
      alteracoes.push({
        tipo: 'ABERTURA_TIPO',
        descricao: `${nomeDoTipoDeAbertura(oDepois.kind)}${rotulo(oDepois.uid, 'opening')}: tipo ${rot(tA)} → ${rot(tD)}`,
        // Peso pelo vão: o que mudou foi o que se compra para ele inteiro.
        pesoM2: vaoM2(oDepois),
        uid: oDepois.uid,
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
  const estruturas = parear(antes.structures ?? [], depois.structures ?? [], chaveEstrutura);

  const nomeEstrutura = (s: Structural) =>
    `${s.rotulo ? `${s.rotulo} · ` : ''}${nomeDoTipoEstrutural(s.kind)} ${secaoLegivel(s)}`;

  // A MESMA fórmula do quantitativo, importada e não recopiada: uma segunda
  // conta de fôrma aqui divergiria da primeira no dia em que uma das duas fosse
  // corrigida, e a lista de alterações passaria a ordenar por um número que
  // nenhuma outra tela reconhece.
  const pesoDaEstrutura = (s: Structural) => medirEstrutura(s).areaFormaMm2 / M2;

  for (const s of estruturas.soDepois) {
    alteracoes.push({
      tipo: 'ESTRUTURA_ADICIONADA',
      descricao: `${nomeEstrutura(s)} adicionada`,
      pesoM2: pesoDaEstrutura(s),
      uid: s.uid,
    });
  }
  for (const s of estruturas.soAntes) {
    alteracoes.push({
      tipo: 'ESTRUTURA_REMOVIDA',
      descricao: `${nomeEstrutura(s)} removida`,
      pesoM2: pesoDaEstrutura(s),
      uid: s.uid,
    });
  }
  for (const [sAntes, sDepois] of estruturas.pares) {
    if (chaveEstrutura(sAntes) !== chaveEstrutura(sDepois)) {
      alteracoes.push({
        tipo: 'ESTRUTURA_MOVIDA',
        descricao: `${nomeEstrutura(sDepois)}${rotulo(sDepois.uid, 'structural')} movida`,
        pesoM2: pesoDaEstrutura(sDepois),
        uid: sDepois.uid,
      });
    }
    const mudou =
      sAntes.kind !== sDepois.kind ||
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
      uid: sDepois.uid,
    });
  }

  // ── Telhado ───────────────────────────────────────────────────────────────
  //
  // `pesoM2` é a ÁREA REAL: é o que move o orçamento de telha, e é comparável
  // com a face de parede e a fôrma, que também pesam por área.
  const telhados = parear(antes.roofs ?? [], depois.roofs ?? [], chaveAgua);
  const pesoDaAgua = (r: Agua) => medirAgua(r).areaRealM2;
  const nomeAgua = (r: Agua) => `Água${rotulo(r.uid, 'roof')} de ${m2(medirAgua(r).areaRealM2 * M2)} m²`;

  for (const r of telhados.soDepois) {
    alteracoes.push({ tipo: 'TELHADO_ADICIONADO', descricao: `${nomeAgua(r)} adicionada (${r.inclinacaoPct}%)`, pesoM2: pesoDaAgua(r), uid: r.uid });
  }
  for (const r of telhados.soAntes) {
    alteracoes.push({ tipo: 'TELHADO_REMOVIDO', descricao: `${nomeAgua(r)} removida`, pesoM2: pesoDaAgua(r), uid: r.uid });
  }
  for (const [rAntes, rDepois] of telhados.pares) {
    if (chaveAgua(rAntes) !== chaveAgua(rDepois)) {
      alteracoes.push({ tipo: 'TELHADO_MOVIDO', descricao: `${nomeAgua(rDepois)} movida`, pesoM2: pesoDaAgua(rDepois), uid: rDepois.uid });
    }
    const mudou =
      rAntes.inclinacaoPct !== rDepois.inclinacaoPct ||
      rAntes.baseMm !== rDepois.baseMm ||
      rAntes.beiralIndex !== rDepois.beiralIndex;
    if (mudou) {
      const partes: string[] = [];
      if (rAntes.inclinacaoPct !== rDepois.inclinacaoPct) partes.push(`inclinação ${rAntes.inclinacaoPct}% → ${rDepois.inclinacaoPct}%`);
      if (rAntes.baseMm !== rDepois.baseMm) partes.push(`beiral a ${metros(rAntes.baseMm)} → ${metros(rDepois.baseMm)} m`);
      if (rAntes.beiralIndex !== rDepois.beiralIndex) partes.push(`beiral no lado ${rAntes.beiralIndex + 1} → ${rDepois.beiralIndex + 1}`);
      alteracoes.push({
        tipo: 'TELHADO_INCLINACAO',
        descricao: `Água${rotulo(rDepois.uid, 'roof')}: ${partes.join(', ')}`,
        // Mudar a inclinação muda a área real: o peso é a diferença.
        pesoM2: Math.abs(pesoDaAgua(rDepois) - pesoDaAgua(rAntes)),
        uid: rDepois.uid,
      });
    }
  }

  // ── Cortes ────────────────────────────────────────────────────────────────
  //
  // `pesoM2` é ZERO em todas as frases, e isso é uma afirmação, não uma omissão:
  // mover uma linha de corte não muda um metro quadrado de nada. Ela é um
  // DESENHO, não construção. Com peso, a mudança de corte subiria na ordenação
  // por relevância e empurraria para baixo a parede que de fato mudou o
  // orçamento — que é exatamente o que a ordenação existe para evitar.
  //
  // Ainda assim as frases entram na lista: quem compara duas versões precisa
  // saber que o corte AA saiu de lugar, senão abre a prancha e vê outro desenho
  // sem explicação.
  const cortes = parear(antes.sections ?? [], depois.sections ?? [], chaveCorte);
  const nomeCorte = (c: Corte) => `Corte ${c.rotulo}`;

  for (const c of cortes.soDepois) {
    alteracoes.push({ tipo: 'CORTE_ADICIONADO', descricao: `${nomeCorte(c)} adicionado`, pesoM2: 0, uid: c.uid });
  }
  for (const c of cortes.soAntes) {
    alteracoes.push({ tipo: 'CORTE_REMOVIDO', descricao: `${nomeCorte(c)} removido`, pesoM2: 0, uid: c.uid });
  }
  for (const [cAntes, cDepois] of cortes.pares) {
    if (chaveCorte(cAntes) !== chaveCorte(cDepois)) {
      alteracoes.push({ tipo: 'CORTE_MOVIDO', descricao: `${nomeCorte(cDepois)} movido`, pesoM2: 0, uid: cDepois.uid });
    }
    // O LADO é frase própria, e não parte de "movido": a linha ficou onde
    // estava e o desenho inteiro mudou. Dizer "movido" mandaria procurar a
    // linha no lugar errado.
    if (cAntes.olharPara !== cDepois.olharPara) {
      alteracoes.push({
        tipo: 'CORTE_LADO',
        descricao: `${nomeCorte(cDepois)} invertido: passa a olhar para a ${cDepois.olharPara === 'ESQUERDA' ? 'esquerda' : 'direita'}`,
        pesoM2: 0,
        uid: cDepois.uid,
      });
    }
    if (cAntes.rotulo !== cDepois.rotulo) {
      alteracoes.push({
        tipo: 'CORTE_MOVIDO',
        descricao: `Corte ${cAntes.rotulo} renomeado para ${cDepois.rotulo}`,
        pesoM2: 0,
        uid: cDepois.uid,
      });
    }
  }

  // ── Escadas e rampas ──────────────────────────────────────────────────────
  //
  // `pesoM2` é a área da PEGADA: é o que ela tira do piso e o que entra no
  // quantitativo de degraus e de acabamento. Comparável com a face de parede
  // e a fôrma, que também pesam por área.
  const escadas = parear(antes.stairs ?? [], depois.stairs ?? [], chaveEscada);
  const medE = (m: BlueprintModel, e: Escada) => medirEscada(m, e);
  const nomeEscada = (m: BlueprintModel, e: Escada) => {
    const med = medE(m, e);
    const base = e.tipo === 'RAMPA' ? 'Rampa' : 'Escada';
    return `${base}${e.rotulo ? ` ${e.rotulo}` : rotulo(e.uid, 'stair')}${
      e.tipo === 'RAMPA'
        ? ` de ${med.inclinacaoPct.toFixed(1).replace('.', ',')}%`
        : ` de ${med.degraus} degraus`
    }`;
  };

  for (const e of escadas.soDepois) {
    alteracoes.push({
      tipo: 'ESCADA_ADICIONADA',
      descricao: `${nomeEscada(depois, e)} adicionada`,
      pesoM2: medE(depois, e).areaPlantaMm2 / M2,
      uid: e.uid,
    });
  }
  for (const e of escadas.soAntes) {
    alteracoes.push({
      tipo: 'ESCADA_REMOVIDA',
      descricao: `${nomeEscada(antes, e)} removida`,
      pesoM2: medE(antes, e).areaPlantaMm2 / M2,
      uid: e.uid,
    });
  }
  for (const [eAntes, eDepois] of escadas.pares) {
    if (chaveEscada(eAntes) !== chaveEscada(eDepois)) {
      alteracoes.push({
        tipo: 'ESCADA_MOVIDA',
        descricao: `${nomeEscada(depois, eDepois)} movida`,
        pesoM2: medE(depois, eDepois).areaPlantaMm2 / M2,
        uid: eDepois.uid,
      });
    }
    const a = medE(antes, eAntes);
    const d = medE(depois, eDepois);
    // O NÚMERO DE DEGRAUS entra na comparação mesmo não sendo campo: ele muda
    // quando a cota de um pavimento muda, e essa é exatamente a mudança que
    // quem compara versões precisa ver — "a escada ganhou dois degraus" é a
    // frase que explica por que o desenho mudou sem ninguém tê-la tocado.
    const partes: string[] = [];
    if (eAntes.tipo !== eDepois.tipo) partes.push(`virou ${eDepois.tipo === 'RAMPA' ? 'rampa' : 'escada'}`);
    if (eAntes.larguraMm !== eDepois.larguraMm) partes.push(`largura ${metros(eAntes.larguraMm)} → ${metros(eDepois.larguraMm)} m`);
    if (a.degraus !== d.degraus) partes.push(`${a.degraus} → ${d.degraus} degraus`);
    else if (eAntes.alvoEspelhoMm !== eDepois.alvoEspelhoMm) partes.push(`espelho alvo ${eAntes.alvoEspelhoMm} → ${eDepois.alvoEspelhoMm} mm`);
    if (a.desnivelMm !== d.desnivelMm) partes.push(`desnível ${metros(a.desnivelMm)} → ${metros(d.desnivelMm)} m`);
    if (partes.length > 0) {
      alteracoes.push({
        tipo: 'ESCADA_ALTERADA',
        descricao: `${nomeEscada(depois, eDepois)}: ${partes.join(', ')}`,
        pesoM2: Math.abs(d.areaPlantaMm2 - a.areaPlantaMm2) / M2,
        uid: eDepois.uid,
      });
    }
  }

  // ── Ambientes ─────────────────────────────────────────────────────────────
  //
  // Ambiente é derivado e a identidade dele é a da ETIQUETA (`labelUid`). Um
  // ambiente nomeado que muda de contorno casa por uid e vira UMA frase de área;
  // sem etiqueta, casa pelo anel (igual → mesmo ambiente) e, no que sobrar, pelo
  // nome — o caminho de antes da identidade, que continua valendo para
  // snapshot antigo.
  const comUid = (s: Space) => ({ ...s, uid: s.labelUid });
  const ambientes = parear(antes.spaces.map(comUid), depois.spaces.map(comUid), chaveAmbiente);

  for (const [sAntes, sDepois] of ambientes.pares) {
    if (sAntes.name !== sDepois.name) {
      alteracoes.push({
        tipo: 'AMBIENTE_RENOMEADO',
        descricao: `Ambiente "${sAntes.name ?? 'sem nome'}" renomeado para "${sDepois.name ?? 'sem nome'}"`,
        // Renomear não move quantidade — mas move o de-para, quando há filtro
        // por nome. Peso zero mantém a ordenação honesta.
        pesoM2: 0,
        uid: sDepois.labelUid,
      });
    }
    if (chaveAmbiente(sAntes) !== chaveAmbiente(sDepois) && sAntes.areaMm2 !== sDepois.areaMm2) {
      alteracoes.push(fraseDeArea(sAntes, sDepois));
    }
  }

  // O que sobrou sem uid nem anel igual: parear por NOME antes de declarar
  // removido/adicionado — ambiente cujo contorno mudou apareceria como um
  // removido e um adicionado, o que é fiel (o polígono é outro), mas a
  // comparação de área junta os dois numa frase só quando o nome é o mesmo.
  const removidos = ambientes.soAntes;
  const adicionados = ambientes.soDepois;
  const usados = new Set<Space>();
  for (const antigo of removidos) {
    const par = adicionados.find(
      (novo) => !usados.has(novo) && antigo.name && novo.name === antigo.name,
    );
    if (!par) continue;
    usados.add(par);
    usados.add(antigo);
    alteracoes.push(fraseDeArea(antigo, par));
  }

  for (const s of removidos) {
    if (usados.has(s)) continue;
    alteracoes.push({
      tipo: 'AMBIENTE_REMOVIDO',
      descricao: `Ambiente ${s.name ? `"${s.name}" ` : ''}de ${m2(s.areaMm2)} m² deixou de existir`,
      pesoM2: s.areaMm2 / M2,
      uid: s.labelUid,
    });
  }
  for (const s of adicionados) {
    if (usados.has(s)) continue;
    alteracoes.push({
      tipo: 'AMBIENTE_ADICIONADO',
      descricao: `Ambiente ${s.name ? `"${s.name}" ` : ''}de ${m2(s.areaMm2)} m² apareceu`,
      pesoM2: s.areaMm2 / M2,
      uid: s.labelUid,
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

function fraseDeArea(antigo: Space, novo: Space): Alteracao {
  const delta = novo.areaMm2 - antigo.areaMm2;
  const pct = antigo.areaMm2 > 0 ? (delta / antigo.areaMm2) * 100 : 0;
  const nome = novo.name ?? antigo.name ?? 'Ambiente';
  return {
    tipo: 'AMBIENTE_AREA',
    descricao:
      `${nome}: ${m2(antigo.areaMm2)} → ${m2(novo.areaMm2)} m² ` +
      `(${delta >= 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%)`,
    pesoM2: Math.abs(delta) / M2,
    uid: novo.labelUid,
  };
}
