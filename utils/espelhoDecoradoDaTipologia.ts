/**
 * "VER DECORADO" POR TIPOLOGIA (Espelho de Vendas 3D, F8 — 10/11/2026). Plano:
 * docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * Por tipologia do empreendimento, o CORTE 3D mobiliado (no máximo um) e as imagens dos AMBIENTES decorados, cada uma
 * com o nome. A ficha de toda unidade daquela tipologia os mostra, um de cada vez, sempre com o selo de imagem
 * ilustrativa — decorado é material de venda, não memorial descritivo. A tipologia casa pela CHAVE da F5
 * (`chaveDaTipologia`). Puro.
 */
import { chaveDaTipologia } from './espelhoPlantaDaTipologia';

export type PapelDoDecorado = 'CORTE' | 'AMBIENTE';
/** ENVIADA = subida pela incorporadora (F8); PLANTA = o corte gerado pela Planta Inteligente (F9). */
export type OrigemDoDecorado = 'ENVIADA' | 'PLANTA';

/** A imagem gravada (`empreendimento_tipologia_decorado`), como o banco e as RPCs dos portais a devolvem. */
export interface ImagemDoDecorado {
  id?: string;
  empreendimento_id?: string;
  /** Só na RPC do corretor: o prédio do estoque do empreendimento dono da imagem. */
  commercial_building_id?: string | null;
  tipologia: string;
  tipologia_chave: string;
  papel: PapelDoDecorado;
  legenda: string | null;
  ordem: number;
  imagem_url: string;
  imagem_path?: string;
  origem: OrigemDoDecorado;
}

/** O que a ficha mostra: o corte primeiro, depois os ambientes na ordem cadastrada. */
export interface DecoradoDaFicha {
  imagens: { url: string; titulo: string; origem: OrigemDoDecorado }[];
}

/** Quantos ambientes uma tipologia aceita: a ficha passa as imagens uma a uma, e mais que isso ninguém olha. */
export const MAXIMO_DE_AMBIENTES = 12;
/** O tamanho do nome do ambiente (o mesmo CHECK do banco). */
export const TAMANHO_DO_NOME_DO_AMBIENTE = 60;
/** O nome que o corte leva quando não tem legenda. */
export const TITULO_DO_CORTE = 'Corte 3D mobiliado';

/** O selo que vai SEMPRE por cima da imagem, nos portais. */
export function rotuloDoSelo(origem: OrigemDoDecorado): string {
  return origem === 'PLANTA' ? 'Gerado do projeto · mobiliário ilustrativo' : 'Imagem ilustrativa';
}

const chaveDa = (i: ImagemDoDecorado) => i.tipologia_chave || chaveDaTipologia(i.tipologia);

/** Corte antes dos ambientes; ambientes pela ordem, empate pelo nome. */
export function emOrdemDeDecorado(a: ImagemDoDecorado, b: ImagemDoDecorado): number {
  if (a.papel !== b.papel) return a.papel === 'CORTE' ? -1 : 1;
  return (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.legenda ?? '').localeCompare(String(b.legenda ?? ''), 'pt-BR', { numeric: true });
}

/**
 * Chave da tipologia → as imagens dela, em ordem. Com dois empreendimentos no mesmo prédio e a mesma tipologia, vale
 * o empreendimento da primeira imagem vista (como a planta da F5) — misturar os dois decorados enganaria.
 */
export function decoradosPorChave(lista: readonly ImagemDoDecorado[] | null | undefined): Map<string, ImagemDoDecorado[]> {
  const dono = new Map<string, string | undefined>();
  const m = new Map<string, ImagemDoDecorado[]>();
  for (const i of lista ?? []) {
    const chave = chaveDa(i);
    if (!chave || !i.imagem_url) continue;
    if (!dono.has(chave)) dono.set(chave, i.empreendimento_id);
    if (dono.get(chave) !== i.empreendimento_id) continue;
    const atual = m.get(chave);
    if (atual) atual.push(i);
    else m.set(chave, [i]);
  }
  for (const imagens of m.values()) imagens.sort(emOrdemDeDecorado);
  return m;
}

/** O que a ficha precisa de uma imagem: o corte sem nome vira "Corte 3D mobiliado". */
function paraAFicha(i: ImagemDoDecorado): DecoradoDaFicha['imagens'][number] {
  const nome = (i.legenda ?? '').trim();
  return { url: i.imagem_url, titulo: nome || (i.papel === 'CORTE' ? TITULO_DO_CORTE : 'Ambiente'), origem: i.origem === 'PLANTA' ? 'PLANTA' : 'ENVIADA' };
}

/** O decorado da unidade: o da tipologia dela. Sem tipologia, ou tipologia sem decorado = null. */
export function decoradoDaUnidade(porChave: ReadonlyMap<string, readonly ImagemDoDecorado[]>, tipologia: string | null | undefined): DecoradoDaFicha | null {
  const chave = chaveDaTipologia(tipologia);
  const imagens = chave ? porChave.get(chave) : undefined;
  return imagens && imagens.length > 0 ? { imagens: imagens.map(paraAFicha) } : null;
}

/**
 * O decorado para `DadosDaUnidade.decorado`: AUSENTE quando o prédio/obra não tem decorado nenhum (a ficha nem fala
 * nisso); `null` quando tem, mas não desta tipologia (o botão aparece desligado, dizendo por quê).
 */
export function decoradoParaAFicha(porChave: ReadonlyMap<string, readonly ImagemDoDecorado[]>, tipologia: string | null | undefined): { decorado?: DecoradoDaFicha | null } {
  return porChave.size === 0 ? {} : { decorado: decoradoDaUnidade(porChave, tipologia) };
}

/** O que falta para gravar um ambiente; null = pode salvar. */
export function problemaDoAmbiente(entrada: { temArquivo: boolean; nome: string; ambientesJaGravados: number }): string | null {
  if (entrada.ambientesJaGravados >= MAXIMO_DE_AMBIENTES) return `Esta tipologia já tem ${MAXIMO_DE_AMBIENTES} ambientes. Remova um para incluir outro.`;
  if (!entrada.temArquivo) return 'Escolha a imagem do ambiente.';
  const nome = entrada.nome.trim();
  if (!nome) return 'Dê o nome do ambiente (ex: Sala, Suíte).';
  if (nome.length > TAMANHO_DO_NOME_DO_AMBIENTE) return `O nome do ambiente passa de ${TAMANHO_DO_NOME_DO_AMBIENTE} caracteres.`;
  return null;
}

/** As imagens de cada tipologia, para o cadastro: o corte (ou nenhum) e os ambientes em ordem. */
export function decoradoDoCadastro(lista: readonly ImagemDoDecorado[], chave: string): { corte: ImagemDoDecorado | null; ambientes: ImagemDoDecorado[] } {
  const daTipologia = lista.filter((i) => chaveDa(i) === chave).sort(emOrdemDeDecorado);
  return { corte: daTipologia.find((i) => i.papel === 'CORTE') ?? null, ambientes: daTipologia.filter((i) => i.papel === 'AMBIENTE') };
}
