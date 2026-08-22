import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EmpreendimentoRegulatoryZone } from '../types/empreendimento';
import type { BlueprintUrbanContext } from '../types/blueprint';
import { empreendimentoService } from '../services/empreendimentoService';
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
} from '../utils/blueprintZonaUrbanistica';

/**
 * Os parâmetros urbanísticos do estudo: de onde vêm, o que está em vigor.
 *
 * ─── POR QUE UM HOOK, E NÃO MAIS ESTADO NO EDITOR ───────────────────────────
 *
 * `BlueprintEditor` passa de 1.800 linhas. Isto aqui é um assunto fechado —
 * escolher zona, traduzir a lei, guardar, detectar deriva — com quatro pedaços
 * de estado que só conversam entre si. Deixá-lo lá dentro seria somar ruído a um
 * arquivo que já é o mais difícil do módulo.
 *
 * ─── DEGRADA SEM A MIGRATION ────────────────────────────────────────────────
 *
 * ⚠️ `aplicar_20270914000000` é aplicada À MÃO no SQL Editor, e o deploy da
 * Vercel publica só o front. Entre um e outro existe uma janela em que a tabela
 * não existe. Se o `get` explodisse, o painel de terreno inteiro morreria por
 * causa de um recurso novo. Então falha de persistência vira
 * `persistenciaIndisponivel` e o editor segue funcionando em memória, como
 * funcionava antes desta feature.
 */

