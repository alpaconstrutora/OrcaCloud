// utils/espelhoDoInvestidor.ts
//
// ESPELHO DE VENDAS 3D NO PORTAL DO INVESTIDOR (F4, 10/11/2026): de uma obra como a RPC a entrega
// (`fn_investor_portal_get_espelho` pelo link, `fn_investor_get_espelho` no app) para a cena do `<Espelho3D>` e os
// números da faixa de indicadores. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
//
// DECISÃO DO USUÁRIO (09/11/2026): o investidor vê o status de cada unidade, o preço de tabela dela e o VGV vendido e
// em estoque — nunca o comprador. Por isso o STATUS já vem resolvido do banco (a regra única da venda, em SQL) e o
// valor vendido vem só somado: nenhuma negociação chega ao navegador do investidor.
//
// A forma da torre é a do Empreendimento (o investidor chega à unidade pela obra → torre), então aqui não há a
// segunda fonte do corretor. Unidade não vendável (lazer, zeladoria) guarda o lugar, neutra. Puro.

import type { SaleUnitStatus } from '../lib/salesAnalysis';
import type { EmpreendimentoFloor, EmpreendimentoUnit, FloorTipo, OrdemDasUnidadesNaPlanta } from '../types/empreendimento';
import { lerDistancias } from './empreendimentoDistanciasEntreTorres';
import { contornoDaLinha, type LinhaComContorno } from './espelhoContornoDaTorre';
import { plantaDaUnidade, plantasPorChave, type PlantaDaTipologia } from './espelhoPlantaDaTipologia';
import { rotuloDaVista, vistaDaUnidade, type VistaDaTorre } from './espelhoVistaDaJanela';
import { montarCenaDoEspelho, type CenaDoEspelho, type HipotesesDoEspelho, type TorreDoEspelho } from './espelhoDeVendas3d';
import type { DadosDaUnidade } from './espelhoDeVendas3dMalha';

export interface UnidadeDoInvestidor {
  id: string;
  name: string;
  floor: number | null;
  floor_tipo: FloorTipo | null;
  typology: string | null;
  private_area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  position_type: EmpreendimentoUnit['position_type'];
  sun_orientation: EmpreendimentoUnit['sun_orientation'];
  sort_order: number | null;
  vaga_na_planta: number | null;
  is_vendavel: boolean | null;
  /** Preço de tabela. */
  price: number | null;
  /** Já resolvido pela regra da venda, no banco. */
  status: string | null;
}

export interface TorreDoInvestidor extends LinhaComContorno {
  id: string;
  name: string;
  sort_order: number | null;
  floors_count: number | null;
  units_per_floor: number | null;
  pe_direito_padrao_m: number | null;
  elevacao_terreo_m: number | null;
  ordem_das_unidades_na_planta: OrdemDasUnidadesNaPlanta | null;
  blueprint_quadra_uid: string | null;
  distancias_entre_torres: unknown;
  floors: EmpreendimentoFloor[];
  units: UnidadeDoInvestidor[];
  /** As vistas da janela da torre, por faixa de andares (F6). Ausente antes da migration. */
  vistas?: VistaDaTorre[] | null;
}

export interface ObraDoEspelho {
  project_id: string;
  project_name: string;
  /** Soma do valor das negociações vendidas (Contrato, Assinatura ou Concluído), cada uma uma vez. */
  vgv_vendido: number | null;
  torres: TorreDoInvestidor[];
  /** As plantas por tipologia dos empreendimentos desta obra (F5). Ausente antes da migration. */
  plantas?: PlantaDaTipologia[] | null;
}

export interface ResumoDoInvestidor {
  /** Unidades vendáveis. */
  unidades: number;
  vendidas: number;
  /** Vendidas ÷ vendáveis; null sem unidade vendável. */
  taxaVendida: number | null;
  vgvVendido: number;
  /** Preço de tabela das vendáveis ainda não vendidas nem permutadas. Sem preço, fica fora — e é contada. */
  vgvEstoque: number;
  semPreco: number;
  /** Vendáveis que não acharam lugar no desenho (sem andar no cadastro): contam nos números, não aparecem na torre. */
  foraDoDesenho: number;
}

export interface EspelhoDoInvestidor {
  cena: CenaDoEspelho;
  dados: Map<string, DadosDaUnidade>;
  resumo: ResumoDoInvestidor;
}

const STATUS: readonly SaleUnitStatus[] = ['sold', 'reserved', 'available', 'exchanged', 'other'];
/** O status que veio do banco; o que não for um dos cinco vira "outro" — nunca uma cor inventada. */
export const statusDoInvestidor = (s: string | null | undefined): SaleUnitStatus => (STATUS.includes(s as SaleUnitStatus) ? (s as SaleUnitStatus) : 'other');

const numero = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function montarEspelhoDoInvestidor(obra: ObraDoEspelho, hipoteses?: Partial<HipotesesDoEspelho>): EspelhoDoInvestidor {
  const statusPorUnidade = new Map<string, SaleUnitStatus>();
  const dados = new Map<string, DadosDaUnidade>();
  const ocultas = new Set<string>();
  const pavimentosPorTorre = new Map<string, EmpreendimentoFloor[]>();
  const plantas = plantasPorChave(obra.plantas);
  // Sem nenhuma vista na obra a ficha nem fala nisso (`vista` fica de fora).
  const obraTemVista = (obra.torres ?? []).some((t) => (t.vistas ?? []).length > 0);
  let unidades = 0;
  let vendidas = 0;
  let vgvEstoque = 0;
  let semPreco = 0;

  const torres: TorreDoEspelho[] = (obra.torres ?? [])
    .filter((t) => !t.blueprint_quadra_uid)
    .map((t) => {
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
        units: (t.units ?? []).map((u) => {
          const status = statusDoInvestidor(u.status);
          const preco = numero(u.price);
          if (u.is_vendavel === false) ocultas.add(u.id);
          else {
            unidades += 1;
            if (status === 'sold') vendidas += 1;
            statusPorUnidade.set(u.id, status);
            dados.set(u.id, {
              tipologia: u.typology,
              plantaUrl: plantaDaUnidade(plantas, u.typology),
              ...(obraTemVista
                ? (() => {
                    const v = vistaDaUnidade(t.vistas, u.floor, u.sun_orientation, { id: u.id, nome: u.name });
                    return { vista: v ? { url: v.imagem_url, legenda: v.legenda ?? null, cobre: rotuloDaVista(v) } : null };
                  })()
                : {}),
              areaPrivativaM2: numero(u.private_area),
              dormitorios: numero(u.bedrooms),
              banheiros: numero(u.bathrooms),
              vagas: numero(u.parking_spaces),
              preco,
            });
            if (status !== 'sold' && status !== 'exchanged') {
              if (preco && preco > 0) vgvEstoque += preco;
              else semPreco += 1;
            }
          }
          return {
            id: u.id,
            name: u.name,
            floor: u.floor ?? undefined,
            floor_tipo: u.floor_tipo,
            private_area: numero(u.private_area) ?? undefined,
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
    distancias: lerDistancias(obra.torres?.[0]?.distancias_entre_torres),
    hipoteses,
  });
  const noDesenho = new Set(cena.prismas.map((p) => p.unitId).filter(Boolean)).size;
  return {
    cena,
    dados,
    resumo: {
      unidades,
      vendidas,
      taxaVendida: unidades > 0 ? vendidas / unidades : null,
      vgvVendido: numero(obra.vgv_vendido) ?? 0,
      vgvEstoque,
      semPreco,
      foraDoDesenho: unidades - noDesenho,
    },
  };
}
