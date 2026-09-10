import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Georreferencia, Point } from '../utils/blueprintKernel';
import type { BlueprintTopografiaRow } from '../types/blueprint';
import {
  blueprintTopografiaService,
  type TopografiaInput,
} from '../services/blueprintTopografiaService';
import { baixarArtefatos } from '../services/blueprintExportService';
import {
  ALGORITMO_TOPOGRAFIA,
  amostrarPontosCotados,
  espacamentoPorQualidade,
  estatisticasDoTerreno,
  gerarCurvas,
  hashDaEntrada,
  hashDoResultado,
  localParaGeo,
  nosDaGrade,
  planejarGrade,
  sugerirEquidistancia,
  verificarResolucao,
  type PontoCotado,
  type QualidadeDaGrade,
} from '../utils/blueprintTopografia';
import {
  amostrarRemoto,
  FONTES,
  fonteDeElevacao,
  FonteIndisponivel,
  type CodigoDaFonte,
  type FonteDeElevacao,
} from '../utils/blueprintElevacaoProvedores';
import {
  csvDaGrade,
  nomeDoArquivoDeTopografia,
  svgDasCurvas,
  type ProvenienciaDaVersao,
} from '../utils/blueprintTopografiaExport';

/**
 * A topografia do estudo: fonte, pontos cotados, geração e versões.
 *
 * ─── POR QUE UM HOOK, E NÃO MAIS ESTADO NO EDITOR ───────────────────────────
 *
 * Mesmo motivo de `useBlueprintZonaUrbanistica`: é um assunto fechado — escolher
 * fonte, amostrar, gerar curvas, guardar, listar versões — com estado que só
 * conversa consigo mesmo, e o editor já passa de 6.000 linhas.
 *
 * ─── O CÁLCULO NÃO MORA AQUI ────────────────────────────────────────────────
 *
 * `gerar` só ORQUESTRA: grade → fonte → curvas → estatísticas → hashes →
 * persistir. Cada passo é uma função pura de `utils/blueprintTopografia.ts`,
 * testada com as fixtures do PRD. O que este hook decide é a ordem e o que
 * dizer quando um passo recusa.
 *
 * ─── DEGRADA SEM A MIGRATION ────────────────────────────────────────────────
 *
 * `aplicar_20270921000005` é aplicada à mão, e o deploy publica só o front.
 * Entre um e outro, a tabela não existe: a leitura falha, `persistenciaIndisponivel`
 * liga, e as versões geradas vivem só em memória — o usuário vê as curvas,
 * perde ao recarregar, e o painel diz isso.
 */

export interface Topografia {
  fontes: readonly FonteDeElevacao[];
  fonteCodigo: CodigoDaFonte;
  setFonteCodigo: (c: CodigoDaFonte) => void;
  fonte: FonteDeElevacao;

  pontosCotados: PontoCotado[];
  adicionarPonto: () => void;
  alterarPonto: (indice: number, patch: Partial<PontoCotado>) => void;
  removerPonto: (indice: number) => void;
  /** Um ponto por vértice do lote, com cota zero para o usuário preencher. */
  usarVerticesDoLote: () => void;

  qualidade: QualidadeDaGrade;
  setQualidade: (q: QualidadeDaGrade) => void;
  /** `null` = usar a sugestão. */
  equidistanciaM: number | null;
  setEquidistanciaM: (v: number | null) => void;
  /** Sugerida pela amplitude conhecida (última versão ou pontos cotados). */
  sugestaoEquidistanciaM: number | null;

  gerar: () => Promise<void>;
  gerando: boolean;
  erro: string | null;

  versoes: BlueprintTopografiaRow[];
  selecionada: BlueprintTopografiaRow | null;
  selecionar: (id: string | null) => void;
  apagarVersao: (id: string) => Promise<void>;
  exportar: (formato: 'svg' | 'csv') => void;

  carregando: boolean;
  persistenciaIndisponivel: boolean;
}

let contadorLocal = 0;

