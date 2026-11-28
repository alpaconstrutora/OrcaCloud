/**
 * PLANTA BAIXA POR TIPOLOGIA (Espelho de Vendas 3D, F5 — 10/11/2026). Plano:
 * docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * A planta é cadastrada UMA vez por tipologia do empreendimento ("Tipo 1", "2 quartos") e a ficha de toda unidade
 * daquela tipologia a mostra. A tipologia é texto livre em dois cadastros (unidade do Empreendimento e imóvel do
 * estoque), então o casamento é pela CHAVE: sem acento, caixa nem espaço sobrando. Puro.
 */

/** A planta gravada (`empreendimento_tipologia_plantas`), como o banco e as RPCs dos portais a devolvem. */
export interface PlantaDaTipologia {
  id?: string;
  empreendimento_id?: string;
  /** Só na RPC do corretor: o prédio do estoque do empreendimento dono da planta. */
  commercial_building_id?: string | null;
  tipologia: string;
  tipologia_chave: string;
  imagem_url: string;
  imagem_path?: string;
}

/** "Tipo 1", " tipo  1 " e "TIPO 1" são a mesma tipologia. Vazio = sem tipologia (''). */
export function chaveDaTipologia(tipologia: string | null | undefined): string {
  return String(tipologia ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chave → URL da imagem. Com duas plantas para a mesma chave (dois empreendimentos no mesmo prédio), vale a primeira. */
export function plantasPorChave(plantas: readonly PlantaDaTipologia[] | null | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of plantas ?? []) {
    const chave = p.tipologia_chave || chaveDaTipologia(p.tipologia);
    if (chave && p.imagem_url && !m.has(chave)) m.set(chave, p.imagem_url);
  }
  return m;
}

/** A planta da unidade: a da tipologia dela. Unidade sem tipologia, ou tipologia sem planta = null. */
export function plantaDaUnidade(porChave: ReadonlyMap<string, string>, tipologia: string | null | undefined): string | null {
  const chave = chaveDaTipologia(tipologia);
  return chave ? (porChave.get(chave) ?? null) : null;
}

export interface TipologiaDoEmpreendimento {
  chave: string;
  /** Como está escrita no cadastro (a primeira grafia vista; a da planta quando só ela existe). */
  rotulo: string;
  /** Quantas unidades têm esta tipologia — o maior número entre o Empreendimento e o estoque (são as mesmas unidades). */
  unidades: number;
  planta: PlantaDaTipologia | null;
  /** Área privativa das unidades do Empreendimento com esta tipologia (menor e maior; iguais quando todas batem).
   *  `null` sem unidade com área — identifica a tipologia na aba Tipologias (27/11/2026). */
  areaPrivativa: { min: number; max: number } | null;
}

/** "81 m²" quando todas as unidades da tipologia têm a mesma área; "81–127 m²" quando varia. */
export function textoDaAreaPrivativa(a: { min: number; max: number } | null | undefined): string | null {
  if (!a) return null;
  const m2 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return a.min === a.max ? `${m2(a.min)} m²` : `${m2(a.min)}–${m2(a.max)} m²`;
}

/**
 * A lista do cadastro: toda tipologia que aparece nas unidades do Empreendimento ou nos imóveis do prédio, com a
 * planta quando há; e a planta ÓRFÃ (a tipologia saiu do cadastro) no fim, com 0 unidades, para poder ser removida.
 */
export function tipologiasDoEmpreendimento(entrada: {
  unidades: readonly (string | null | undefined)[];
  imoveis: readonly (string | null | undefined)[];
  plantas: readonly PlantaDaTipologia[];
  /** A área privativa de cada unidade, na MESMA posição de `unidades` (opcional: quem não manda fica sem área). */
  areasDasUnidades?: readonly (number | null | undefined)[];
}): TipologiaDoEmpreendimento[] {
  const contar = (lista: readonly (string | null | undefined)[]) => {
    const m = new Map<string, { rotulo: string; n: number }>();
    for (const t of lista) {
      const chave = chaveDaTipologia(t);
      if (!chave) continue;
      const atual = m.get(chave);
      if (atual) atual.n += 1;
      else m.set(chave, { rotulo: String(t).replace(/\s+/g, ' ').trim(), n: 1 });
    }
    return m;
  };
  const dasUnidades = contar(entrada.unidades);
  const dosImoveis = contar(entrada.imoveis);
  const plantaDa = new Map<string, PlantaDaTipologia>();
  for (const p of entrada.plantas) {
    const chave = p.tipologia_chave || chaveDaTipologia(p.tipologia);
    if (chave && !plantaDa.has(chave)) plantaDa.set(chave, p);
  }

  const areas = new Map<string, { min: number; max: number }>();
  entrada.unidades.forEach((t, i) => {
    const chave = chaveDaTipologia(t);
    const a = Number(entrada.areasDasUnidades?.[i]);
    if (!chave || !(a > 0)) return;
    const atual = areas.get(chave);
    areas.set(chave, atual ? { min: Math.min(atual.min, a), max: Math.max(atual.max, a) } : { min: a, max: a });
  });

  const chaves = new Set([...dasUnidades.keys(), ...dosImoveis.keys()]);
  const emUso: TipologiaDoEmpreendimento[] = [...chaves].map((chave) => ({
    chave,
    rotulo: dasUnidades.get(chave)?.rotulo ?? dosImoveis.get(chave)!.rotulo,
    unidades: Math.max(dasUnidades.get(chave)?.n ?? 0, dosImoveis.get(chave)?.n ?? 0),
    planta: plantaDa.get(chave) ?? null,
    areaPrivativa: areas.get(chave) ?? null,
  }));
  const orfas: TipologiaDoEmpreendimento[] = [...plantaDa.entries()]
    .filter(([chave]) => !chaves.has(chave))
    .map(([chave, planta]) => ({ chave, rotulo: planta.tipologia, unidades: 0, planta, areaPrivativa: null }));
  const porRotulo = (a: TipologiaDoEmpreendimento, b: TipologiaDoEmpreendimento) => a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true });
  return [...emUso.sort(porRotulo), ...orfas.sort(porRotulo)];
}
