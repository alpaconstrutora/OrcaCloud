/**
 * MODELOS 3D DOS COMPONENTES (11/10/2026 — F10 do plano
 * `2026-10-11-planta-recursos-video-synaps.md`): a cama, o sofá, a pia… aparecem no 3D
 * como o MÓVEL, e não como a caixa da ficha. Pedido: "Modelos glTF".
 *
 * ─── DE ONDE VÊM ────────────────────────────────────────────────────────────
 *
 * Kenney — "Furniture Kit" 2.0 (www.kenney.nl), licença **CC0 1.0** (domínio público,
 * uso comercial livre, crédito não obrigatório — damos assim mesmo). O `License.txt`
 * do pacote vai junto, em `public/modelos-3d/kenney/LICENSE-Kenney-Furniture-Kit.txt`.
 * Low-poly, sem textura, 8–55 KB cada: combina com o 3D de massas da Planta e não pesa.
 *
 * ─── ONDE MORAM, E POR QUE NÃO NUM BUCKET ───────────────────────────────────
 *
 * Arquivos ESTÁTICOS do app (`public/modelos-3d/`), servidos pela CDN. O plano previa
 * bucket + migration; foi trocado porque os modelos são públicos (CC0), iguais para toda
 * organização e versionados com o código que os encaixa: bucket pediria RLS e migration
 * para guardar o que não é dado de ninguém. Fora do precache do PWA (o `globPatterns` não
 * pega `.glb`): só baixam quando o 3D os pede, e o `useGLTF` os reaproveita na sessão.
 *
 * ─── O QUE NÃO MUDA ─────────────────────────────────────────────────────────
 *
 * O MODELO (`BlueprintModel`) não guarda nada disto — é escolha de DESENHO do 3D, fora do
 * payload e do hash, como a cor. Peça sem modelo (reservas de climatização, tanque) segue
 * como CAIXA; modelo que falhar ao carregar também. O IFC continua com a caixa (a medida é
 * a da ficha; o móvel é ilustração).
 */
import type { TipoDeComponente } from './blueprintKernel';

export const PASTA_DOS_MODELOS = '/modelos-3d/';
/** Teto por arquivo: modelo maior que isto não entra (o teste confere cada um). */
export const MAX_PESO_DO_MODELO_KB = 120;

export interface ModeloDoComponente {
  /** Caminho dentro de `PASTA_DOS_MODELOS`. */
  arquivo: string;
  fonte: string;
  licenca: 'CC0-1.0';
  /**
   * Giro do modelo em torno do eixo vertical, graus, para a FRENTE dele cair na frente da peça
   * (y local 0 da ficha — a cabeceira da cama, o encosto do sofá ficam no fundo).
   */
  giroGraus: 0 | 90 | 180 | 270;
}

const KENNEY = 'Kenney — Furniture Kit 2.0 (kenney.nl)';
const k = (arquivo: string, giroGraus: ModeloDoComponente['giroGraus'] = 180): ModeloDoComponente => ({ arquivo: `kenney/${arquivo}.glb`, fonte: KENNEY, licenca: 'CC0-1.0', giroGraus });

/** O modelo de cada tipo. Ausente = caixa (de propósito nas reservas de climatização e no tanque). */
export const MODELOS_3D: Partial<Record<TipoDeComponente, ModeloDoComponente>> = {
  CAMA_CASAL: k('bedDouble'),
  CAMA_SOLTEIRO: k('bedSingle'),
  CRIADO: k('cabinetBedDrawer'),
  ARMARIO: k('bookcaseClosedDoors'),
  ESTANTE: k('bookcaseOpen'),
  SOFA: k('loungeSofa'),
  POLTRONA: k('loungeChair'),
  MESA_JANTAR: k('table'),
  CADEIRA: k('chair'),
  RACK: k('cabinetTelevision'),
  ESCRIVANINHA: k('desk'),
  BANCADA: k('kitchenSink'),
  BANCADA_SECA: k('kitchenCabinet'),
  GELADEIRA: k('kitchenFridgeLarge'),
  FOGAO: k('kitchenStove'),
  MAQUINA: k('washer'),
  VASO: k('toilet'),
  LAVATORIO: k('bathroomSink'),
  BOX: k('shower'),
};

export function modeloDoTipo(tipoId: TipoDeComponente): (ModeloDoComponente & { url: string }) | null {
  const m = MODELOS_3D[tipoId];
  return m ? { ...m, url: `${PASTA_DOS_MODELOS}${m.arquivo}` } : null;
}

type V3 = [number, number, number];

/**
 * O ENCAIXE: a caixa do modelo (já girada) → a caixa da peça, centrada na origem do grupo
 * da peça. Escala POR EIXO — a peça manda (largura × altura × profundidade da ficha, ou a
 * que o usuário editou): um sofá de 2,40 m sai esticado, não um sofá de 2,00 m sobrando
 * na caixa. Devolve a escala e o deslocamento que levam o centro da caixa do modelo ao 0.
 */
export function encaixeDoModelo(caixa: { min: V3; max: V3 }, medidas: { larguraM: number; alturaM: number; profundidadeM: number }): { escala: V3; deslocamento: V3 } {
  const tam = [0, 1, 2].map((i) => Math.max(caixa.max[i] - caixa.min[i], 1e-6));
  const alvo = [medidas.larguraM, medidas.alturaM, medidas.profundidadeM];
  const escala = [0, 1, 2].map((i) => alvo[i] / tam[i]) as V3;
  const deslocamento = [0, 1, 2].map((i) => -((caixa.min[i] + caixa.max[i]) / 2) * escala[i] + 0) as V3;
  return { escala, deslocamento };
}
