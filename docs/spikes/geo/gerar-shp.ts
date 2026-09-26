/**
 * A3 — escreve um .zip de shapefiles com o NOSSO escritor, para o pyshp
 * (leitor independente) conferir em `conferir-shp.py`.
 *
 *   npx esbuild docs/spikes/geo/gerar-shp.ts --bundle --platform=node --format=esm --outfile=C:/tmp/gerar-shp.mjs
 *   node C:/tmp/gerar-shp.mjs C:/tmp/nosso.zip
 *   python docs/spikes/geo/conferir-shp.py C:/tmp/nosso.zip
 */
import { writeFileSync } from 'node:fs';
import { prjSirgasUtm, zipDeShapefiles } from '../../../utils/geo/shapefile';

const zip = await zipDeShapefiles([
  {
    nome: 'lote',
    tipo: 'POLIGONO',
    prj: prjSirgasUtm(23),
    feicoes: [{ partes: [[{ x: 611000, y: 7797000 }, { x: 611030, y: 7797000 }, { x: 611030, y: 7797020 }, { x: 611000, y: 7797020 }]], atributos: { nome: 'Lote Ação', area_m2: 600 } }],
  },
  {
    nome: 'curvas',
    tipo: 'LINHA',
    prj: prjSirgasUtm(23),
    feicoes: [
      { partes: [[{ x: 611000, y: 7797000, z: 800 }, { x: 611020, y: 7797005, z: 800 }]], atributos: { cota: 800, mestra: 'sim' } },
      { partes: [[{ x: 611000, y: 7797010, z: 800.5 }, { x: 611020, y: 7797015, z: 800.5 }]], atributos: { cota: 800.5, mestra: 'nao' } },
    ],
  },
  {
    nome: 'pontos',
    tipo: 'PONTO',
    prj: prjSirgasUtm(23),
    feicoes: [{ partes: [[{ x: 611001.5, y: 7797002.25, z: 800.125 }]], atributos: { nome: 'Poço', codigo: 'PV', cota: 800.125 } }],
  },
]);
writeFileSync(process.argv[2] ?? 'C:/tmp/nosso.zip', zip);
console.log('escrito', zip.length, 'bytes');
