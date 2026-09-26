import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sha256, stableStringify, type Georreferencia, type Point } from '../utils/blueprintKernel';
import type { BlueprintTopografiaRow } from '../types/blueprint';
import {
  blueprintTopografiaService,
  type TopografiaInput,
} from '../services/blueprintTopografiaService';
import { baixarArtefatos } from '../services/blueprintExportService';
import { camadasDaTopografia } from '../utils/geo/exportacaoGis';
import { kmzDoKml, zipDeShapefiles } from '../utils/geo/shapefile';
import { blueprintLevantamentoService } from '../services/blueprintLevantamentoService';
import {
  contarFeicoes,
  csvDoLevantamento,
  duplicados as acharDuplicados,
  fichaDaFeicao,
  kmlDoLevantamento,
  linhasDasFeicoes,
  semDuplicadosDePosicao,
  type ContagemDeFeicoes,
  type Duplicado,
  type IdDaFeicao,
  type LinhaDeFeicao,
  type PontoDeLevantamento,
} from '../utils/blueprintFeicoes';
import {
  ALGORITMO_TOPOGRAFIA,
  amostrarLevantamento,
  amostrarPontosCotados,
  type LinhaDeQuebra,
  type TinImportada,
  espacamentoPorQualidade,
  caixaDoAnel,
  equidistanciaEquivalente,
  estatisticasDoTerreno,
  faixaDeCotas,
  gerarCurvas,
  gerarCurvasNosNiveis,
  hashDaEntrada,
  lerListaDeNiveis,
  niveisPersonalizados,
  niveisPorIntervalo,
  niveisPorNumero,
  hashDoResultado,
  localParaGeo,
  nosDaGrade,
  planejarGrade,
  sugerirEquidistancia,
  verificarResolucao,
  type ModoDeNiveis,
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
  avisoDaVersao,
  csvDaGrade,
  kmlDasCurvas,
  nomeDoArquivoDeTopografia,
  svgDasCurvas,
  type CoresDaExportacao,
  type ExtrasDaTopografia,
  type ProvenienciaDaVersao,
} from '../utils/blueprintTopografiaExport';
import { gerarDxfDaTopografia } from '../utils/blueprintDxf';
import type { EmissaoExecutiva } from '../utils/blueprintTopografiaExecutivo';
import { supabase } from '../lib/supabase';

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

/** De onde vieram os pontos cotados, quando de arquivo. */
export interface OrigemDosPontos {
  arquivo: string;
  formato: string;
  sha256: string;
  quantos: number;
  /** A3: a fonte que o arquivo escolhe (DEM grosso = DEM_ARQUIVO, preliminar). Ausente = Pontos cotados. */
  fonte?: CodigoDaFonte;
}

export interface LevantamentoEmEdicao {
  linhas: LinhaDeFeicao[];
  contagem: ContagemDeFeicoes;
  duplicados: Duplicado[];
  /** Tira os repetidos por POSIÇÃO (o nome repetido é outro ponto; fica para a pessoa). */
  removerDuplicados: () => void;
  /** Acrescenta pontos gerados (pontuar/interpolar) ao fim da lista. */
  acrescentarPontos: (pontos: PontoDeLevantamento[]) => void;
  exportar: (formato: 'csv' | 'kml' | 'dxf') => void;
  feicoesOcultas: ReadonlySet<IdDaFeicao>;
  alternarFeicao: (id: IdDaFeicao) => void;
  /** VAZIO = nada a gravar; INDISPONIVEL = sem a tabela (sem a migration), só em memória. */
  estado: 'VAZIO' | 'SALVANDO' | 'SALVO' | 'INDISPONIVEL';
  id: string | null;
}

export interface Topografia {
  fontes: readonly FonteDeElevacao[];
  fonteCodigo: CodigoDaFonte;
  setFonteCodigo: (c: CodigoDaFonte) => void;
  fonte: FonteDeElevacao;

