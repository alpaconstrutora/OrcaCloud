/**
 * A3 — harness de NAVEGADOR da ortofoto e do DEM.
 *
 * O que o teste de unidade (Node) não cobre: o `DecompressionStream` do
 * navegador, o canvas que vira PNG e o `createImageBitmap`. Aqui o GeoTIFF do
 * fixture (escrito pelo PIL) passa pelo `prepararOrtofoto` DE VERDADE, o PNG
 * resultante é decodificado de volta, e o pixel sob a ORIGEM DO DESENHO é
 * lido: tem de ser o pixel (100, 50) do arquivo — cor (100, 50, 150).
 * O DEM (Deflate + float32) vira pontos pelo `resultadoDoDem`.
 *
 * Os números vão em `window.__a3` para `medir-a3.mjs`.
 */
import { prepararOrtofoto } from '../../../utils/geo/ortofoto';
import { projetadoParaGeo } from '../../../utils/geo/projecao';
import { crsDoEpsg } from '../../../utils/geo/raster';
import { lerTiff } from '../../../utils/geo/tiff';
import { resultadoDoDem } from '../../../utils/geo/importacaoGis';
import { modeloParaPixel } from '../../../utils/blueprintUnderlay';

const raiz = document.getElementById('raiz')!;
// A origem do desenho no canto do pixel (100, 50): 50 m a leste e 25 m ao sul do canto da imagem (pixel de 0,5 m).
const ll = projetadoParaGeo({ este: 611050, norte: 7796975 }, crsDoEpsg(31983)!).valor;
const GEO = { latitude: ll.lat, longitude: ll.lon, elevacaoM: 0 };
const ANEL = [
  { x: 0, y: 0 },
  { x: 20_000, y: 0 },
  { x: 20_000, y: 10_000 },
  { x: 0, y: 10_000 },
];

async function arquivo(nome: string, tipo: string): Promise<File> {
  const r = await fetch(`/__tests__/fixtures/geo/${nome}`);
  return new File([await r.arrayBuffer()], nome, { type: tipo });
}

async function rodar() {
  const saida: Record<string, unknown> = {};
  try {
    const o = await prepararOrtofoto([await arquivo('orto_rgb_lzw_31983.tif', 'image/tiff')], GEO, ANEL, null);
    const bmp = await createImageBitmap(o.blob);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    // Um quarto de pixel para dentro do canto (sul-leste no desenho = dentro do pixel na imagem).
    const q = o.underlay.mmPorPixel / 4;
    const px = modeloParaPixel(o.underlay, q, -q);
    const d = ctx.getImageData(Math.floor(px.px), Math.floor(px.py), 1, 1).data;
    saida.orto = {
      largura: bmp.width,
      altura: bmp.height,
      janela: o.janela,
      pixelM: o.encaixe.pixelM,
      residuoPx: o.encaixe.residuoPx,
      rotacaoMrad: o.underlay.rotacaoMrad,
      corNaOrigem: [d[0], d[1], d[2], d[3]],
      pixelDaOrigem: [Math.floor(px.px) + o.janela.col0, Math.floor(px.py) + o.janela.lin0],
    };
    c.style.width = `${bmp.width * 3}px`;
    raiz.innerHTML = '';
    const t = document.createElement('p');
    t.textContent = `Ortofoto: janela ${bmp.width}×${bmp.height} px, pixel ${o.encaixe.pixelM.toFixed(2)} m, desvio ${o.encaixe.residuoPx.toFixed(3)} px, giro ${((o.underlay.rotacaoMrad / 1000) * (180 / Math.PI)).toFixed(3)}°`;
    raiz.append(t, c);
  } catch (e) {
    saida.erroOrto = e instanceof Error ? e.message : String(e);
  }
  try {
    const r = await fetch('/__tests__/fixtures/geo/dem_f32_deflate_31983.tif');
    const dem = resultadoDoDem(await lerTiff(await r.arrayBuffer()), GEO, null);
    saida.dem = { pontos: dem.resultado.pontos.length, semValor: dem.resultado.detectado.linhasIgnoradas, preliminar: dem.preliminar };
    const t = document.createElement('p');
    t.textContent = `DEM: ${dem.resultado.pontos.length} pontos, ${dem.resultado.detectado.linhasIgnoradas} sem valor, ${dem.preliminar ? 'preliminar' : 'levantamento'}`;
    raiz.append(t);
  } catch (e) {
    saida.erroDem = e instanceof Error ? e.message : String(e);
  }
  (window as unknown as { __a3: unknown }).__a3 = saida;
}
void rodar();
