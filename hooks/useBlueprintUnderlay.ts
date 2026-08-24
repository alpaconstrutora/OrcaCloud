import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  achatarSegmentos,
  carregarVetor,
  contarPaginasPdf,
  desachatarArcos,
  desachatarSegmentos,
  extrairSegmentosPdf,
  listarUnderlays,
  rasterizarPdf,
  removerUnderlay,
  salvarUnderlay,
  salvarVetor,
  temArcos,
  underlayDaLinha,
  uploadUnderlay,
  urlAssinada,
  type UnderlayRow,
} from '../services/blueprintUnderlayService';
import type { ArcoBezier, ParaPixel, SegmentoVetor } from '../utils/blueprintVetor';
import {
  UNDERLAY_NEUTRO,
  aplicarEscalaDeclarada,
  calibrar,
  type PontoPx,
  type Underlay,
} from '../utils/blueprintUnderlay';

/**
 * Estado das plantas de fundo de um nível.
 *
 * Separado do `useBlueprintEditor` de propósito: o fundo NÃO é geometria e não
 * entra no histórico de desfazer. Misturar os dois faria "Desfazer" remover a
 * planta de referência — que o usuário nunca pediu para desenhar.
 *
 * SÃO VÁRIAS, e uma está ativa. Um levantamento percorre térreo, cobertura,
 * corte e fachada; cada prancha tem a própria aferição, e é por isso que a
 * medição aponta para a prancha e não só para o nível — recalibrar a cobertura
 * não pode mexer no que foi traçado no térreo.
 */