  /** A2: com nome, código e descrição quando o levantamento traz. */
  pontosCotados: PontoDeLevantamento[];
  adicionarPonto: () => void;
  alterarPonto: (indice: number, patch: Partial<PontoDeLevantamento>) => void;
  removerPonto: (indice: number) => void;
  /** Um ponto por vértice do lote, com cota zero para o usuário preencher. */
  usarVerticesDoLote: () => void;
  /**
   * Fase 9: pontos vindos de ARQUIVO (CSV/TXT, GeoJSON, KML, DXF, SVG). A
   * origem fica na proveniência da próxima versão (nome e hash do arquivo —
   * RF-014, checksum do insumo). `modo` acrescenta aos digitados ou substitui.
   */
  definirPontosCotados: (
    pontos: PontoDeLevantamento[],
    origem: OrigemDosPontos | null,
    modo: 'SUBSTITUIR' | 'ACRESCENTAR',
    /** Fase 15: as linhas de quebra e a TIN que vieram no mesmo arquivo. */
    extras?: { linhasDeQuebra?: LinhaDeQuebra[]; tinImportada?: TinImportada | null },
  ) => void;
  origemDosPontos: OrigemDosPontos | null;
  /**
   * Fase 15. As linhas de quebra são por coordenada e sobrevivem a editar
   * pontos; a TIN importada é por índice e some ao editar, acrescentar ou
   * remover qualquer ponto (o painel diz isso).
   */
  linhasDeQuebra: LinhaDeQuebra[];
  tinImportada: TinImportada | null;
  limparQuebrasETin: () => void;
  /** O que a importação precisa saber do desenho. */
  anelDoLote: Point[] | null;
  georreferencia: Georreferencia | null;
  /**
   * A2: o levantamento em edição — persistido em `blueprint_study_levantamento`
   * (sobrevive a recarregar), as feições pelos códigos, duplicados e
   * exportações. Opcional na interface só para os fixtures antigos.
   */
  levantamento?: LevantamentoEmEdicao;

  qualidade: QualidadeDaGrade;
  setQualidade: (q: QualidadeDaGrade) => void;
  /** `null` = usar a sugestão. */
  equidistanciaM: number | null;
  setEquidistanciaM: (v: number | null) => void;
  /** Sugerida pela amplitude conhecida (última versão ou pontos cotados). */
  sugestaoEquidistanciaM: number | null;
  /**
   * Fase 12 (o que o Contour Map Creator oferece): como escolher os níveis —
   * equidistância (cotas redondas), número de níveis entre mín. e máx., ou
   * uma lista — e se as curvas cobrem só o lote ou o retângulo inteiro dele.
   */
  modoNiveis: ModoDeNiveis;
  setModoNiveis: (m: ModoDeNiveis) => void;
  numeroDeNiveis: number;
  setNumeroDeNiveis: (n: number) => void;
  /** O texto digitado ("380, 400, 420"); é lido na hora de gerar. */
  niveisTexto: string;
  setNiveisTexto: (t: string) => void;
  areaDasCurvas: 'LOTE' | 'RETANGULO';
  setAreaDasCurvas: (a: 'LOTE' | 'RETANGULO') => void;

  gerar: () => Promise<void>;
  gerando: boolean;
  erro: string | null;

