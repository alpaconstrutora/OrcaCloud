/**
 * QUANTITATIVOS POR PAVIMENTO (17/09/2026: *"incluir pavimentos em
 * quantitativos"*).
 *
 * `computeQuantities` devolve as entidades sem dizer de que pavimento são —
 * o payload é por elemento, e o pavimento se lê no modelo. Aqui se faz a
 * junção: cada ambiente, parede, abertura e peça estrutural é atribuído ao
 * seu nível, e os totais por pavimento saem das MESMAS somas que os totais
 * gerais (`areaPisoM2` = soma dos ambientes, `areaParedeDuasFacesM2` = 2 ×
 * face líquida, alvenaria = soma dos volumes das paredes…), para a soma das
 * linhas fechar com a linha de total. Regra pura, sem React.
 */
import type { BlueprintModel, ConexaoDerivada, QuantidadePorBitola, QuantidadePorConexao, QuantidadePorTerminal, computeQuantities } from './blueprintKernel';
import { agruparPorBitola, agruparPorConexao, agruparPorTerminal, areaConstruidaMm2 } from './blueprintKernel';
import type { ArmaduraQuantificada } from './blueprintArmadura';

type Quant = ReturnType<typeof computeQuantities>;

export interface QuantitativoDoPavimento {
  levelId: string;
  nome: string;
  elevationMm: number;
  ambientes: number;
  areaConstruidaM2: number;
  areaPisoM2: number;
  areaParedeDuasFacesM2: number;
  volumeAlvenariaM3: number;
  comprimentoRodapeM: number;
  portas: number;
  janelas: number;
  areaAberturasM2: number;
  pecas: number;
  volumeConcretoM3: number;
  areaFormaM2: number;
  acoKg: number;
  /** INSTALAÇÕES (28/09/2026, E0.2 do roadmap hidrossanitário): tubo de água e esgoto, m. */
  tuboHidraulicoM: number;
  /** Pontos hidráulicos classificados (aparelhos, caixas, equipamentos). */
  pontosHidraulicos: number;
  /** Conexões de água e esgoto (derivadas + manuais). */
  conexoesHidraulicas: number;
}

const HIDRAULICAS = ['AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO'];

/** As linhas de compra da rede de UM pavimento — ou do projeto inteiro, com `levelId` nulo. */
export interface RedeDoPavimento {
  porBitola: QuantidadePorBitola[];
  porTerminal: QuantidadePorTerminal[];
  porConexao: QuantidadePorConexao[];
}

/**
 * O pavimento da CONEXÃO é o do trecho dela, e não o da chave do nó: o ramal
 * sob o piso do andar de cima tem o nó no teto do térreo, mas é do andar de
 * cima que se compra (mesma regra do desenho, `simbolosDasConexoes2D`).
 */
function pavimentoDaConexao(c: ConexaoDerivada, nivelDoTrecho: Map<string, string>): string {
  return (c.trechoIds.length > 0 ? nivelDoTrecho.get(c.trechoIds[0]) : undefined) ?? c.levelId;
}

/**
 * A REDE POR PAVIMENTO (28/09/2026, E0.2): tubo por DN, ponto por
 * classificação e conexão por tipo — as MESMAS funções de agrupamento do total
 * (`agruparPorBitola`…), só com o recorte do nível. Sem nível, devolve o total
 * do quantitativo, tal qual: a soma dos pavimentos fecha com ele por construção.
 */
export function redeDoPavimento(model: BlueprintModel, quant: Quant, levelId: string | null): RedeDoPavimento {
  if (!levelId) {
    return { porBitola: quant.totais.porBitola ?? [], porTerminal: quant.totais.porTerminal ?? [], porConexao: quant.totais.porConexao ?? [] };
  }
  const nivelDoTrecho = new Map((model.trechos ?? []).map((t) => [t.id, t.levelId]));
  return {
    porBitola: agruparPorBitola(quant.trechos.filter((q) => nivelDoTrecho.get(q.trechoId) === levelId)),
    porTerminal: agruparPorTerminal((model.terminais ?? []).filter((t) => t.levelId === levelId)),
    porConexao: agruparPorConexao((quant.conexoes ?? []).filter((c) => pavimentoDaConexao(c, nivelDoTrecho) === levelId)),
  };
}

/**
 * A caixa d'água é comprada pelo VOLUME: duas de 1000 L e uma de 500 L são
 * duas linhas, e não "3 caixas d'água" (E0.2 — antes contada como ponto).
 */