export function useBlueprintTopografia(
  studyId: string,
  organizationId: string,
  nomeDoEstudo: string,
  /** O anel do lote FECHADO, em mm; `null` sem lote ou com contorno aberto. */
  anel: Point[] | null,
  georreferencia: Georreferencia | null,
): Topografia {
  const [fonteCodigo, setFonteCodigo] = useState<CodigoDaFonte>('PONTOS_COTADOS');
  const [pontosCotados, setPontosCotados] = useState<PontoCotado[]>([]);
  const [qualidade, setQualidade] = useState<QualidadeDaGrade>('EQUILIBRADA');
  const [equidistanciaM, setEquidistanciaM] = useState<number | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [versoes, setVersoes] = useState<BlueprintTopografiaRow[]>([]);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [persistenciaIndisponivel, setPersistencia] = useState(false);

  const fonte = useMemo(() => fonteDeElevacao(fonteCodigo), [fonteCodigo]);

  // Carrega as versões. Falha = tabela ainda não existe → segue em memória.
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    (async () => {
      try {
        const lista = await blueprintTopografiaService.listar(studyId);
        if (!vivo) return;
        setVersoes(lista);
        const ultima = lista[0] ?? null;
        setSelecionadaId(ultima?.id ?? null);
        if (ultima) {
          // A última versão devolve os seus insumos para a tela: o usuário
          // continua de onde parou em vez de redigitar os pontos.
          setFonteCodigo(ultima.fonte_codigo as CodigoDaFonte);
          setEquidistanciaM(ultima.equidistancia_m);
          if (ultima.pontos_cotados.length > 0) setPontosCotados(ultima.pontos_cotados);
        }
      } catch (e) {
        if (!vivo) return;
        setPersistencia(true);
        console.warn('[topografia] persistência indisponível:', e);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [studyId]);

  const selecionada = useMemo(
    () => versoes.find((v) => v.id === selecionadaId) ?? null,
    [versoes, selecionadaId],
  );

  const sugestaoEquidistanciaM = useMemo(() => {
    if (selecionada) return sugerirEquidistancia(selecionada.estatisticas.amplitudeM).sugestaoM;
    if (pontosCotados.length >= 2) {
      const cotas = pontosCotados.map((p) => p.cotaM);
      return sugerirEquidistancia(Math.max(...cotas) - Math.min(...cotas)).sugestaoM;
    }
    return null;
  }, [selecionada, pontosCotados]);

  const adicionarPonto = useCallback(() => {
    setPontosCotados((ps) => [...ps, { x: 0, y: 0, cotaM: 0 }]);
  }, []);

  const alterarPonto = useCallback((indice: number, patch: Partial<PontoCotado>) => {
    setPontosCotados((ps) => ps.map((p, i) => (i === indice ? { ...p, ...patch } : p)));
  }, []);

  const removerPonto = useCallback((indice: number) => {
    setPontosCotados((ps) => ps.filter((_, i) => i !== indice));
  }, []);

  const usarVerticesDoLote = useCallback(() => {
    if (!anel) return;
    // Cota ZERO a preencher, não a cota da georreferência: espalhar o mesmo
    // número em todos os vértices desenharia um terreno plano com ar de medido.
    setPontosCotados(anel.map((p) => ({ x: p.x, y: p.y, cotaM: 0 })));
  }, [anel]);

  const gerar = useCallback(async () => {
    setErro(null);
    if (!anel) {
      setErro('Desenhe e feche o lote antes de gerar as curvas.');
      return;
    }
    setGerando(true);
    try {
      const { espacamentoMm, avisos } = espacamentoPorQualidade(
        anel,
        qualidade,
        fonte.resolucaoNominalM,
      );
      let grade = planejarGrade(anel, espacamentoMm);

      if (fonte.tipo === 'LOCAL') {
        if (pontosCotados.length < 3) {
          throw new Error('Informe ao menos três pontos cotados, não alinhados.');
        }
        grade = amostrarPontosCotados(grade, pontosCotados);
      } else {
        if (!georreferencia) {
          throw new Error(
            'Esta fonte precisa saber onde o lote fica: informe latitude e longitude em "Onde fica".',
          );
        }
        const resolucao = verificarResolucao(anel, fonte.resolucaoNominalM ?? 0);
        if (!resolucao.ok) throw new Error(resolucao.mensagem ?? 'Lote pequeno demais para a fonte.');
        const coords = nosDaGrade(grade).map((n) => localParaGeo(n, georreferencia));
        const cotas = await amostrarRemoto(fonte, coords);
        grade = { ...grade, cotasM: cotas };
      }

      const previa = estatisticasDoTerreno(grade, anel, []);
      if (previa.amostrasValidas === 0) {
        throw new Error('Nenhuma cota válida caiu dentro do lote.');
      }
      const equid = equidistanciaM ?? sugerirEquidistancia(previa.amplitudeM).sugestaoM;
      const curvas = gerarCurvas(grade, anel, equid);
      const estatisticas = estatisticasDoTerreno(grade, anel, curvas);
      if (estatisticas.amostrasAusentes > 0) {
        avisos.push(
          `${estatisticas.amostrasAusentes} de ${estatisticas.amostrasNoLote} amostras dentro do lote sem cota — ` +
            'as curvas param onde falta dado.',
        );
      }

      const input: TopografiaInput = {
        study_id: studyId,
        organization_id: organizationId,
        versao: (versoes[0]?.versao ?? 0) + 1,
        fonte_codigo: fonte.codigo,
        fonte_nome: fonte.nome,
        dataset_versao: fonte.datasetVersao,
        resolucao_fonte_m: fonte.resolucaoNominalM,
        referencia_vertical: fonte.referenciaVertical,
        classe_qualidade: fonte.classe,
        grade,
        equidistancia_m: equid,
        curvas,
        estatisticas,
        pontos_cotados: fonte.tipo === 'LOCAL' ? pontosCotados : [],
        anel,
        georreferencia,
        algoritmo_nome: ALGORITMO_TOPOGRAFIA.nome,
        algoritmo_versao: ALGORITMO_TOPOGRAFIA.versao,
        hash_entrada: hashDaEntrada({
          fonteCodigo: fonte.codigo,
          datasetVersao: fonte.datasetVersao,
          anel,
          georreferencia,
          espacamentoMm,
          equidistanciaM: equid,
          pontosCotados: fonte.tipo === 'LOCAL' ? pontosCotados : [],
        }),
        hash_resultado: hashDoResultado(grade, curvas),
        avisos,
      };

      let linha: BlueprintTopografiaRow;
      if (persistenciaIndisponivel) {
        contadorLocal += 1;
        linha = {
          ...input,
          id: `local-${contadorLocal}`,
          created_by: null,
          created_at: new Date().toISOString(),
        };
      } else {
        linha = await blueprintTopografiaService.criar(input);
      }
      setVersoes((vs) => [linha, ...vs]);
      setSelecionadaId(linha.id);
      setEquidistanciaM(equid);
    } catch (e) {
      if (e instanceof FonteIndisponivel) {
        setErro(`${e.message}. Tente de novo em instantes ou troque a fonte.`);
      } else {
        setErro(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setGerando(false);
    }
  }, [
    anel,
    qualidade,
    fonte,
    pontosCotados,
    georreferencia,
    equidistanciaM,
    studyId,
    organizationId,
    versoes,
    persistenciaIndisponivel,
  ]);

  const apagarVersao = useCallback(
    async (id: string) => {
      setErro(null);
      try {
        if (!id.startsWith('local-') && !persistenciaIndisponivel) {
          await blueprintTopografiaService.apagar(id);
        }
        setVersoes((vs) => {
          const resto = vs.filter((v) => v.id !== id);
          setSelecionadaId((atual) => (atual === id ? (resto[0]?.id ?? null) : atual));
          return resto;
        });
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      }
    },
    [persistenciaIndisponivel],
  );

  const exportar = useCallback(
    (formato: 'svg' | 'csv') => {
      if (!selecionada) return;
      const prov: ProvenienciaDaVersao = {
        nomeDoEstudo,
        versao: selecionada.versao,
        fonte: fonteDeElevacao(selecionada.fonte_codigo as CodigoDaFonte),
        classe: selecionada.classe_qualidade,
        equidistanciaM: selecionada.equidistancia_m,
        geradoEm: selecionada.created_at,
        hashResultado: selecionada.hash_resultado,
        estatisticas: selecionada.estatisticas,
        georreferencia: selecionada.georreferencia,
      };
      const conteudo =
        formato === 'svg'
          ? svgDasCurvas(selecionada.curvas, selecionada.anel, prov, {
              pontosCotados: selecionada.pontos_cotados,
              prancha: true,
            })
          : csvDaGrade(selecionada.grade, prov);
      const tipo = formato === 'svg' ? 'image/svg+xml' : 'text/csv';
      baixarArtefatos([
        {
          blob: new Blob([conteudo], { type: `${tipo};charset=utf-8` }),
          nome: nomeDoArquivoDeTopografia(nomeDoEstudo, selecionada.versao, formato),
          tipo: formato,
        },
      ]);
    },
    [selecionada, nomeDoEstudo],
  );

  return {
    fontes: FONTES,
    fonteCodigo,
    setFonteCodigo,
    fonte,
    pontosCotados,
    adicionarPonto,
    alterarPonto,
    removerPonto,
    usarVerticesDoLote,
    qualidade,
    setQualidade,
    equidistanciaM,
    setEquidistanciaM,
    sugestaoEquidistanciaM,
    gerar,
    gerando,
    erro,
    versoes,
    selecionada,
    selecionar: setSelecionadaId,
    apagarVersao,
    exportar,
    carregando,
    persistenciaIndisponivel,
  };
}