export function useBlueprintUnderlay(
  studyId: string,
  organizationId: string,
  levelId: string | null,
) {
  const [linhas, setLinhas] = useState<UnderlayRow[]>([]);
  const [ativaId, setAtivaId] = useState<string | null>(null);
  const [imagem, setImagem] = useState<HTMLImageElement | null>(null);
  const [opacidade, setOpacidade] = useState(0.55);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const linha = useMemo(
    () => linhas.find((l) => l.id === ativaId) ?? null,
    [linhas, ativaId],
  );
  const underlay: Underlay | null = linha ? underlayDaLinha(linha) : null;

  const carregarImagem = useCallback(async (path: string) => {
    const url = await urlAssinada(path);
    const img = new Image();
    // Sem isto o canvas fica "sujo" e `toBlob`/`getImageData` passam a lançar —
    // o que quebraria a exportação PNG e o harness de verificação.
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('não foi possível carregar a planta de fundo'));
      img.src = url;
    });
    setImagem(img);
  }, []);

  useEffect(() => {
    let cancelado = false;
    if (!studyId) return;

    listarUnderlays(studyId, levelId)
      .then((rs) => {
        if (cancelado) return;
        setLinhas(rs);
        setAtivaId(rs[0]?.id ?? null);
      })
      .catch((e) => !cancelado && setErro(e instanceof Error ? e.message : String(e)));

    return () => {
      cancelado = true;
    };
  }, [studyId, levelId]);

  // A imagem acompanha a prancha ativa. Fica num efeito próprio, e não dentro
  // de quem troca a seleção, porque são três os caminhos que trocam a ativa
  // (carregar, importar, remover) e cada um teria de lembrar de recarregar.
  useEffect(() => {
    let cancelado = false;
    if (!linha) {
      setImagem(null);
      return;
    }
    setOpacidade(linha.opacidade);
    carregarImagem(linha.storage_path).catch(
      (e) => !cancelado && setErro(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelado = true;
    };
  }, [linha, carregarImagem]);

  /**
   * ACRESCENTA uma prancha — importar nunca substitui.
   *
   * O PDF é rasterizado ANTES de subir: guardar o PDF e rasterizar a cada
   * abertura deixaria a página escolhida fora do registro, e duas pessoas
   * poderiam traçar sobre páginas diferentes do mesmo arquivo achando que veem
   * a mesma planta.
   */
  const importar = useCallback(
    async (arquivo: File, pagina: number) => {
      setOcupado(true);
      setErro(null);
      try {
        const ehPdf = arquivo.type === 'application/pdf';
        let blob: Blob = arquivo;
        let paginaGravada: number | null = null;

        if (ehPdf) {
          const total = await contarPaginasPdf(arquivo);
          setTotalPaginas(total);
          const p = Math.min(Math.max(1, pagina), total);
          const r = await rasterizarPdf(arquivo, p);
          blob = r.blob;
          paginaGravada = p;
        } else {
          setTotalPaginas(1);
        }

        const { storagePath, sha256 } = await uploadUnderlay(
          blob,
          organizationId,
          studyId,
          arquivo.name,
        );

        // ── O VETOR, guardado ao lado da imagem ──────────────────────────
        //
        // Rasterizar joga o vetor fora, e é o vetor que diz onde estão as
        // paredes. Guardá-lo aqui é o que dispensa apontar o mesmo PDF de novo
        // na aba "Do PDF" — o arquivo só passa por aqui uma vez, e é agora.
        //
        // ⚠️ DEPOIS do upload da imagem e dentro do próprio `try` de fora, mas
        // com erro engolido: se a extração falhar (PDF protegido, operador
        // exótico, folha grande demais), a importação da planta de fundo TEM de
        // continuar valendo. A aba cai no caminho antigo, que continua lá.
        if (ehPdf && paginaGravada !== null) {
          try {
            const vetor = await extrairSegmentosPdf(arquivo, paginaGravada);
            await salvarVetor(
              storagePath,
              achatarSegmentos(
                vetor.segmentos,
                vetor.larguraPt,
                vetor.alturaPt,
                vetor.paraPixel,
                vetor.arcos,
              ),
            );
          } catch {
            /* o fundo já subiu; o vetor é conveniência */
          }
        }

        // Nasce SEM aferição: `mmPorPixel = 1` é obviamente errado, e é essa
        // obviedade que empurra o usuário a aferir antes de traçar. Chutar uma
        // escala plausível seria pior — sairia um desenho que parece certo.
        const salvo = await salvarUnderlay({
          study_id: studyId,
          organization_id: organizationId,
          level_id: levelId,
          storage_path: storagePath,
          nome_arquivo: arquivo.name,
          // A PÁGINA VEM NA FRENTE. Ela é o que distingue uma prancha da outra
          // num PDF de quatro páginas, e o seletor da barra trunca o fim do
          // nome — com a página no fim, as quatro entradas apareciam como
          // "PROJETO INICIAL-REGULARIZ…", idênticas. O discriminador tem de
          // ficar do lado que sobrevive à truncagem.
          nome: paginaGravada ? `p.${paginaGravada} · ${arquivo.name}` : arquivo.name,
          ordem: linhas.length,
          file_sha256: sha256,
          pdf_pagina: paginaGravada,
          underlay: UNDERLAY_NEUTRO,
          opacidade,
        });

        // §22 do guia: acrescenta ao array local em vez de recarregar a lista.
        setLinhas((atual) => [...atual, salvo]);
        setAtivaId(salvo.id);
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      } finally {
        setOcupado(false);
      }
    },
    [studyId, organizationId, levelId, linhas.length, opacidade],
  );

  /**
   * Aplica a aferição na prancha ativa, pivotando no primeiro ponto para não
   * arrastar o traçado.
   *
   * DEVOLVE a escala nova. Quem chama precisa dela imediatamente — as medições
   * já traçadas têm de ser transformadas da antiga para a nova — e ler
   * `underlay` do estado logo depois entregaria o valor VELHO: o React só
   * atualiza o closure na próxima renderização.
   */
  const aplicarCalibracao = useCallback(
    async (
      p1: PontoPx,
      p2: PontoPx,
      distanciaMm: number,
      alinhar: boolean,
    ): Promise<Underlay | null> => {
      if (!linha) return null;
      setOcupado(true);
      setErro(null);
      try {
        const novo = calibrar({
          p1,
          p2,
          distanciaMm,
          alinharHorizontal: alinhar,
          anterior: underlayDaLinha(linha),
        });

        const salvo = await salvarUnderlay({
          id: linha.id,
          study_id: linha.study_id,
          organization_id: linha.organization_id,
          level_id: linha.level_id,
          storage_path: linha.storage_path,
          nome_arquivo: linha.nome_arquivo,
          nome: linha.nome,
          ordem: linha.ordem,
          file_sha256: linha.file_sha256 ?? '',
          pdf_pagina: linha.pdf_pagina,
          underlay: novo,
          calibracao: { p1, p2, distanciaMm, alinhado: alinhar },
          opacidade,
        });
        setLinhas((atual) => atual.map((l) => (l.id === salvo.id ? salvo : l)));
        return novo;
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [linha, opacidade],
  );

  /**
   * Declara a escala do desenho — sem clicar em nada.
   *
   * Para prancha vinda de PDF esta é a via CERTA, e a aferição por dois cliques
   * passa a ser o caminho de exceção (foto, escaneamento, ou conferência).
   * O raster é gerado pelo próprio sistema a 150 dpi conhecidos; o único
   * desconhecido é o denominador, que está escrito na prancha.
   *
   * Medido em 22/08/2026: aferir 1,10 m a 1:100 dá 65 px de vão, o clique caiu
   * em 64, e 1 px virou 1,45% — o bastante para partir a parede de 20 cm entre
   * 20 e 21 cm na geração. Declarada, a escala tem erro ZERO.
   *
   * ⚠️ APAGA os `calib_*`. Não é descuido: eles significam "esta cota foi
   * clicada", e mantê-los ao lado de uma escala declarada faria a tela mostrar
   * uma medição que não vale mais e que ninguém refez.
   */
  const declararEscala = useCallback(
    async (denominador: number): Promise<Underlay | null> => {
      if (!linha) return null;
      setOcupado(true);
      setErro(null);
      try {
        const anterior = underlayDaLinha(linha);
        // Pivota no ponto que já servia de referência, se houver — assim o
        // traçado feito com a escala antiga não sai do lugar.
        const pivo: PontoPx =
          linha.calib_p1_px !== null && linha.calib_p1_py !== null
            ? { px: linha.calib_p1_px, py: linha.calib_p1_py }
            : { px: 0, py: 0 };

        const novo = aplicarEscalaDeclarada(denominador, anterior, pivo);

        const salvo = await salvarUnderlay({
          id: linha.id,
          study_id: linha.study_id,
          organization_id: linha.organization_id,
          level_id: linha.level_id,
          storage_path: linha.storage_path,
          nome_arquivo: linha.nome_arquivo,
          nome: linha.nome,
          ordem: linha.ordem,
          file_sha256: linha.file_sha256 ?? '',
          pdf_pagina: linha.pdf_pagina,
          underlay: novo,
          escalaDesenho: denominador,
          opacidade,
        });
        setLinhas((atual) => atual.map((l) => (l.id === salvo.id ? salvo : l)));
        return novo;
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [linha, opacidade],
  );

  const remover = useCallback(async () => {
    if (!linha) return;
    setOcupado(true);
    try {
      await removerUnderlay(linha.id);
      const restantes = linhas.filter((l) => l.id !== linha.id);
      setLinhas(restantes);
      setAtivaId(restantes[0]?.id ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }, [linha, linhas]);

  /**
   * O vetor guardado da prancha ativa, se houver.
   *
   * Sob demanda, e não num efeito: o arquivo tem centenas de kilobytes e só
   * interessa a quem abriu a aba "Do PDF". Buscar no carregamento cobraria de
   * todo mundo o custo de uma funcionalidade que a maioria não vai abrir.
   *
   * `null` é o caso NORMAL, não erro: prancha importada como imagem, prancha
   * importada antes desta versão, ou PDF cuja extração falhou.
   */
  const vetorDaPranchaAtiva = useCallback(async (): Promise<{
    segmentos: SegmentoVetor[];
    arcos: ArcoBezier[];
    /**
     * O formato guardado sabe de arcos? `false` num vetor v2 — e aí a lista de
     * arcos vazia significa "não sei", nunca "não tem porta".
     */
    temArcos: boolean;
    paraPixel: ParaPixel;
  } | null> => {
    if (!linha) return null;
    const v = await carregarVetor(linha.storage_path);
    if (!v) return null;
    return {
      segmentos: desachatarSegmentos(v),
      arcos: desachatarArcos(v),
      temArcos: temArcos(v),
      paraPixel: v.paraPixel,
    };
  }, [linha]);

  /**
   * Regrava o vetor da prancha ativa a partir de uma extração feita à mão.
   *
   * Serve à prancha cujo vetor guardado é de um formato antigo e foi
   * rejeitado: sem isto o usuário teria de apontar o PDF a cada visita, para
   * sempre. Com isto, aponta uma vez e a prancha volta a abrir pronta.
   *
   * Silencioso por decisão: é conveniência sobre conveniência, e falhar aqui
   * não pode atrapalhar quem acabou de conseguir extrair o vetor.
   */
  const regravarVetor = useCallback(
    async (
      segmentos: SegmentoVetor[],
      larguraPt: number,
      alturaPt: number,
      paraPixel: ParaPixel,
      arcos: ArcoBezier[] = [],
    ) => {
      if (!linha) return;
      try {
        await salvarVetor(
          linha.storage_path,
          achatarSegmentos(segmentos, larguraPt, alturaPt, paraPixel, arcos),
        );
      } catch {
        /* o vetor já está em memória; regravar é só para a próxima visita */
      }
    },
    [linha],
  );

  return {
    linhas,
    linha,
    ativaId,
    selecionar: setAtivaId,
    vetorDaPranchaAtiva,
    regravarVetor,
    imagem,
    underlay,
    opacidade,
    setOpacidade,
    ocupado,
    erro,
    totalPaginas,
    importar,
    aplicarCalibracao,
    declararEscala,
    remover,
    /**
     * `true` quando há fundo mas a escala não foi estabelecida por nenhuma das
     * duas vias — nem declarada, nem aferida. O traçado sairia fora de escala.
     */
    semAfericao:
      !!linha && linha.calib_distancia_mm === null && (linha.escala_desenho ?? null) === null,
  };
}
