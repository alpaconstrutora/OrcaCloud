import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BlueprintUrbanContext } from '../types/blueprint';
import type { RegulatoryMapWithCity } from '../types/regulatoryMap';
import type { CitySearchValue } from '../components/regulatoryMap/CitySearchSelect';
import { empreendimentoService } from '../services/empreendimentoService';
import { regulatoryMapService } from '../services/regulatoryMapService';
import {
  blueprintUrbanContextService,
  type UrbanContextInput,
} from '../services/blueprintUrbanContextService';
import { RECUOS_ZERO, type Recuos } from '../utils/blueprintTerreno';
import {
  lerZona,
  recuosDaZona,
  rotuloDaZona,
  zonaDerivou,
  type CampoDaZona,
  type ValoresDaZona,
  type ZonaRegulatoria,
} from '../utils/blueprintZonaUrbanistica';

/**
 * Os parâmetros urbanísticos do estudo: de onde vêm, o que está em vigor.
 *
 * ─── POR QUE UM HOOK, E NÃO MAIS ESTADO NO EDITOR ───────────────────────────
 *
 * `BlueprintEditor` passa de 1.800 linhas. Isto aqui é um assunto fechado —
 * escolher zona, traduzir a lei, guardar, detectar deriva — com estado que só
 * conversa consigo mesmo. Deixá-lo lá dentro seria somar ruído ao arquivo mais
 * difícil do módulo.
 *
 * ─── DEGRADA SEM A MIGRATION ────────────────────────────────────────────────
 *
 * ⚠️ As migrations `aplicar_20270914000000` e `...0001` são aplicadas À MÃO no
 * SQL Editor, e o deploy da Vercel publica só o front. Entre um e outro existe
 * uma janela em que a tabela (ou a coluna) não existe. Se a leitura explodisse,
 * o painel de terreno inteiro morreria por causa de um recurso novo — então
 * falha de persistência vira `persistenciaIndisponivel` e o editor segue em
 * memória, como funcionava antes desta feature.
 */

/**
 * De onde a zona vem.
 *
 * `EMPREENDIMENTO` é o caminho principal: a cópia que o empreendimento já
 * ajustou, com os desvios que a incorporação negociou. `CATALOGO` existe porque
 * o estudo sem empreendimento nenhum — quem abre a Planta Inteligente antes de
 * cadastrar a incorporação, que é o começo natural — ficava sem caminho para a
 * lei e tinha de digitar os recuos à mão.
 */
export type OrigemDaZona = 'EMPREENDIMENTO' | 'CATALOGO';

export interface ZonaUrbanistica {
  origemDaZona: OrigemDaZona;
  setOrigemDaZona: (o: OrigemDaZona) => void;

  /** Empreendimento escolhido — serve à zona E ao write-back de área. */
  empreendimentoId: string;
  setEmpreendimentoId: (id: string) => void;

  /** Caminho do catálogo: cidade → mapa → zona. */
  cidade: CitySearchValue | null;
  setCidade: (c: CitySearchValue | null) => void;
  mapas: RegulatoryMapWithCity[];
  mapaId: string;
  setMapaId: (id: string) => void;
  carregandoMapas: boolean;

  /** As zonas da origem ativa. */
  zonas: ZonaRegulatoria[];
  carregandoZonas: boolean;

  /** Em vigor no desenho. */
  recuos: Recuos;
  taxaOcupacaoMax: number | null;
  coeficienteMax: number | null;
  gabaritoAlturaMaxM: number | null;
  gabaritoPavimentos: number | null;
  taxaPermeabilidadeMin: number | null;

  /** Edição manual: grava o valor E marca o campo como digitado. */
  ajustarRecuo: (papel: keyof Recuos, mm: number) => void;
  ajustarTaxaOcupacaoMax: (v: number | null) => void;
  ajustarCoeficienteMax: (v: number | null) => void;

  aplicarZona: (zonaId: string) => void;
  desligar: () => void;

  zonaAplicadaId: string | null;
  zonaRotuloSalvo: string | null;
  ajustadoAMao: boolean;
  derivou: boolean;
  salvando: boolean;
  persistenciaIndisponivel: boolean;
}

/** Campo do painel → chave de `origem_valores`. */
const CAMPO_DO_RECUO: Record<keyof Recuos, CampoDaZona> = {
  FRENTE: 'recuo_frente',
  FUNDOS: 'recuo_fundos',
  LATERAL_DIREITA: 'recuo_lateral_direita',
  LATERAL_ESQUERDA: 'recuo_lateral_esquerda',
};

