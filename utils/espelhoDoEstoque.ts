// utils/espelhoDoEstoque.ts
//
// ESPELHO DE VENDAS 3D NO ESTOQUE DO CORRETOR (F3, 09/11/2026): do estoque que o corretor vê — os imóveis
// (`commercial_properties`) e os negócios — para a cena do `<Espelho3D>`. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
//
// DUAS FONTES para a forma da torre, nesta ordem:
//  1. EMPREENDIMENTO — as torres, os pavimentos e as unidades de Incorporação › Empreendimento, quando o prédio tem
//     unidade ligada a imóvel que o corretor vê. É a mesma estrutura do 3D da Planta (pé-direito, elevação, posição
//     das unidades no andar).
//  2. ESTOQUE — o bloco e o andar do próprio imóvel. Em 09/11/2026 só 3 dos 9 prédios do estoque tinham o
//     Empreendimento ligado (27 de 88 unidades): sem esta fonte o 3D ficaria desligado para quase todos.
//
// ⚠️ VALE A FONTE QUE ACHA LUGAR PARA MAIS IMÓVEIS (10/11/2026). A primeira versão ficava com o Empreendimento
// sempre que houvesse UMA unidade ligada. No Garden Cambuhy, em produção, só 17 dos 41 imóveis estavam ligados: a
// Torre B saiu inteira neutra, 20 unidades do estoque sumiram do 3D e a legenda dizia "Vendidas 0" com 4 vendidas
// no 2D ao lado. O estoque, com bloco e andar em todos os 41, desenhava tudo. O Empreendimento só vence no empate.
//
// Nos dois casos o prisma é chaveado pelo id do IMÓVEL: é com ele que o portal abre a proposta e a cesta.
//
// O STATUS é o do espelho 2D ao lado (`statusEfetivoDaUnidade`), não o da Análise de Vendas: no seletor 2D | 3D a
// mesma unidade não pode mudar de cor. Puro.

import { rotuloCurtoDaUnidade, rotuloDaTorre } from '../lib/rentalUnitMirror';
import type { SaleUnitStatus } from '../lib/salesAnalysis';
import type { Property } from '../types/imovib';
import type { EmpreendimentoFloor, EmpreendimentoUnit, FloorTipo, OrdemDasUnidadesNaPlanta } from '../types/empreendimento';
import { lerDistancias } from './empreendimentoDistanciasEntreTorres';
import { contornoDaLinha, type LinhaComContorno } from './espelhoContornoDaTorre';
import { montarCenaDoEspelho, type CenaDoEspelho, type HipotesesDoEspelho, type TorreDoEspelho } from './espelhoDeVendas3d';
import type { DadosDaUnidade, PaletaDoEspelho } from './espelhoDeVendas3dMalha';
import { negocioAtivoDaUnidade, statusEfetivoDaUnidade, type NegocioDaUnidade } from './statusEfetivoDaUnidade';

/** O que o espelho lê de um imóvel do estoque. */
export type ImovelDoEstoque = Pick<Property, 'id' | 'name' | 'type' | 'status'> &
  Partial<Pick<Property, 'number' | 'parent_id' | 'block' | 'floor' | 'specs' | 'private_area' | 'area' | 'typology' | 'bedrooms' | 'bathrooms' | 'parking_spaces' | 'position_type' | 'price' | 'current_price' | 'images'>>;

/** Uma torre do Empreendimento como o portal a recebe (RPC `fn_broker_portal_get_espelho`, ou as tabelas no app). */
export interface TorreDaEstrutura extends LinhaComContorno {
  id: string;
  name: string;
  /** O prédio do estoque (`commercial_properties` BUILDING) do empreendimento desta torre. */
  commercial_building_id: string | null;
  sort_order: number | null;
  floors_count: number | null;
  units_per_floor: number | null;
  pe_direito_padrao_m: number | null;
  elevacao_terreo_m: number | null;
  ordem_das_unidades_na_planta: OrdemDasUnidadesNaPlanta | null;
  blueprint_quadra_uid: string | null;
  /** `empreendimentos.distancias_entre_torres`, cru. */
  distancias_entre_torres: unknown;
  floors: EmpreendimentoFloor[];
  units: UnidadeDaEstrutura[];
}

