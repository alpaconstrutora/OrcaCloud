import { useCallback, useEffect, useState } from 'react';
import {
  contarPaginasPdf,
  getUnderlay,
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
 * Estado da planta de fundo de um nível.
 *
 * Separado do `useBlueprintEditor` de propósito: o fundo NÃO é geometria e não
 * entra no histórico de desfazer. Misturar os dois faria "Desfazer" remover a
 * planta de referência — que o usuário nunca pediu para desenhar.
 */
export function useBlueprintUnderlay(
  studyId: string,
  organizationId: string,
  levelId: string | null,
) {
  const [linha, setLinha] = useState<UnderlayRow | null>(null);
  const [imagem, setImagem] = useState<HTMLImageElement | null>(null);
  const [opacidade, setOpacidade] = useState(0.55);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [totalPaginas, setTotalPaginas] = useState(1);

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

    getUnderlay(studyId, levelId)
      .then(async (r) => {
        if (cancelado) return;
        setLinha(r);
        if (!r) {
          setImagem(null);
          return;
        }
        setOpacidade(r.opacidade);
        await carregarImagem(r.storage_path);
      })
      .catch((e) => !cancelado && setErro(e instanceof Error ? e.message : String(e)));

    return () => {
      cancelado = true;
    };
  }, [studyId, levelId, carregarImagem]);

  /**
   * Importa imagem ou PDF.
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
          const r = await rasterizarPdf(arquivo, Math.min(Math.max(1, pagina), total));
          blob = r.blob;
          paginaGravada = Math.min(Math.max(1, pagina), total);
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
          file_sha256: sha256,
          pdf_pagina: paginaGravada,
          underlay: linha ? underlayDaLinha(linha) : UNDERLAY_NEUTRO,
          opacidade,
        });

        setLinha(salvo);
        await carregarImagem(storagePath);
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      } finally {
        setOcupado(false);
      }
    },
    [studyId, organizationId, levelId, linha, opacidade, carregarImagem],
  );

  /**
   * Aplica a aferição, pivotando no primeiro ponto para não arrastar o traçado.
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
          study_id: linha.study_id,
          organization_id: linha.organization_id,
          level_id: linha.level_id,
          storage_path: linha.storage_path,
          nome_arquivo: linha.nome_arquivo,
          file_sha256: linha.file_sha256 ?? '',
          pdf_pagina: linha.pdf_pagina,
          underlay: novo,
          calibracao: { p1, p2, distanciaMm, alinhado: alinhar },
          opacidade,
        });
        setLinha(salvo);
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
      setLinha(null);
      setImagem(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }, [linha]);

  return {
    linha,
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
