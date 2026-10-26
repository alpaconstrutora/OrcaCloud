// utils/blueprintDadosDoEmpreendimento.ts
//
// O que a Planta Inteligente aproveita da FICHA do empreendimento ligado ao estudo (o vinculado
// por `empreendimentos.blueprint_study_id` e, sem ele, o da obra). Pedido de 21/10/2026: "o app ja
// pode preencher automaticamente sem necessidade de acao manual". Plano:
// docs/planos/2026-10-21-planta-empreendimento-vinculado-autopreencher.md.
//
// Puro, para o editor só repassar. Nada aqui é chute: medida faltando ou laterais diferentes
// não viram retângulo; sem rua nem cidade não há o que procurar no mapa.

import type { Empreendimento } from '../types/empreendimento';

type Ficha = Pick<
  Empreendimento,
  | 'name'
  | 'terreno_area'
  | 'terreno_frente'
  | 'terreno_fundos'
  | 'terreno_profundidade'
  | 'terreno_lateral_direita'
  | 'terreno_lateral_esquerda'
  | 'terreno_street'
  | 'terreno_number'
  | 'terreno_neighborhood'
  | 'terreno_city'
  | 'terreno_state'
  | 'endereco_street'
  | 'endereco_number'
  | 'endereco_neighborhood'
  | 'endereco_city'
  | 'endereco_state'
  | 'terreno_frente_azimute'
  | 'terreno_latitude'
  | 'terreno_longitude'
>;

export interface DadosDoEmpreendimentoParaPlanta {
  /**
   * Frente × fundo (aba de Criar o lote digitando). Desde 22/10/2026 traz os fundos (trapézio
   * centralizado) e a profundidade que FECHARIA a Área total da ficha — quando as duas diferem, o
   * painel pergunta qual usar (decisão do usuário). `profundidadeMm` é a da ficha (pode faltar).
   */
  lote: {
    frenteMm: number;
    fundosMm: number | null;
    profundidadeMm: number | null;
    /** A profundidade que, com frente e fundos, dá a Área total da ficha (arredondada ao cm). */
    profundidadePelaAreaMm: number | null;
    areaM2: number | null;
    origem: string;
    /**
     * Para onde a frente está voltada (azimute em graus do norte, horário) — `terreno_frente_azimute` da ficha,
     * 26/10/2026. `null` = a ficha não diz: o lote entra na orientação padrão do painel, com aviso.
     */
    frenteVoltadaPara: number | null;
  } | null;
  /** Latitude/longitude da ficha (26/10/2026), para a georreferência do desenho; só as duas juntas. */
  coordenadas: { latitude: number; longitude: number; origem: string } | null;
  /** O que procurar em "Desenhar no mapa". */
  endereco: { texto: string; origem: string } | null;
  /** UF para o CUB da Casa automática. */
  uf: string | null;
  /** Cidade (terreno, senão divulgação) para "Buscar por cidade" da zona — 22/10/2026. */
  cidade: { nome: string; uf: string | null } | null;
}

const positivo = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const texto = (v: string | null | undefined): string => (v ?? '').trim();
/** 0–360 (360 = 0); fora disso ou vazio, `null`. */
const azimute = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 360 ? v % 360 : null);

function montarEndereco(rua: string, numero: string, bairro: string, cidade: string, uf: string): string | null {
  if (!rua && !cidade) return null;
  const cidadeUf = cidade && uf ? `${cidade} - ${uf}` : cidade || uf;
  return [rua, rua ? numero : '', bairro, cidadeUf].filter(Boolean).join(', ');
}

export function dadosDoEmpreendimentoParaPlanta(e: Partial<Ficha> | null | undefined): DadosDoEmpreendimentoParaPlanta {
  if (!e) return { lote: null, endereco: null, uf: null, cidade: null, coordenadas: null };
  const origem = texto(e.name) || 'empreendimento';

  const frente = positivo(e.terreno_frente);
  const ld = positivo(e.terreno_lateral_direita);
  const le = positivo(e.terreno_lateral_esquerda);
  const profundidade = positivo(e.terreno_profundidade) ?? (ld !== null && ld === le ? ld : null);
  const fundos = positivo(e.terreno_fundos);
  const area = positivo(e.terreno_area);
  // Trapézio (ou retângulo): área = (frente + fundos) / 2 × profundidade → profundidade = 2A / (f + b).
  const pelaArea = frente !== null && area !== null ? Math.round((2 * area) / (frente + (fundos ?? frente)) * 100) / 100 : null;
  const lote =
    frente !== null && (profundidade !== null || pelaArea !== null)
      ? {
          frenteMm: Math.round(frente * 1000),
          fundosMm: fundos !== null ? Math.round(fundos * 1000) : null,
          profundidadeMm: profundidade !== null ? Math.round(profundidade * 1000) : null,
          profundidadePelaAreaMm: pelaArea !== null ? Math.round(pelaArea * 1000) : null,
          areaM2: area,
          origem,
          frenteVoltadaPara: azimute(e.terreno_frente_azimute),
        }
      : null;
  const lat = e.terreno_latitude;
  const lon = e.terreno_longitude;
  const coordenadas =
    typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
      ? { latitude: lat, longitude: lon, origem }
      : null;

  const ufTerreno = texto(e.terreno_state).toUpperCase();
  const ufDivulgacao = texto(e.endereco_state).toUpperCase();
  const doTerreno = montarEndereco(texto(e.terreno_street), texto(e.terreno_number), texto(e.terreno_neighborhood), texto(e.terreno_city), ufTerreno);
  const daDivulgacao = montarEndereco(texto(e.endereco_street), texto(e.endereco_number), texto(e.endereco_neighborhood), texto(e.endereco_city), ufDivulgacao);
  const enderecoTexto = doTerreno ?? daDivulgacao;

  return {
    lote,
    endereco: enderecoTexto ? { texto: enderecoTexto, origem } : null,
    uf: ufTerreno || ufDivulgacao || null,
    // A cidade e a UF do MESMO endereço: misturar a cidade do terreno com a UF da divulgação casaria a cidade errada.
    cidade: texto(e.terreno_city)
      ? { nome: texto(e.terreno_city), uf: ufTerreno || null }
      : texto(e.endereco_city)
        ? { nome: texto(e.endereco_city), uf: ufDivulgacao || null }
        : null,
    coordenadas,
  };
}