  versoes: BlueprintTopografiaRow[];
  selecionada: BlueprintTopografiaRow | null;
  selecionar: (id: string | null) => void;
  apagarVersao: (id: string) => Promise<void>;
  /** `extras` (fase 8): drenagem traçada e muros, que vão no KML e no DXF por cima das curvas; `cores` (fase 12): a rampa arco-íris no SVG e no KML. */
  /** A3: `kmz` (o KML zipado) e `shp` (zip de shapefiles: curvas, pontos, lote, drenagem, lotes). */
  exportar: (formato: 'svg' | 'csv' | 'kml' | 'dxf' | 'kmz' | 'shp', extras?: ExtrasDaTopografia & { cores?: CoresDaExportacao; executivo?: EmissaoExecutiva | null }) => void;

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
  const [pontosCotados, setPontosCotados] = useState<PontoDeLevantamento[]>([]);
  // A2: o levantamento em edição persistido; `revisao` sobe a cada mexida do usuário.
  const [levantamentoId, setLevantamentoId] = useState<string | null>(null);
  const [estadoLev, setEstadoLev] = useState<LevantamentoEmEdicao['estado']>('VAZIO');
  const [revisao, setRevisao] = useState(0);
  const [feicoesOcultas, setFeicoesOcultas] = useState<ReadonlySet<IdDaFeicao>>(new Set());
  const marcar = useCallback(() => setRevisao((r) => r + 1), []);
  const [origemDosPontos, setOrigemDosPontos] = useState<OrigemDosPontos | null>(null);
  const [linhasDeQuebra, setLinhasDeQuebra] = useState<LinhaDeQuebra[]>([]);
  const [tinImportada, setTinImportada] = useState<TinImportada | null>(null);
  const [qualidade, setQualidade] = useState<QualidadeDaGrade>('EQUILIBRADA');
  const [equidistanciaM, setEquidistanciaM] = useState<number | null>(null);
  const [modoNiveis, setModoNiveis] = useState<ModoDeNiveis>('EQUIDISTANCIA');
  const [numeroDeNiveis, setNumeroDeNiveis] = useState(7);
  const [niveisTexto, setNiveisTexto] = useState('');
  const [areaDasCurvas, setAreaDasCurvas] = useState<'LOTE' | 'RETANGULO'>('LOTE');
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
          setModoNiveis(ultima.modo_niveis ?? 'EQUIDISTANCIA');
          if (ultima.modo_niveis === 'NUMERO' && ultima.niveis_m) setNumeroDeNiveis(ultima.niveis_m.length);
          if (ultima.modo_niveis === 'PERSONALIZADO' && ultima.niveis_m) setNiveisTexto(ultima.niveis_m.join(', '));
          if (ultima.pontos_cotados.length > 0) setPontosCotados(ultima.pontos_cotados);
          setLinhasDeQuebra(ultima.linhas_de_quebra ?? []);
          setTinImportada(ultima.tin_importada ?? null);
        }
        // A2: o levantamento em edição, se houver, é o que a pessoa deixou na
        // tela — vale mais que os insumos da última versão (pode ter mexido depois).
        try {
          const lev = await blueprintLevantamentoService.get(studyId);
          if (!vivo) return;
          if (lev) {
            setLevantamentoId(lev.id);
            if (lev.pontos.length > 0) {
              setPontosCotados(lev.pontos);
              setLinhasDeQuebra(lev.linhas_de_quebra ?? []);
              setTinImportada(null);
              setOrigemDosPontos(lev.origem ?? null);
              setFonteCodigo((lev.origem as OrigemDosPontos | null)?.fonte ?? 'PONTOS_COTADOS');
            }
            setEstadoLev('SALVO');
          }
        } catch (e) {
          if (!vivo) return;
          setEstadoLev('INDISPONIVEL');
          console.warn('[topografia] levantamento sem persistência:', e);
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

  // A TIN importada indexa os pontos: qualquer mexida na lista a invalida.
  const adicionarPonto = useCallback(() => {
    setPontosCotados((ps) => [...ps, { x: 0, y: 0, cotaM: 0 }]);
    setTinImportada(null);
    marcar();
  }, [marcar]);

  const definirPontosCotados = useCallback(
    (
      pontos: PontoDeLevantamento[],
      origem: OrigemDosPontos | null,
      modo: 'SUBSTITUIR' | 'ACRESCENTAR',
      extras: { linhasDeQuebra?: LinhaDeQuebra[]; tinImportada?: TinImportada | null } = {},
    ) => {
      // A2: nome, código e descrição viajam junto (antes eram descartados aqui).
      const limpos: PontoDeLevantamento[] = pontos.map((p) => ({
        x: Math.round(p.x),
        y: Math.round(p.y),
        cotaM: p.cotaM,
        ...(p.nome ? { nome: p.nome } : {}),
        ...(p.codigo ? { codigo: p.codigo } : {}),
        ...(p.descricao ? { descricao: p.descricao } : {}),
      }));
      const linhas = (extras.linhasDeQuebra ?? []).map((l) => ({
        pontos: l.pontos.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), cotaM: p.cotaM })),
      }));
      if (modo === 'ACRESCENTAR') {
        setPontosCotados((ps) => [...ps, ...limpos]);
        setLinhasDeQuebra((ls) => [...ls, ...linhas]);
        // Acrescentar desloca os índices que uma TIN (a existente ou a nova)
        // aponta: nenhuma das duas continua válida.
        setTinImportada(null);
      } else {
        setPontosCotados(limpos);
        setLinhasDeQuebra(linhas);
        setTinImportada(extras.tinImportada ?? null);
      }
      setOrigemDosPontos(origem);
      setFonteCodigo(origem?.fonte ?? 'PONTOS_COTADOS');
      marcar();
    },
    [marcar],
  );

  const alterarPonto = useCallback((indice: number, patch: Partial<PontoDeLevantamento>) => {
    setPontosCotados((ps) => ps.map((p, i) => (i === indice ? { ...p, ...patch } : p)));
    setTinImportada(null);
    marcar();
  }, [marcar]);

  const removerPonto = useCallback((indice: number) => {
    setPontosCotados((ps) => ps.filter((_, i) => i !== indice));
    setTinImportada(null);
    marcar();
  }, [marcar]);

  const usarVerticesDoLote = useCallback(() => {
    if (!anel) return;
    // Cota ZERO a preencher, não a cota da georreferência: espalhar o mesmo
    // número em todos os vértices desenharia um terreno plano com ar de medido.
    setPontosCotados(anel.map((p) => ({ x: p.x, y: p.y, cotaM: 0 })));
    setLinhasDeQuebra([]);
    setTinImportada(null);
    marcar();
  }, [anel, marcar]);

  const limparQuebrasETin = useCallback(() => {
    setLinhasDeQuebra([]);
    setTinImportada(null);
    marcar();
  }, [marcar]);

  // ── A2: gravação do levantamento em edição ──────────────────────────────
  // Refs para a gravação atrasada ler o estado MAIS NOVO, não o da mexida que a agendou.
  const estadoParaGravar = useRef({ pontosCotados, linhasDeQuebra, origemDosPontos });
  estadoParaGravar.current = { pontosCotados, linhasDeQuebra, origemDosPontos };
  const levantamentoIndisponivel = persistenciaIndisponivel || estadoLev === 'INDISPONIVEL';
  const salvarLevantamento = useCallback(async (): Promise<string | null> => {
    if (levantamentoIndisponivel) return null;
    const { pontosCotados: ps, linhasDeQuebra: ls, origemDosPontos: og } = estadoParaGravar.current;
    try {
      const row = await blueprintLevantamentoService.save(studyId, organizationId, {
        pontos: ps,
        linhas_de_quebra: ls,
        hash_pontos: sha256(stableStringify(ps.map((p) => ({ x: p.x, y: p.y, cotaM: p.cotaM })))),
        origem: og,
      });
      setLevantamentoId(row.id);
      setEstadoLev('SALVO');
      return row.id;
    } catch (e) {
      console.warn('[topografia] levantamento não gravou:', e);
      setEstadoLev('INDISPONIVEL');
      return null;
    }
  }, [levantamentoIndisponivel, studyId, organizationId]);
  // Com respiro: a cota se digita dígito a dígito, e a importação chega de uma vez.
  useEffect(() => {
    if (revisao === 0 || levantamentoIndisponivel) return;
    setEstadoLev('SALVANDO');
    const t = setTimeout(() => void salvarLevantamento(), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisao]);

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
      // RETÂNGULO: as curvas cobrem a caixa do lote inteira, como no Contour
      // Map Creator (que amostra um retângulo NW–SE). A grade é a mesma; só o
      // recorte e as estatísticas mudam — e o anel gravado é o que valeu.
      const anelDasCurvas: Point[] =
        areaDasCurvas === 'RETANGULO'
          ? (() => {
              const c = caixaDoAnel(anel);
              return [
                { x: c.minX, y: c.minY },
                { x: c.maxX, y: c.minY },
                { x: c.maxX, y: c.maxY },
                { x: c.minX, y: c.maxY },
              ];
            })()
          : anel;
      let grade = planejarGrade(anel, espacamentoMm);
      // A2: a versão guarda e "hasheia" só {x, y, cota} — nome, código e
      // descrição ficam no levantamento, e as versões antigas continuam conferíveis.
      const soCotas: PontoCotado[] = pontosCotados.map((p) => ({ x: p.x, y: p.y, cotaM: p.cotaM }));
      // E a versão aponta o levantamento de onde saiu: grava o que estiver pendente antes.
      const levantamentoDaVersao = fonte.tipo === 'LOCAL' && pontosCotados.length > 0 ? ((await salvarLevantamento()) ?? levantamentoId) : null;

      if (fonte.tipo === 'LOCAL') {
        if (pontosCotados.length < 3) {
          throw new Error('Informe ao menos três pontos cotados, não alinhados.');
        }
        // Fase 15: a TIN importada quando há, senão os pontos com as linhas
        // de quebra, senão a TIN pura (`amostrarPontosCotados`).
        const r = amostrarLevantamento(grade, pontosCotados, { linhasDeQuebra, tinImportada });
        grade = r.grade;
        avisos.push(...r.avisos);
      } else {
        if (!georreferencia) {
          throw new Error(
            'Esta fonte precisa saber onde o lote fica: informe latitude e longitude em "Onde fica".',
          );
        }
        const resolucao = verificarResolucao(anel, fonte.resolucaoNominalM ?? 0);
        if (!resolucao.ok) throw new Error(resolucao.mensagem ?? 'Lote pequeno demais para a fonte.');
        const coords = nosDaGrade(grade).map((n) => localParaGeo(n, georreferencia));
        // Fonte atrás de Edge Function (SRTM 30 m): o cliente do Supabase leva
        // o JWT; a function é que fala com o provedor sem CORS.
        const cotas = await amostrarRemoto(fonte, coords, fetch, (nome, corpo) =>
          supabase.functions.invoke(nome, { body: corpo as Record<string, unknown> }),
        );
        grade = { ...grade, cotasM: cotas };
      }

      const previa = estatisticasDoTerreno(grade, anelDasCurvas, []);
      if (previa.amostrasValidas === 0) {
        throw new Error('Nenhuma cota válida caiu dentro do lote.');
      }
      // Os níveis, nos quatro modos. `equid` é o que a coluna NOT NULL guarda:
      // a equidistância (ou o intervalo) pedida, ou o menor passo entre os
      // níveis escolhidos.
      let equid = equidistanciaM ?? sugerirEquidistancia(previa.amplitudeM).sugestaoM;
      let curvas;
      let niveisM: number[] | null = null;
      if (modoNiveis === 'EQUIDISTANCIA') {
        curvas = gerarCurvas(grade, anelDasCurvas, equid);
      } else {
        const faixa = faixaDeCotas(grade, anelDasCurvas);
        if (!faixa) throw new Error('Nenhuma cota válida caiu dentro do lote.');
        niveisM =
          modoNiveis === 'NUMERO'
            ? niveisPorNumero(faixa.minM, faixa.maxM, numeroDeNiveis)
            : modoNiveis === 'INTERVALO'
              ? niveisPorIntervalo(faixa.minM, faixa.maxM, equid)
              : niveisPersonalizados(lerListaDeNiveis(niveisTexto), faixa.minM, faixa.maxM);
        if (niveisM.length === 0) {
          throw new Error(
            modoNiveis === 'NUMERO'
              ? 'Terreno plano demais para dividir em níveis.'
              : modoNiveis === 'INTERVALO'
                ? `Intervalo de ${equid} m não cabe entre ${previa.cotaMinM.toFixed(2)} e ${previa.cotaMaxM.toFixed(2)} m. Diminua o intervalo.`
                : `Nenhum nível da lista cai entre ${previa.cotaMinM.toFixed(2)} e ${previa.cotaMaxM.toFixed(2)} m.`,
          );
        }
        // No intervalo o passo é o pedido; nos outros, o menor passo entre os níveis.
        if (modoNiveis !== 'INTERVALO') equid = equidistanciaEquivalente(niveisM, faixa.minM, faixa.maxM);
        // Poucos níveis escolhidos à mão: todos saem grossos e com a cota escrita.
        curvas = gerarCurvasNosNiveis(grade, anelDasCurvas, niveisM, () => true);
      }
      const estatisticas = estatisticasDoTerreno(grade, anelDasCurvas, curvas);
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
        // Pontos vindos de arquivo: o insumo entra na proveniência com nome e
        // checksum (RF-014), para a versão ser rastreável até o levantamento.
        dataset_versao:
          fonte.tipo === 'LOCAL' && origemDosPontos
            ? `arquivo ${origemDosPontos.arquivo} (${origemDosPontos.formato}, sha256 ${origemDosPontos.sha256.slice(0, 16)}, ${origemDosPontos.quantos} pontos` +
              (linhasDeQuebra.length > 0 ? `, ${linhasDeQuebra.length} linhas de quebra` : '') +
              (tinImportada ? `, TIN de ${tinImportada.faces.length / 3} faces` : '') +
              ')'
            : fonte.datasetVersao,
        resolucao_fonte_m: fonte.resolucaoNominalM,
        referencia_vertical: fonte.referenciaVertical,
        classe_qualidade: fonte.classe,
        grade,
        equidistancia_m: equid,
        modo_niveis: modoNiveis,
        niveis_m: niveisM,
        curvas,
        estatisticas,
        pontos_cotados: fonte.tipo === 'LOCAL' ? soCotas : [],
        linhas_de_quebra: fonte.tipo === 'LOCAL' ? linhasDeQuebra : [],
        tin_importada: fonte.tipo === 'LOCAL' ? tinImportada : null,
        // Só quando existe: sem a migration a coluna não está lá, e o insert com ela falharia.
        ...(levantamentoDaVersao ? { levantamento_id: levantamentoDaVersao } : {}),
        anel: anelDasCurvas,
        georreferencia,
        algoritmo_nome: ALGORITMO_TOPOGRAFIA.nome,
        algoritmo_versao: ALGORITMO_TOPOGRAFIA.versao,
        hash_entrada: hashDaEntrada({
          fonteCodigo: fonte.codigo,
          datasetVersao: fonte.tipo === 'LOCAL' && origemDosPontos ? origemDosPontos.sha256 : fonte.datasetVersao,
          anel: anelDasCurvas,
          georreferencia,
          espacamentoMm,
          equidistanciaM: equid,
          pontosCotados: fonte.tipo === 'LOCAL' ? soCotas : [],
          modoNiveis,
          niveisM,
          // `undefined` quando não há: a chave some do hash e as versões
          // antigas continuam conferíveis.
          linhasDeQuebra: fonte.tipo === 'LOCAL' && linhasDeQuebra.length > 0 ? linhasDeQuebra : undefined,
          tinImportada: fonte.tipo === 'LOCAL' && tinImportada ? tinImportada : undefined,
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
    origemDosPontos,
    linhasDeQuebra,
    tinImportada,
    georreferencia,
    equidistanciaM,
    modoNiveis,
    numeroDeNiveis,
    niveisTexto,
    areaDasCurvas,
    studyId,
    organizationId,
    versoes,
    persistenciaIndisponivel,
    salvarLevantamento,
    levantamentoId,
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
    (formato: 'svg' | 'csv' | 'kml' | 'dxf' | 'kmz' | 'shp', extras: ExtrasDaTopografia & { cores?: CoresDaExportacao; executivo?: EmissaoExecutiva | null } = {}) => {
      if (!selecionada) return;
      // KML sem georreferência não tem onde pôr o lote no mundo. O botão já
      // vem desabilitado; isto é a rede de segurança.
      if ((formato === 'kml' || formato === 'kmz') && !selecionada.georreferencia) return;
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
        // Fase 17: com a emissão executiva válida, o aviso das exportações é a ART.
        executivo: extras.executivo ?? null,
      };
      // A3: os dois formatos zipados (pizzip entra por import dinâmico → assíncronos).
      if (formato === 'kmz' || formato === 'shp') {
        const versao = selecionada;
        void (async () => {
          try {
            if (formato === 'kmz') {
              const kml = kmlDasCurvas(versao.curvas, versao.anel, { ...prov, georreferencia: versao.georreferencia! }, versao.pontos_cotados, extras);
              const bytes = await kmzDoKml(kml);
              baixarArtefatos([{ blob: new Blob([bytes as BlobPart], { type: 'application/vnd.google-earth.kmz' }), nome: nomeDoArquivoDeTopografia(nomeDoEstudo, versao.versao, 'kmz'), tipo: 'kmz' }]);
              return;
            }
            // Pontos com NOME (o levantamento em edição) quando é a fonte local; senão, os da versão.
            const pontos = fonteDeElevacao(versao.fonte_codigo as CodigoDaFonte).tipo === 'LOCAL' && pontosCotados.length > 0 ? pontosCotados : versao.pontos_cotados;
            const { camadas, georreferenciado } = camadasDaTopografia(
              {
                curvas: versao.curvas.map((c) => ({ cotaM: c.cotaM, mestra: !!c.mestra, pontos: c.pontos })),
                pontos,
                anel: versao.anel,
                drenagem: extras.drenagem?.map((d) => ({ nome: d.nome, tipo: d.tipo ?? '', pontos: d.pontos })),
                lotes: extras.lotes,
              },
              versao.georreferencia,
            );
            const bytes = await zipDeShapefiles(camadas);
            // Sem georreferência, o NOME avisa: coordenadas locais, sem .prj.
            const nome = nomeDoArquivoDeTopografia(georreferenciado ? nomeDoEstudo : `${nomeDoEstudo} - coordenadas LOCAIS`, versao.versao, 'shp.zip');
            baixarArtefatos([{ blob: new Blob([bytes as BlobPart], { type: 'application/zip' }), nome, tipo: 'shp' }]);
          } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
          }
        })();
        return;
      }
      const conteudo =
        formato === 'svg'
          ? svgDasCurvas(selecionada.curvas, selecionada.anel, prov, {
              pontosCotados: selecionada.pontos_cotados,
              prancha: true,
              cores: extras.cores ? { ...extras.cores, grade: selecionada.grade } : undefined,
            })
          : formato === 'csv'
            ? csvDaGrade(selecionada.grade, prov)
            : formato === 'kml'
              ? kmlDasCurvas(
                  selecionada.curvas,
                  selecionada.anel,
                  { ...prov, georreferencia: selecionada.georreferencia! },
                  selecionada.pontos_cotados,
                  extras,
                )
              : gerarDxfDaTopografia(
                  {
                    curvas: selecionada.curvas,
                    pontosCotados: selecionada.pontos_cotados,
                    drenagem: extras.drenagem,
                    muros: extras.muros,
                  },
                  selecionada.anel,
                  { titulo: nomeDoEstudo, versao: selecionada.versao, aviso: avisoDaVersao(prov) },
                );
      const tipo =
        formato === 'svg'
          ? 'image/svg+xml'
          : formato === 'csv'
            ? 'text/csv'
            : formato === 'kml'
              ? 'application/vnd.google-earth.kml+xml'
              : 'application/dxf';
      baixarArtefatos([
        {
          blob: new Blob([conteudo], { type: `${tipo};charset=utf-8` }),
          nome: nomeDoArquivoDeTopografia(nomeDoEstudo, selecionada.versao, formato),
          tipo: formato,
        },
      ]);
    },
    [selecionada, nomeDoEstudo, pontosCotados],
  );

  // ── A2: o que o painel e o canvas usam do levantamento ────────────────────
  const linhasDeFeicao = useMemo(() => linhasDasFeicoes(pontosCotados), [pontosCotados]);
  const contagemDeFeicoes = useMemo(() => contarFeicoes(pontosCotados), [pontosCotados]);
  const duplicadosDoLevantamento = useMemo(() => acharDuplicados(pontosCotados), [pontosCotados]);
  const exportarLevantamento = useCallback(
    (formato: 'csv' | 'kml' | 'dxf') => {
      if (pontosCotados.length === 0) return;
      if (formato === 'kml' && !georreferencia) return;
      const titulo = `${nomeDoEstudo} - levantamento`;
      const conteudo =
        formato === 'csv'
          ? csvDoLevantamento(pontosCotados)
          : formato === 'kml'
            ? kmlDoLevantamento(pontosCotados, georreferencia!, titulo)
            : gerarDxfDaTopografia(
                {
                  curvas: [],
                  pontosCotados: pontosCotados.map((p) => ({ x: p.x, y: p.y, cotaM: p.cotaM, nome: p.nome })),
                  feicoes: linhasDeFeicao.map((l) => ({ camada: fichaDaFeicao(l.feicao).camadaDxf, pontos: l.pontos })),
                },
                anel ?? [],
                { titulo, versao: 0, aviso: 'Levantamento em edicao - pontos como importados/digitados, sem superficie gerada.' },
              );
      const tipo = formato === 'csv' ? 'text/csv' : formato === 'kml' ? 'application/vnd.google-earth.kml+xml' : 'application/dxf';
      baixarArtefatos([
        { blob: new Blob([conteudo], { type: `${tipo};charset=utf-8` }), nome: `${titulo.replace(/[\\/:*?"<>|]+/g, '-')}.${formato}`, tipo: formato },
      ]);
    },
    [pontosCotados, georreferencia, nomeDoEstudo, linhasDeFeicao, anel],
  );
  const levantamento = useMemo<LevantamentoEmEdicao>(
    () => ({
      linhas: linhasDeFeicao,
      contagem: contagemDeFeicoes,
      duplicados: duplicadosDoLevantamento,
      removerDuplicados: () => {
        setPontosCotados((ps) => semDuplicadosDePosicao(ps));
        setTinImportada(null);
        marcar();
      },
      acrescentarPontos: (novos) => {
        if (novos.length === 0) return;
        setPontosCotados((ps) => [...ps, ...novos]);
        setTinImportada(null);
        // Acrescentar a um DEM importado não muda a classe dele.
        setFonteCodigo((f) => (fonteDeElevacao(f).tipo === 'LOCAL' ? f : 'PONTOS_COTADOS'));
        marcar();
      },
      exportar: exportarLevantamento,
      feicoesOcultas,
      alternarFeicao: (id) =>
        setFeicoesOcultas((s) => {
          const n = new Set(s);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        }),
      estado: levantamentoIndisponivel ? 'INDISPONIVEL' : estadoLev,
      id: levantamentoId,
    }),
    [linhasDeFeicao, contagemDeFeicoes, duplicadosDoLevantamento, exportarLevantamento, feicoesOcultas, levantamentoIndisponivel, estadoLev, levantamentoId, marcar],
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
    definirPontosCotados,
    origemDosPontos,
    linhasDeQuebra,
    tinImportada,
    limparQuebrasETin,
    anelDoLote: anel,
    georreferencia,
    levantamento,
    qualidade,
    setQualidade,
    equidistanciaM,
    setEquidistanciaM,
    sugestaoEquidistanciaM,
    modoNiveis,
    setModoNiveis,
    numeroDeNiveis,
    setNumeroDeNiveis,
    niveisTexto,
    setNiveisTexto,
    areaDasCurvas,
    setAreaDasCurvas,
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
