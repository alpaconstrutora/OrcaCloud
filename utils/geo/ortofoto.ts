/**
 * A3 — a ORTOFOTO do arquivo à planta de fundo posicionada, sem aferir.
 *
 * Aceita, de uma vez (seleção múltipla):
 *  - um GeoTIFF (a georreferência vem dentro), ou
 *  - uma imagem PNG/JPEG/TIFF + o world file (`.pgw`/`.jgw`/`.tfw`/`.wld`) e,
 *    opcionalmente, o `.prj` — sem `.prj`, vale o sistema declarado no lote
 *    ("Onde fica" › CRS); sem nenhum dos dois, a recusa diz o que falta.
 *
 * Recorta a área do lote + 30 m (a ortofoto de um bairro inteiro não precisa
 * subir para o banco para servir de fundo a um lote), converte em PNG e
 * devolve a planta de fundo pronta — é o `importarRaster` do hook que grava.
 *
 * Só no navegador (canvas, createImageBitmap).
 */
import type { Georreferencia, Point } from '../blueprintKernel';
import { lerCrs, type DefinicaoDeCrs } from './crs';
import { crsDoWkt, encaixarOrtofoto, janelaDoRaster, lerWorldFile, pngDoRaster, rasterNoMundo, type EncaixeDaOrtofoto, type Janela, type RasterNoMundo } from './raster';
import { lerTiff, type Tiff } from './tiff';
import type { Underlay } from '../blueprintUnderlay';

export const MARGEM_DA_ORTOFOTO_MM = 30_000;
/** Sem lote para recortar, o arquivo inteiro sobe — até este tamanho. */
const MAX_PIXELS_SEM_RECORTE = 25_000_000;

export interface OrtofotoPreparada {
  blob: Blob;
  nome: string;
  underlay: Underlay;
  largura: number;
  encaixe: EncaixeDaOrtofoto;
  crs: string;
  janela: Janela;
}

const ext = (n: string) => n.toLowerCase().slice(n.lastIndexOf('.'));

export async function prepararOrtofoto(arquivos: File[], georreferencia: Georreferencia | null, anel: Point[] | null, crsDoLote: string | null | undefined): Promise<OrtofotoPreparada> {
  if (!georreferencia) throw new Error('A ortofoto cai no lugar pela georreferência do lote: informe latitude/longitude em "Onde fica" antes.');
  const imagem = arquivos.find((f) => ['.tif', '.tiff', '.png', '.jpg', '.jpeg'].includes(ext(f.name)));
  if (!imagem) throw new Error('Nenhuma imagem entre os arquivos: escolha o GeoTIFF, ou a imagem (PNG/JPEG/TIFF) junto com o world file.');
  const mundo = arquivos.find((f) => ['.tfw', '.pgw', '.jgw', '.wld', '.tifw', '.pngw', '.jpgw'].includes(ext(f.name)));
  const prj = arquivos.find((f) => ext(f.name) === '.prj');
  const ehTiff = ['.tif', '.tiff'].includes(ext(imagem.name));

  let tiff: Tiff | null = null;
  let bitmap: ImageBitmap | null = null;
  let largura: number;
  let altura: number;
  if (ehTiff) {
    tiff = await lerTiff(await imagem.arrayBuffer());
    largura = tiff.largura;
    altura = tiff.altura;
  } else {
    bitmap = await createImageBitmap(imagem);
    largura = bitmap.width;
    altura = bitmap.height;
  }

  const crsDeFora = async (): Promise<DefinicaoDeCrs | null> => {
    if (prj) {
      const c = crsDoWkt(await prj.text());
      if (!c) throw new Error(`O ${prj.name} não é de um sistema que a Planta lê. Reprojete para SIRGAS 2000 / UTM.`);
      return c;
    }
    return lerCrs(crsDoLote).crs;
  };

  let r: RasterNoMundo;
  if (mundo) {
    const crs = await crsDeFora();
    if (!crs) throw new Error(`O world file (${mundo.name}) não diz o sistema de coordenadas: junte o .prj, ou informe o CRS do lote em "Onde fica".`);
    r = { afim: lerWorldFile(await mundo.text()), crs, largura, altura };
  } else if (tiff) {
    r = rasterNoMundo(tiff, prj ? await crsDeFora() : null);
  } else {
    throw new Error(`"${imagem.name}" não tem georreferência dentro: junte o world file (${ext(imagem.name) === '.png' ? '.pgw' : '.jgw'}) e o .prj.`);
  }

  let janela: Janela | null;
  if (anel && anel.length >= 3) {
    janela = janelaDoRaster(r, georreferencia, anel, MARGEM_DA_ORTOFOTO_MM);
    if (!janela) throw new Error(`A ortofoto (${r.crs.nome}) não cobre o lote. Confira o sistema de coordenadas do arquivo e a georreferência do lote.`);
  } else {
    if (largura * altura > MAX_PIXELS_SEM_RECORTE) throw new Error('Ortofoto grande demais para subir inteira: feche o contorno do lote antes — ela é recortada na área dele.');
    janela = { col0: 0, lin0: 0, largura, altura };
  }

  const encaixe = encaixarOrtofoto(r, georreferencia, janela);
  let blob: Blob;
  if (tiff) {
    blob = await pngDoRaster(tiff, janela);
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = janela.largura;
    canvas.height = janela.altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('O navegador não abriu um canvas para recortar a ortofoto.');
    ctx.drawImage(bitmap!, janela.col0, janela.lin0, janela.largura, janela.altura, 0, 0, janela.largura, janela.altura);
    bitmap!.close?.();
    blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('A conversão para PNG falhou.'))), 'image/png'));
  }
  return { blob, nome: imagem.name, underlay: encaixe.underlay, largura: janela.largura, encaixe, crs: r.crs.codigo, janela };
}