export interface UnidadeDaEstrutura {
  id: string;
  name: string;
  floor: number | null;
  floor_tipo: FloorTipo | null;
  private_area: number | null;
  position_type: EmpreendimentoUnit['position_type'];
  sun_orientation: EmpreendimentoUnit['sun_orientation'];
  sort_order: number | null;
  vaga_na_planta: number | null;
  /** O imóvel do estoque desta unidade; null = sem imóvel, ou imóvel que este corretor não vê. */
  property_id: string | null;
}

/**
 * As cores do corretor. "Vendida" é VERMELHA, como no espelho 2D ao lado (`PropertyUnitMap`) — na Análise de Vendas
 * ela é azul, mas ali não há um 2D vermelho do lado. "Indisponível" junta o que o 2D chama de Bloqueado (negócio em
 * andamento) e Alugado. A contagem da legenda é a codificação secundária (guia §28.4).
 */
export const PALETA_DO_CORRETOR: PaletaDoEspelho = {
  available: { cor: '#059669', rotulo: 'Disponível', plural: 'Disponíveis' },
  reserved: { cor: '#d97706', rotulo: 'Reservada', plural: 'Reservadas' },
  sold: { cor: '#dc2626', rotulo: 'Vendida', plural: 'Vendidas' },
  exchanged: { cor: '#7c3aed', rotulo: 'Permutada', plural: 'Permutadas' },
  other: { cor: '#94a3b8', rotulo: 'Indisponível', plural: 'Indisponíveis' },
};

/** O status efetivo do 2D (`AVAILABLE`, `SOLD`…) nas cinco categorias do espelho. */
export function statusDoEspelhoDoCorretor(efetivo: string | null | undefined): SaleUnitStatus {
  switch (efetivo) {
    case 'AVAILABLE':
      return 'available';
    case 'RESERVED':
      return 'reserved';
    case 'SOLD':
      return 'sold';
    case 'EXCHANGED':
      return 'exchanged';
    default:
      return 'other';
  }
}

const POSICAO: Record<string, EmpreendimentoUnit['position_type']> = { FRONT: 'FRENTE', BACK: 'FUNDOS', LATERAL: 'LATERAL' };

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const andarDo = (i: ImovelDoEstoque): number | null => numero(i.floor) ?? numero(i.specs?.floor);
const nomeDo = (i: ImovelDoEstoque) => rotuloCurtoDaUnidade(String(i.number || i.name || ''));

function dadosDo(i: ImovelDoEstoque): DadosDaUnidade {
  return {
    tipologia: i.typology || i.specs?.typology || null,
    areaPrivativaM2: numero(i.private_area) ?? numero(i.area),
    dormitorios: numero(i.bedrooms) ?? numero(i.specs?.bedrooms),
    banheiros: numero(i.bathrooms) ?? numero(i.specs?.bathrooms),
    vagas: numero(i.parking_spaces) ?? numero(i.specs?.parkingSpaces),
    // O mesmo preço que o 2D mostra: o corrente, senão o de tabela. Preço escondido do corretor chega nulo.
    preco: numero(i.current_price) ?? numero(i.price),
    fotoUrl: i.images?.[0] || null,
  };
}

/** As torres tiradas do próprio estoque: uma por bloco, só com os imóveis que têm andar. */
function torresDoEstoque(imoveis: readonly ImovelDoEstoque[]): TorreDoEspelho[] {
  const porBloco = new Map<string, ImovelDoEstoque[]>();
  for (const i of imoveis) {
    if (andarDo(i) === null) continue;
    const bloco = String(i.block ?? '').trim();
    const lista = porBloco.get(bloco);
    if (lista) lista.push(i);
    else porBloco.set(bloco, [i]);
  }
  return [...porBloco.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }))
    .map(([bloco, lista], k) => ({
      id: `bloco:${bloco}`,
      name: bloco ? rotuloDaTorre(bloco) : 'Torre',
      sort_order: k,
      units: lista.map((i, n) => ({
        id: i.id,
        name: nomeDo(i),
        floor: andarDo(i)!,
        floor_tipo: null,
        private_area: numero(i.private_area) ?? numero(i.area) ?? undefined,
        position_type: i.position_type ? (POSICAO[i.position_type] ?? null) : null,
        status: 'DISPONIVEL' as const,
        sort_order: n,
      })),
    }));
}