const COLUNA_DO_RECUO: Record<keyof Recuos, keyof UrbanContextInput> = {
  FRENTE: 'recuo_frente_mm',
  FUNDOS: 'recuo_fundos_mm',
  LATERAL_DIREITA: 'recuo_lateral_direita_mm',
  LATERAL_ESQUERDA: 'recuo_lateral_esquerda_mm',
};

const TODOS_OS_CAMPOS: CampoDaZona[] = [
  'recuo_frente',
  'recuo_fundos',
  'recuo_lateral_direita',
  'recuo_lateral_esquerda',
  'taxa_ocupacao_max',
  'coeficiente_max',
  'gabarito_altura_max',
  'gabarito_pavimentos',
  'taxa_permeabilidade_min',
];

const SEM_LIMITES: Omit<ValoresDaZona, 'recuoMm'> = {
  taxaOcupacaoMax: null,
  coeficienteMax: null,
  gabaritoAlturaMaxM: null,
  gabaritoPavimentos: null,
  taxaPermeabilidadeMin: null,
};

export function useBlueprintZonaUrbanistica(
  studyId: string,
  organizationId: string,
  /** Sugestão vinda da obra do estudo. Só vale enquanto ninguém escolheu nada. */
  empreendimentoSugerido: string | null,
  /** Contexto do topo. `null` = "Todas" — o catálogo então não filtra por org. */
  orgId: string | null,
): ZonaUrbanistica {
  const [origemDaZona, setOrigemDaZona] = useState<OrigemDaZona>('EMPREENDIMENTO');
  const [empreendimentoId, setEmpreendimentoIdBruto] = useState('');

  const [cidade, setCidade] = useState<CitySearchValue | null>(null);
  const [mapas, setMapas] = useState<RegulatoryMapWithCity[]>([]);
  const [mapaId, setMapaId] = useState('');
  const [carregandoMapas, setCarregandoMapas] = useState(false);

  const [zonas, setZonas] = useState<ZonaRegulatoria[]>([]);
  const [carregandoZonas, setCarregandoZonas] = useState(false);

  const [recuos, setRecuos] = useState<Recuos>(RECUOS_ZERO);
  const [limites, setLimites] = useState<Omit<ValoresDaZona, 'recuoMm'>>(SEM_LIMITES);

  const [contexto, setContexto] = useState<BlueprintUrbanContext | null>(null);
  const [origemDosValores, setOrigemDosValores] = useState<Record<string, 'ZONA' | 'MANUAL'>>({});
  const [salvando, setSalvando] = useState(false);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);

  /** O usuário já mexeu no seletor? Depois disso a sugestão não manda mais. */
  const escolheuAMao = useRef(false);

  // ── Carga do contexto salvo ───────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const ctx = await blueprintUrbanContextService.get(studyId);
        if (!vivo || !ctx) return;

        setContexto(ctx);
        setOrigemDosValores(ctx.origem_valores ?? {});
        setRecuos({
          FRENTE: ctx.recuo_frente_mm ?? 0,
          FUNDOS: ctx.recuo_fundos_mm ?? 0,
          LATERAL_DIREITA: ctx.recuo_lateral_direita_mm ?? 0,
          LATERAL_ESQUERDA: ctx.recuo_lateral_esquerda_mm ?? 0,
        });
        setLimites({
          taxaOcupacaoMax: ctx.taxa_ocupacao_max,
          coeficienteMax: ctx.coeficiente_max,
          gabaritoAlturaMaxM: ctx.gabarito_altura_max_m,
          gabaritoPavimentos: ctx.gabarito_pavimentos,
          taxaPermeabilidadeMin: ctx.taxa_permeabilidade_min,
        });

        // Linha gravada antes de `zona_origem` existir veio do empreendimento:
        // à época era o único caminho.
        const origemSalva: OrigemDaZona = ctx.zona_origem ?? 'EMPREENDIMENTO';
        setOrigemDaZona(origemSalva);
        if (origemSalva === 'CATALOGO' && ctx.regulatory_map_id) {
          setMapaId(ctx.regulatory_map_id);
        }
        if (ctx.empreendimento_id) {
          escolheuAMao.current = true;
          setEmpreendimentoIdBruto(ctx.empreendimento_id);
        }
      } catch (e) {
        if (vivo) setPersistencia(true);
        console.warn('[zona urbanística] persistência indisponível:', e);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId]);

  // A sugestão da obra só entra enquanto ninguém escolheu e nada foi salvo.
  useEffect(() => {
    if (escolheuAMao.current || empreendimentoId || !empreendimentoSugerido) return;
    setEmpreendimentoIdBruto(empreendimentoSugerido);
  }, [empreendimentoSugerido, empreendimentoId]);

  // ── Mapas da cidade (só no caminho do catálogo) ───────────────────────────
  useEffect(() => {
    if (origemDaZona !== 'CATALOGO' || !cidade) {
      setMapas([]);
      return;
    }
    let vivo = true;
    setCarregandoMapas(true);
    regulatoryMapService
      .list(orgId ?? undefined, cidade.id)
      .then((m) => vivo && setMapas(m))
      .catch((e) => {
        if (vivo) setMapas([]);
        console.warn('[zona urbanística] não deu para listar os mapas:', e);
      })
      .finally(() => vivo && setCarregandoMapas(false));
    return () => {
      vivo = false;
    };
  }, [origemDaZona, cidade, orgId]);

  // ── Zonas da origem ativa ─────────────────────────────────────────────────
  useEffect(() => {
    const buscar =
      origemDaZona === 'EMPREENDIMENTO'
        ? empreendimentoId
          ? () => empreendimentoService.listRegulatoryZones(empreendimentoId)
          : null
        : mapaId
          ? () => regulatoryMapService.listZones(mapaId)
          : null;

    if (!buscar) {
      setZonas([]);
      return;
    }
    let vivo = true;
    setCarregandoZonas(true);
    buscar()
      .then((z) => vivo && setZonas(z as ZonaRegulatoria[]))
      .catch((e) => {
        if (vivo) setZonas([]);
        console.warn('[zona urbanística] não deu para listar as zonas:', e);
      })
      .finally(() => vivo && setCarregandoZonas(false));
    return () => {
      vivo = false;
    };
  }, [origemDaZona, empreendimentoId, mapaId]);

  const setEmpreendimentoId = useCallback((id: string) => {
    escolheuAMao.current = true;
    setEmpreendimentoIdBruto(id);
  }, []);

  /** Grava o contexto. Falha só desliga a persistência — nunca quebra a tela. */
  const persistir = useCallback(
    async (patch: UrbanContextInput) => {
      if (persistenciaIndisponivel) return;
      setSalvando(true);
      try {
        const salvo = await blueprintUrbanContextService.save(studyId, organizationId, patch);
        setContexto(salvo);
      } catch (e) {
        setPersistencia(true);
        console.warn('[zona urbanística] não deu para salvar:', e);
      } finally {
        setSalvando(false);
      }
    },
    [studyId, organizationId, persistenciaIndisponivel],
  );

  // ── Aplicar a zona ────────────────────────────────────────────────────────
  const aplicarZona = useCallback(
    (zonaId: string) => {
      const zona = zonas.find((z) => z.id === zonaId);
      if (!zona) return;

      const { valores: lidos } = lerZona(zona);
      const novosRecuos = recuosDaZona(lidos);

      setRecuos(novosRecuos);
      setLimites({
        taxaOcupacaoMax: lidos.taxaOcupacaoMax,
        coeficienteMax: lidos.coeficienteMax,
        gabaritoAlturaMaxM: lidos.gabaritoAlturaMaxM,
        gabaritoPavimentos: lidos.gabaritoPavimentos,
        taxaPermeabilidadeMin: lidos.taxaPermeabilidadeMin,
      });

      // Aplicar zera os ajustes manuais anteriores: é a ação explícita de dizer
      // "quero o que a lei diz". Manter marcas de MANUAL faria o rótulo
      // "ajustado à mão" ficar aceso sobre valores recém-vindos da lei.
      const todosDaZona: Record<string, 'ZONA' | 'MANUAL'> = {};
      for (const c of TODOS_OS_CAMPOS) todosDaZona[c] = 'ZONA';
      setOrigemDosValores(todosDaZona);

      void persistir({
        zona_origem: origemDaZona,
        // Só o caminho do catálogo precisa do mapa: é por ele que a zona é
        // relida para conferir se a lei mudou.
        regulatory_map_id: origemDaZona === 'CATALOGO' ? mapaId || null : null,
        empreendimento_id: empreendimentoId || null,
        regulatory_zone_id: zona.id,
        zona_rotulo: rotuloDaZona(zona),
        lei_referencia: zona.lei_referencia ?? null,
        recuo_frente_mm: novosRecuos.FRENTE,
        recuo_fundos_mm: novosRecuos.FUNDOS,
        recuo_lateral_direita_mm: novosRecuos.LATERAL_DIREITA,
        recuo_lateral_esquerda_mm: novosRecuos.LATERAL_ESQUERDA,
        taxa_ocupacao_max: lidos.taxaOcupacaoMax,
        taxa_permeabilidade_min: lidos.taxaPermeabilidadeMin,
        coeficiente_max: lidos.coeficienteMax,
        gabarito_altura_max_m: lidos.gabaritoAlturaMaxM,
        gabarito_pavimentos: lidos.gabaritoPavimentos,
        origem_valores: todosDaZona,
        aplicado_em: new Date().toISOString(),
      });
    },
    [zonas, empreendimentoId, mapaId, origemDaZona, persistir],
  );

  const desligar = useCallback(() => {
    setContexto(null);
    setOrigemDosValores({});
    setRecuos(RECUOS_ZERO);
    setLimites(SEM_LIMITES);
    if (persistenciaIndisponivel) return;
    blueprintUrbanContextService
      .clear(studyId)
      .catch((e) => console.warn('[zona urbanística] não deu para desligar:', e));
  }, [studyId, persistenciaIndisponivel]);

  // ── Ajuste manual ─────────────────────────────────────────────────────────

  const marcarManual = useCallback(
    (campo: CampoDaZona, patch: UrbanContextInput) => {
      setOrigemDosValores((o) => {
        const nova = { ...o, [campo]: 'MANUAL' as const };
        void persistir({ ...patch, origem_valores: nova });
        return nova;
      });
    },
    [persistir],
  );

  const ajustarRecuo = useCallback(
    (papel: keyof Recuos, mm: number) => {
      setRecuos((r) => ({ ...r, [papel]: mm }));
      marcarManual(CAMPO_DO_RECUO[papel], { [COLUNA_DO_RECUO[papel]]: mm } as UrbanContextInput);
    },
    [marcarManual],
  );

  const ajustarTaxaOcupacaoMax = useCallback(
    (v: number | null) => {
      setLimites((s) => ({ ...s, taxaOcupacaoMax: v }));
      marcarManual('taxa_ocupacao_max', { taxa_ocupacao_max: v });
    },
    [marcarManual],
  );

  const ajustarCoeficienteMax = useCallback(
    (v: number | null) => {
      setLimites((s) => ({ ...s, coeficienteMax: v }));
      marcarManual('coeficiente_max', { coeficiente_max: v });
    },
    [marcarManual],
  );

  // ── Derivados ─────────────────────────────────────────────────────────────

  const zonaAplicadaId = contexto?.regulatory_zone_id ?? null;
  const ajustadoAMao = useMemo(
    () => Object.values(origemDosValores).some((o) => o === 'MANUAL'),
    [origemDosValores],
  );

  const derivou = useMemo(() => {
    if (!zonaAplicadaId) return false;
    const zonaAtual = zonas.find((z) => z.id === zonaAplicadaId);
    // Zona de origem apagada — ou fora da lista carregada agora — não é deriva:
    // não há com o que comparar, e o estudo segue válido com o que já tinha.
    if (!zonaAtual) return false;
    return zonaDerivou({ recuoMm: recuos, ...limites }, origemDosValores, zonaAtual);
  }, [zonaAplicadaId, zonas, recuos, limites, origemDosValores]);

  return {
    origemDaZona,
    setOrigemDaZona,
    empreendimentoId,
    setEmpreendimentoId,
    cidade,
    setCidade,
    mapas,
    mapaId,
    setMapaId,
    carregandoMapas,
    zonas,
    carregandoZonas,
    recuos,
    ...limites,
    ajustarRecuo,
    ajustarTaxaOcupacaoMax,
    ajustarCoeficienteMax,
    aplicarZona,
    desligar,
    zonaAplicadaId,
    zonaRotuloSalvo: contexto?.zona_rotulo ?? null,
    ajustadoAMao,
    derivou,
    salvando,
    persistenciaIndisponivel,
  };
}