export interface ZonaUrbanistica {
  /** Empreendimento escolhido — serve à zona E ao write-back de área. */
  empreendimentoId: string;
  setEmpreendimentoId: (id: string) => void;
  zonas: EmpreendimentoRegulatoryZone[];
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

export function useBlueprintZonaUrbanistica(
  studyId: string,
  organizationId: string,
  /** Sugestão vinda da obra do estudo. Só vale enquanto ninguém escolheu nada. */
  empreendimentoSugerido: string | null,
): ZonaUrbanistica {
  const [empreendimentoId, setEmpreendimentoIdBruto] = useState('');
  const [zonas, setZonas] = useState<EmpreendimentoRegulatoryZone[]>([]);
  const [carregandoZonas, setCarregandoZonas] = useState(false);

  const [recuos, setRecuos] = useState<Recuos>(RECUOS_ZERO);
  const [valores, setValores] = useState<Omit<ValoresDaZona, 'recuoMm'>>({
    taxaOcupacaoMax: null,
    coeficienteMax: null,
    gabaritoAlturaMaxM: null,
    gabaritoPavimentos: null,
    taxaPermeabilidadeMin: null,
  });

  const [contexto, setContexto] = useState<BlueprintUrbanContext | null>(null);
  const [origem, setOrigem] = useState<Record<string, 'ZONA' | 'MANUAL'>>({});
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
        if (!vivo) return;
        if (!ctx) return;

        setContexto(ctx);
        setOrigem(ctx.origem_valores ?? {});
        setRecuos({
          FRENTE: ctx.recuo_frente_mm ?? 0,
          FUNDOS: ctx.recuo_fundos_mm ?? 0,
          LATERAL_DIREITA: ctx.recuo_lateral_direita_mm ?? 0,
          LATERAL_ESQUERDA: ctx.recuo_lateral_esquerda_mm ?? 0,
        });
        setValores({
          taxaOcupacaoMax: ctx.taxa_ocupacao_max,
          coeficienteMax: ctx.coeficiente_max,
          gabaritoAlturaMaxM: ctx.gabarito_altura_max_m,
          gabaritoPavimentos: ctx.gabarito_pavimentos,
          taxaPermeabilidadeMin: ctx.taxa_permeabilidade_min,
        });
        if (ctx.empreendimento_id) {
          escolheuAMao.current = true;
          setEmpreendimentoIdBruto(ctx.empreendimento_id);
        }
      } catch (e) {
        // Sem a migration aplicada, seguir em memória — ver o cabeçalho.
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

  // ── Zonas do empreendimento escolhido ─────────────────────────────────────
  useEffect(() => {
    if (!empreendimentoId) {
      setZonas([]);
      return;
    }
    let vivo = true;
    setCarregandoZonas(true);
    empreendimentoService
      .listRegulatoryZones(empreendimentoId)
      .then((z) => vivo && setZonas(z))
      .catch((e) => {
        if (vivo) setZonas([]);
        console.warn('[zona urbanística] não deu para listar as zonas:', e);
      })
      .finally(() => vivo && setCarregandoZonas(false));
    return () => {
      vivo = false;
    };
  }, [empreendimentoId]);

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
      setValores({
        taxaOcupacaoMax: lidos.taxaOcupacaoMax,
        coeficienteMax: lidos.coeficienteMax,
        gabaritoAlturaMaxM: lidos.gabaritoAlturaMaxM,
        gabaritoPavimentos: lidos.gabaritoPavimentos,
        taxaPermeabilidadeMin: lidos.taxaPermeabilidadeMin,
      });

      // Aplicar zera os ajustes manuais anteriores: é a ação explícita de dizer
      // "quero o que a lei diz". Manter marcas de MANUAL aqui faria o rótulo
      // "ajustado à mão" ficar aceso sobre valores que acabaram de vir da lei.
      const todosDaZona: Record<string, 'ZONA' | 'MANUAL'> = {};
      for (const c of Object.values(CAMPO_DO_RECUO)) todosDaZona[c] = 'ZONA';
      for (const c of [
        'taxa_ocupacao_max',
        'coeficiente_max',
        'gabarito_altura_max',
        'gabarito_pavimentos',
        'taxa_permeabilidade_min',
      ] as CampoDaZona[]) {
        todosDaZona[c] = 'ZONA';
      }
      setOrigem(todosDaZona);

      void persistir({
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
    [zonas, empreendimentoId, persistir],
  );

  const desligar = useCallback(() => {
    setContexto(null);
    setOrigem({});
    setRecuos(RECUOS_ZERO);
    setValores({
      taxaOcupacaoMax: null,
      coeficienteMax: null,
      gabaritoAlturaMaxM: null,
      gabaritoPavimentos: null,
      taxaPermeabilidadeMin: null,
    });
    if (persistenciaIndisponivel) return;
    blueprintUrbanContextService
      .clear(studyId)
      .catch((e) => console.warn('[zona urbanística] não deu para desligar:', e));
  }, [studyId, persistenciaIndisponivel]);

  // ── Ajuste manual ─────────────────────────────────────────────────────────

  const marcarManual = useCallback(
    (campo: CampoDaZona, patch: UrbanContextInput) => {
      setOrigem((o) => {
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
      const coluna = {
        FRENTE: 'recuo_frente_mm',
        FUNDOS: 'recuo_fundos_mm',
        LATERAL_DIREITA: 'recuo_lateral_direita_mm',
        LATERAL_ESQUERDA: 'recuo_lateral_esquerda_mm',
      }[papel];
      marcarManual(CAMPO_DO_RECUO[papel], { [coluna]: mm } as UrbanContextInput);
    },
    [marcarManual],
  );

  const ajustarTaxaOcupacaoMax = useCallback(
    (v: number | null) => {
      setValores((s) => ({ ...s, taxaOcupacaoMax: v }));
      marcarManual('taxa_ocupacao_max', { taxa_ocupacao_max: v });
    },
    [marcarManual],
  );

  const ajustarCoeficienteMax = useCallback(
    (v: number | null) => {
      setValores((s) => ({ ...s, coeficienteMax: v }));
      marcarManual('coeficiente_max', { coeficiente_max: v });
    },
    [marcarManual],
  );

  // ── Derivados ─────────────────────────────────────────────────────────────

  const zonaAplicadaId = contexto?.regulatory_zone_id ?? null;
  const ajustadoAMao = useMemo(
    () => Object.values(origem).some((o) => o === 'MANUAL'),
    [origem],
  );

  const derivou = useMemo(() => {
    if (!zonaAplicadaId) return false;
    const zonaAtual = zonas.find((z) => z.id === zonaAplicadaId);
    // Zona de origem apagada não é deriva: não há com o que comparar, e o
    // estudo continua válido com os números que já tinha.
    if (!zonaAtual) return false;
    return zonaDerivou({ recuoMm: recuos, ...valores }, origem, zonaAtual);
  }, [zonaAplicadaId, zonas, recuos, valores, origem]);

  return {
    empreendimentoId,
    setEmpreendimentoId,
    zonas,
    carregandoZonas,
    recuos,
    ...valores,
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