export interface EspelhoDoEstoque {
  cena: CenaDoEspelho;
  /** A ficha de cada unidade, pelo id do imóvel. */
  dados: Map<string, DadosDaUnidade>;
  fonte: 'EMPREENDIMENTO' | 'ESTOQUE';
  /** Imóveis do estoque que não acharam lugar na torre (sem andar, ou sem unidade no Empreendimento): só no 2D. */
  semPosicao: number;
}

/**
 * A cena do Estoque em 3D. `imoveis` = o que o 2D está mostrando (o prédio escolhido); `negocios` = os mesmos do 2D
 * (`dealsDoMapa`); `estrutura` = as torres do Empreendimento DESTE prédio, quando há.
 */
export function montarEspelhoDoEstoque(entrada: {
  imoveis: readonly ImovelDoEstoque[];
  negocios: readonly NegocioDaUnidade[] | null | undefined;
  estrutura?: readonly TorreDaEstrutura[] | null;
  hipoteses?: Partial<HipotesesDoEspelho>;
}): EspelhoDoEstoque {
  const unidades = entrada.imoveis.filter((i) => i.type !== 'BUILDING');
  const porId = new Map(unidades.map((i) => [i.id, i]));
  const statusPorUnidade = new Map<string, SaleUnitStatus>(
    unidades.map((i) => [i.id, statusDoEspelhoDoCorretor(statusEfetivoDaUnidade(i.status, negocioAtivoDaUnidade(i.id, entrada.negocios)))]),
  );
  const dados = new Map(unidades.map((i) => [i.id, dadosDo(i)]));

  const colocados = (cena: CenaDoEspelho) => new Set(cena.prismas.map((p) => p.unitId).filter(Boolean)).size;
  const cenaDoEstoque = montarCenaDoEspelho({ torres: torresDoEstoque(unidades), statusPorUnidade, hipoteses: entrada.hipoteses });
  const doEstoque: EspelhoDoEstoque = { cena: cenaDoEstoque, dados, fonte: 'ESTOQUE', semPosicao: unidades.length - colocados(cenaDoEstoque) };

  const estrutura = (entrada.estrutura ?? []).filter((t) => !t.blueprint_quadra_uid);
  const ligados = new Set(estrutura.flatMap((t) => t.units.map((u) => u.property_id)).filter((id): id is string => !!id && porId.has(id)));
  if (ligados.size === 0) return doEstoque;

  const ocultas = new Set<string>();
  const pavimentosPorTorre = new Map<string, EmpreendimentoFloor[]>();
  const torres: TorreDoEspelho[] = estrutura.map((t) => {
    pavimentosPorTorre.set(t.id, t.floors ?? []);
    return {
      id: t.id,
      name: t.name,
      sort_order: t.sort_order ?? 0,
      floors_count: t.floors_count ?? undefined,
      units_per_floor: t.units_per_floor,
      pe_direito_padrao_m: t.pe_direito_padrao_m,
      elevacao_terreo_m: t.elevacao_terreo_m,
      ordem_das_unidades_na_planta: t.ordem_das_unidades_na_planta ?? undefined,
      // O contorno enviado pela Planta (F1b); sem ele a torre sai esquemática.
      contorno: contornoDaLinha(t),
      units: t.units.map((u) => {
        const visivel = !!u.property_id && porId.has(u.property_id);
        // A unidade que o corretor não vê guarda o lugar com um id próprio, que nunca casa com um imóvel.
        const id = visivel ? u.property_id! : `oculta:${u.id}`;
        if (!visivel) ocultas.add(id);
        return {
          id,
          name: u.name,
          floor: u.floor ?? undefined,
          floor_tipo: u.floor_tipo,
          private_area: u.private_area ?? undefined,
          position_type: u.position_type,
          sun_orientation: u.sun_orientation,
          status: 'DISPONIVEL' as const,
          sort_order: u.sort_order ?? 0,
          vaga_na_planta: u.vaga_na_planta,
        };
      }),
    };
  });
  const cena = montarCenaDoEspelho({
    torres,
    pavimentosPorTorre,
    statusPorUnidade,
    unidadesOcultas: ocultas,
    distancias: lerDistancias(estrutura[0]?.distancias_entre_torres),
    hipoteses: entrada.hipoteses,
  });
  // Empate fica com o Empreendimento: é a forma de verdade (pé-direito, elevação, posição no andar).
  if (colocados(cena) < colocados(cenaDoEstoque)) return doEstoque;
  return { cena, dados, fonte: 'EMPREENDIMENTO', semPosicao: unidades.length - colocados(cena) };
}
