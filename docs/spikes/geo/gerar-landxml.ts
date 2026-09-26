/**
 * C3 — escreve um LandXML com o NOSSO escritor (loteamento de 3 vias, 2 lotes,
 * a gleba e a superfície de uma grade inclinada 2 % para o norte), para o
 * Python conferir com um parser XML de verdade em `conferir-landxml.py`.
 *
 *   npx esbuild docs/spikes/geo/gerar-landxml.ts --bundle --platform=node --format=esm --outfile=C:/tmp/gerar-landxml.mjs
 *   node C:/tmp/gerar-landxml.mjs C:/tmp/loteamento.xml
 *   python docs/spikes/geo/conferir-landxml.py C:/tmp/loteamento.xml
 */
import { writeFileSync } from 'node:fs';
import { landXmlDaTopografia } from '../../../utils/geo/landxml';

const colunas = 21;
const linhas = 13;
const cotasM: (number | null)[] = [];
for (let l = 0; l < linhas; l++) for (let c = 0; c < colunas; c++) cotasM.push(Math.round((800 + l * 5 * 0.02) * 1000) / 1000);
cotasM[0] = null;

const texto = landXmlDaTopografia({
  nomeDoProjeto: 'Loteamento Alvorada & Cia',
  superficie: { nome: 'Terreno v1', grade: { origem: { x: 0, y: 0 }, espacamentoMm: 5000, colunas, linhas, cotasM } },
  vias: [
    { nome: 'Rua A', eixo: [{ x: 0, y: 10_000 }, { x: 100_000, y: 10_000 }], greide: { pontos: [{ distM: 0, cotaM: 800.2 }, { distM: 50, cotaM: 800.9, curvaM: 30 }, { distM: 100, cotaM: 800.5 }] } },
    { nome: 'Rua B', eixo: [{ x: 0, y: 50_000 }, { x: 100_000, y: 50_000 }], greide: null },
    { nome: 'Rua C', eixo: [{ x: 50_000, y: 10_000 }, { x: 50_000, y: 50_000 }], greide: { pontos: [{ distM: 0, cotaM: 800.2 }, { distM: 40, cotaM: 801 }] } },
  ],
  gleba: { nome: 'Gleba', anel: [{ x: 0, y: 0 }, { x: 100_000, y: 0 }, { x: 100_000, y: 60_000 }, { x: 0, y: 60_000 }] },
  lotes: [
    { nome: 'Quadra A · Lote 1', anel: [{ x: 5000, y: 16_000 }, { x: 25_000, y: 16_000 }, { x: 25_000, y: 45_000 }, { x: 5000, y: 45_000 }] },
    { nome: 'Quadra A · Lote 2', anel: [{ x: 25_000, y: 16_000 }, { x: 45_000, y: 16_000 }, { x: 45_000, y: 45_000 }, { x: 25_000, y: 45_000 }] },
  ],
  paraSaida: (p) => ({ este: 611_000 + p.x / 1000, norte: 7_797_000 + p.y / 1000 }),
  sistema: { epsg: 31983, nome: 'SIRGAS 2000 / UTM 23S' },
});
writeFileSync(process.argv[2] ?? 'C:/tmp/loteamento.xml', texto);
console.log('escrito', texto.length, 'caracteres');