export function reservatoriosPorVolume(model: BlueprintModel, levelId: string | null): { volumeL: number | null; quantidade: number }[] {
  const porVolume = new Map<string, { volumeL: number | null; quantidade: number }>();
  for (const t of model.terminais ?? []) {
    if (t.tipoHidraulico !== 'RESERVATORIO' || (levelId && t.levelId !== levelId)) continue;
    const k = String(t.volumeL ?? '');
    const atual = porVolume.get(k) ?? { volumeL: t.volumeL ?? null, quantidade: 0 };
    atual.quantidade += 1;
    porVolume.set(k, atual);
  }
  return [...porVolume.values()].sort((a, b) => (b.volumeL ?? 0) - (a.volumeL ?? 0));
}

/** A família de compra de um ponto hidráulico: a caixa d'água e os equipamentos saem da lista de "pontos". */
export function familiaDoPonto(classificacao: string | null): 'Reservatório' | 'Equipamento' | 'Caixa' | 'Ponto' {
  if (classificacao === 'RESERVATORIO') return 'Reservatório';
  if (classificacao === 'AQUECEDOR' || classificacao === 'BOMBA' || classificacao === 'HIDROMETRO') return 'Equipamento';
  if (classificacao === 'CAIXA_INSPECAO' || classificacao === 'CAIXA_SIFONADA' || classificacao === 'CAIXA_GORDURA' || classificacao === 'RALO_SIFONADO') return 'Caixa';
  return 'Ponto';
}

/** Mapa id → levelId para tudo o que o quantitativo lista. Abertura herda o da parede. */
export function pavimentoDasEntidades(model: BlueprintModel): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of model.spaces) m.set(s.id, s.levelId);
  for (const w of model.walls) m.set(w.id, w.levelId);
  for (const o of model.openings) {
    const nivel = m.get(o.wallId);
    if (nivel) m.set(o.id, nivel);
  }
  for (const s of model.structures) m.set(s.id, s.levelId);
  return m;
}

/** O nome do pavimento de uma entidade, ou '' quando não se sabe. */
export function nomeDoPavimento(model: BlueprintModel, mapa: Map<string, string>, id: string): string {
  const levelId = mapa.get(id);
  return model.levels.find((l) => l.id === levelId)?.name ?? '';
}

export function quantitativosPorPavimento(
  model: BlueprintModel,
  quant: Quant,
  armadura?: ArmaduraQuantificada,
): QuantitativoDoPavimento[] {
  const mapa = pavimentoDasEntidades(model);
  const acoPorPeca = new Map((armadura?.pecas ?? []).map((p) => [p.structuralId, p.kg]));
  // Na ordem de COTA, de baixo para cima: é como se lê um prédio.
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  return niveis.map((nivel) => {
    const no = (id: string) => mapa.get(id) === nivel.id;
    const rede = redeDoPavimento(model, quant, nivel.id);
    const ambientes = quant.ambientes.filter((a) => no(a.spaceId));
    const paredes = quant.paredes.filter((p) => no(p.wallId));
    const aberturas = quant.aberturas.filter((o) => no(o.openingId));
    const estruturas = quant.estruturas.filter((e) => no(e.structuralId));
    return {
      levelId: nivel.id,
      nome: nivel.name,
      elevationMm: nivel.elevationMm,
      ambientes: ambientes.length,
      areaConstruidaM2: areaConstruidaMm2(model, nivel) / 1_000_000,
      areaPisoM2: ambientes.reduce((s, a) => s + a.areaPisoM2, 0),
      areaParedeDuasFacesM2: paredes.reduce((s, p) => s + p.areaFaceLiquidaM2, 0) * 2,
      volumeAlvenariaM3: paredes.reduce((s, p) => s + p.volumeM3, 0),
      comprimentoRodapeM: ambientes.reduce((s, a) => s + a.comprimentoRodapeM, 0),
      portas: aberturas.filter((o) => o.tipo === 'door').length,
      janelas: aberturas.filter((o) => o.tipo === 'window').length,
      areaAberturasM2: aberturas.reduce((s, o) => s + o.areaM2, 0),
      pecas: estruturas.length,
      volumeConcretoM3: estruturas.reduce((s, e) => s + e.volumeConcretoM3, 0),
      areaFormaM2: estruturas.reduce((s, e) => s + e.areaFormaM2, 0),
      acoKg: estruturas.reduce((s, e) => s + (acoPorPeca.get(e.structuralId) ?? 0), 0),
      tuboHidraulicoM: rede.porBitola.filter((b) => HIDRAULICAS.includes(b.disciplina)).reduce((s, b) => s + b.comprimentoM, 0),
      pontosHidraulicos: (model.terminais ?? []).filter((t) => t.levelId === nivel.id && t.tipoHidraulico != null).length,
      conexoesHidraulicas: rede.porConexao.filter((c) => HIDRAULICAS.includes(c.disciplina)).reduce((s, c) => s + c.quantidade, 0),
    };
  });
}
