import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  contarPaginasPdf,
  listarUnderlays,
  rasterizarPdf,
  removerUnderlay,
  salvarUnderlay,
  underlayDaLinha,
  uploadUnderlay,
  urlAssinada,
  type UnderlayRow,
} from '../services/blueprintUnderlayService';
import {
  UNDERLAY_NEUTRO,
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

        // Nasce SEM aferição: `mmPorPixel = 1` é obviamente errado, e é essa
        // obviedade que empurra o usuário a aferir antes de traçar. Chutar uma
        // escala plausível seria pior — sairia um desenho que parece certo.
        const salvo = await salvarUnderlay({
          study_id: studyId,
          organization_id: organizationId,
          level_id: levelId,
          storage_path: storagePath,
          nome_arquivo: arquivo.name,
          // A página entra no nome: um PDF de quatro pranchas geraria quatro
          // linhas chamadas "planta.pdf", e a lista não distinguiria nenhuma.
          nome: paginaGravada ? `${arquivo.name} · p.${paginaGravada}` : arquivo.name,
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

  return {
    linhas,
    linha,
    ativaId,
    selecionar: setAtivaId,
    imagem,
    underlay,
    opacidade,
    setOpacidade,
    ocupado,
    erro,
    totalPaginas,
    importar,
    aplicarCalibracao,
    remover,
    /** `true` quando há fundo mas ninguém aferiu — o traçado sairia fora de escala. */
    semAfericao: !!linha && linha.calib_distancia_mm === null,
  };
}
