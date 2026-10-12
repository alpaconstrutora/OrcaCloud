/**
 * Prancha com TODOS os tipos do catálogo pelo módulo REAL (`utils/blueprintSimbolosMobiliario.ts`), em 1:50 (com
 * detalhe) e 1:100 (versão limpa), em tamanho de impressão (12 px = 1 mm de papel). Conferência visual da F16.
 *
 *   npx esbuild docs/spikes/simbolos-2d/catalogo.ts --bundle --platform=node --format=esm --outfile=<tmp>/catalogo.mjs
 *   node <tmp>/catalogo.mjs docs/spikes/simbolos-2d/catalogo.svg
 */
import fs from 'node:fs';
import { CATALOGO_DE_COMPONENTES, TIPOS_DE_COMPONENTE } from '../../../utils/blueprintKernel';
import { linhasDoMobiliario, PENA_MM } from '../../../utils/blueprintSimbolosMobiliario';

const PX = 12;
const tipos = TIPOS_DE_COMPONENTE.filter((t) => CATALOGO_DE_COMPONENTES[t].simbolo !== 'CONJUNTO');
const colunas = 3;
const larg = (t: (typeof tipos)[number]) => (CATALOGO_DE_COMPONENTES[t].larguraMm * PX) / 50 + (CATALOGO_DE_COMPONENTES[t].larguraMm * PX) / 100 + 60;
const alt = (t: (typeof tipos)[number]) => (CATALOGO_DE_COMPONENTES[t].profundidadeMm * PX) / 50 + 90;
const celW = Math.max(...tipos.map(larg));
const linhas: (typeof tipos)[] = [];
for (let i = 0; i < tipos.length; i += colunas) linhas.push(tipos.slice(i, i + colunas));
const alturas = linhas.map((l) => Math.max(...l.map(alt)));
const partes: string[] = [];
const W = 40 * 2 + colunas * celW;
const H = 120 + alturas.reduce((s, v) => s + v, 0) + 40;
partes.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
partes.push(`<text x="40" y="52" font-family="Arial" font-size="26" font-weight="bold" fill="#111827">Mobiliário 2D (F16) — todos os tipos · 1:50 (com detalhe) e 1:100 (limpo)</text>`);
partes.push(`<text x="40" y="82" font-family="Arial" font-size="15" fill="#475569">Tamanho de impressão: ${PX} px = 1 mm de papel. Fundo da peça (encosto, cabeceira, caixa) para CIMA.</text>`);
let oy = 120;
linhas.forEach((linha, r) => {
  linha.forEach((tipo, c) => {
    const f = CATALOGO_DE_COMPONENTES[tipo];
    const ox = 40 + c * celW;
    partes.push(`<text x="${ox}" y="${oy + 18}" font-family="Arial" font-size="16" font-weight="bold" fill="#111827">${f.rotulo}</text>`);
    partes.push(`<text x="${ox}" y="${oy + 38}" font-family="Arial" font-size="13" fill="#64748b">${(f.larguraMm / 1000).toFixed(2).replace('.', ',')} × ${(f.profundidadeMm / 1000).toFixed(2).replace('.', ',')} m</text>`);
    let x = ox;
    for (const den of [50, 100]) {
      const k = PX / den;
      for (const l of linhasDoMobiliario(tipo, f.larguraMm, f.profundidadeMm, { detalhe: den <= 50 })) {
        const d = l.pts.map(([px, py], j) => `${j ? 'L' : 'M'}${(x + px * k).toFixed(2)} ${(oy + 52 + (f.profundidadeMm - py) * k).toFixed(2)}`).join(' ');
        const dash = l.tracejado ? ` stroke-dasharray="${1.2 * PX} ${0.8 * PX}"` : '';
        partes.push(`<path d="${d}" fill="none" stroke="#1f2937" stroke-width="${(PENA_MM[l.pena] * PX).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`);
      }
      x += f.larguraMm * k + 30;
    }
  });
  oy += alturas[r];
});
fs.writeFileSync(process.argv[2] ?? 'catalogo.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${partes.join('\n')}\n</svg>\n`, 'utf-8');
console.log('ok', tipos.length);
