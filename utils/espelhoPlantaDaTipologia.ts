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
}

/**
 * A lista do cadastro: toda tipologia que aparece nas unidades do Empreendimento ou nos imóveis do prédio, com a
 * planta quando há; e a planta ÓRFÃ (a tipologia saiu do cadastro) no fim, com 0 unidades, para poder ser removida.
 */
export function tipologiasDoEmpreendimento(entrada: {
  unidades: readonly (string | null | undefined)[];
  imoveis: readonly (string | null | undefined)[];
  plantas: readonly PlantaDaTipologia[];
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

  const chaves = new Set([...dasUnidades.keys(), ...dosImoveis.keys()]);
  const emUso: TipologiaDoEmpreendimento[] = [...chaves].map((chave) => ({
    chave,
    rotulo: dasUnidades.get(chave)?.rotulo ?? dosImoveis.get(chave)!.rotulo,
    unidades: Math.max(dasUnidades.get(chave)?.n ?? 0, dosImoveis.get(chave)?.n ?? 0),
    planta: plantaDa.get(chave) ?? null,
  }));
  const orfas: TipologiaDoEmpreendimento[] = [...plantaDa.entries()]
    .filter(([chave]) => !chaves.has(chave))
    .map(([chave, planta]) => ({ chave, rotulo: planta.tipologia, unidades: 0, planta }));
  const porRotulo = (a: TipologiaDoEmpreendimento, b: TipologiaDoEmpreendimento) => a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true });
  return [...emUso.sort(porRotulo), ...orfas.sort(porRotulo)];
}
