/**
 * Gera a prancha de comparação "hoje × proposta" em SVG, no TAMANHO DE IMPRESSÃO (12 px = 1 mm de papel),
 * em 1:50 e 1:100. O "hoje" é desenhado pela função ATUAL (`tracosDoComponente`) com as penas do PDF de hoje
 * (contorno 0,13 mm e detalhe 0,10 mm, cinza #555) — não é uma imitação.
 *
 *   npx esbuild docs/spikes/simbolos-2d/prancha.ts --bundle --platform=node --format=esm --outfile=<tmp>/prancha.mjs
 *   node <tmp>/prancha.mjs docs/spikes/simbolos-2d/prancha.svg
 */
import fs from 'node:fs';
import { CATALOGO_DE_COMPONENTES } from '../../../utils/blueprintKernel';
import { tracosDoComponente } from './simbolosDeAntes';
import { PENA_MM, simboloProposto, type Linha, type TipoDaPrancha } from './simbolos';

const PX_POR_MM_PAPEL = 12;
const TIPOS: TipoDaPrancha[] = ['CAMA_CASAL', 'SOFA', 'MESA_JANTAR', 'VASO'];
const ESCALAS = [50, 100];

type P2 = [number, number];

/** O símbolo de HOJE em mm locais, como `simboloNoMundo` o monta (contorno da caixa + traços em fração). */
function simboloDeHoje(tipo: TipoDaPrancha, L: number, P: number): { contorno: P2[]; tracos: P2[][] } {
  const menor = Math.min(L, P);
  const tracos: P2[][] = [];
  for (const t of tracosDoComponente(tipo)) {
    if (t.tipo === 'linha') tracos.push([[t.a[0] * L, t.a[1] * P], [t.b[0] * L, t.b[1] * P]]);
    else if (t.tipo === 'poli') tracos.push([...t.pontos.map(([x, y]) => [x * L, y * P] as P2), [t.pontos[0][0] * L, t.pontos[0][1] * P]]);
    else {
      const rx = t.tipo === 'circulo' ? (t.r * menor) / L : t.rx;
      const ry = t.tipo === 'circulo' ? (t.r * menor) / P : t.ry;
      const pts: P2[] = [];
      for (let i = 0; i <= 24; i++) {
        const g = (i / 24) * Math.PI * 2;
        pts.push([(t.c[0] + rx * Math.cos(g)) * L, (t.c[1] + ry * Math.sin(g)) * P]);
      }
      tracos.push(pts);
    }
  }
  return { contorno: [[0, 0], [L, 0], [L, P], [0, P], [0, 0]], tracos };
}

function caixaDe(linhas: P2[][]): { x0: number; y0: number; x1: number; y1: number } {
  const xs = linhas.flat().map((p) => p[0]);
  const ys = linhas.flat().map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Polilinhas em mm locais → elementos SVG, com o FUNDO da peça para cima (como se lê a planta). */
function svgDe(linhas: { pts: P2[]; larguraMm: number; cor: string; tracejado: boolean }[], denominador: number, ox: number, oy: number, caixa: { x0: number; y1: number }): string {
  const k = PX_POR_MM_PAPEL / denominador;
  return linhas
    .map((l) => {
      const d = l.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + (x - caixa.x0) * k).toFixed(2)} ${(oy + (caixa.y1 - y) * k).toFixed(2)}`).join(' ');
      const w = (l.larguraMm * PX_POR_MM_PAPEL).toFixed(2);
      const dash = l.tracejado ? ` stroke-dasharray="${(1.2 * PX_POR_MM_PAPEL).toFixed(1)} ${(0.8 * PX_POR_MM_PAPEL).toFixed(1)}"` : '';
      return `<path d="${d}" fill="none" stroke="${l.cor}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    })
    .join('\n');
}

function montar(): string {
  const margem = 40;
  const colRotulo = 190;
  const gap = 48;
  const cabecalho = 120;
  // Tamanho de cada célula: o maior desenho da coluna/linha.
  const celulas = TIPOS.map((tipo) => {
    const f = CATALOGO_DE_COMPONENTES[tipo];
    return ESCALAS.flatMap((den) => {
      const hoje = simboloDeHoje(tipo, f.larguraMm, f.profundidadeMm);
      const prop = simboloProposto(tipo, f.larguraMm, f.profundidadeMm, den);
      const cHoje = caixaDe([hoje.contorno, ...hoje.tracos]);
      const cProp = caixaDe(prop.map((l) => l.pts));
      return [
        { den, tipo, caixa: cHoje, linhas: [{ pts: hoje.contorno, larguraMm: 0.13, cor: '#555555', tracejado: false }, ...hoje.tracos.map((pts) => ({ pts, larguraMm: 0.1, cor: '#555555', tracejado: false }))] },
        { den, tipo, caixa: cProp, linhas: prop.map((l: Linha) => ({ pts: l.pts, larguraMm: PENA_MM[l.pena], cor: '#111827', tracejado: l.tracejado })) },
      ];
    });
  });
  const larguraCol = [0, 1, 2, 3].map((c) => Math.max(...celulas.map((linha) => ((linha[c].caixa.x1 - linha[c].caixa.x0) * PX_POR_MM_PAPEL) / linha[c].den)) + 10);
  const alturaLinha = celulas.map((linha) => Math.max(...linha.map((c) => ((c.caixa.y1 - c.caixa.y0) * PX_POR_MM_PAPEL) / c.den)) + 50);
  const W = margem * 2 + colRotulo + larguraCol.reduce((s, v) => s + v + gap, 0);
  const H = margem * 2 + cabecalho + alturaLinha.reduce((s, v) => s + v + gap, 0) + 60;

  const partes: string[] = [];
  partes.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
  partes.push(`<text x="${margem}" y="${margem + 8}" font-family="Arial" font-size="26" font-weight="bold" fill="#111827">Símbolos 2D de mobiliário — hoje × proposta</text>`);
  partes.push(`<text x="${margem}" y="${margem + 38}" font-family="Arial" font-size="15" fill="#475569">Em tamanho de IMPRESSÃO: ${PX_POR_MM_PAPEL} px = 1 mm de papel. "Hoje" é o desenho atual do sistema, com as penas do PDF atual.</text>`);
  const titulos = ['Hoje · 1:50', 'Proposta · 1:50', 'Hoje · 1:100', 'Proposta · 1:100'];
  let x = margem + colRotulo;
  titulos.forEach((t, c) => {
    partes.push(`<text x="${x}" y="${margem + cabecalho - 22}" font-family="Arial" font-size="17" font-weight="bold" fill="${c % 2 ? '#1d4ed8' : '#64748b'}">${t}</text>`);
    x += larguraCol[c] + gap;
  });
  let y = margem + cabecalho;
  celulas.forEach((linha, r) => {
    const f = CATALOGO_DE_COMPONENTES[TIPOS[r]];
    partes.push(`<text x="${margem}" y="${y + 24}" font-family="Arial" font-size="18" font-weight="bold" fill="#111827">${f.rotulo}</text>`);
    partes.push(`<text x="${margem}" y="${y + 48}" font-family="Arial" font-size="14" fill="#64748b">${(f.larguraMm / 1000).toFixed(2).replace('.', ',')} × ${(f.profundidadeMm / 1000).toFixed(2).replace('.', ',')} m</text>`);
    let cx = margem + colRotulo;
    linha.forEach((cel, c) => {
      partes.push(svgDe(cel.linhas, cel.den, cx + 5, y + 10, cel.caixa));
      cx += larguraCol[c] + gap;
    });
    y += alturaLinha[r] + gap;
    partes.push(`<line x1="${margem}" y1="${y - gap / 2}" x2="${W - margem}" y2="${y - gap / 2}" stroke="#e2e8f0" stroke-width="1"/>`);
  });
  partes.push(
    `<text x="${margem}" y="${H - margem}" font-family="Arial" font-size="14" fill="#475569">Proposta: contorno 0,25 mm · detalhe 0,13 mm · textura 0,09 mm · tracejado = acima do plano de corte/escondido. Em 1:100 os detalhes finos saem (versão limpa). Mesa: tampo na medida real (1,40 × 0,90) e cadeiras para fora.</text>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(W)}" height="${Math.ceil(H)}" viewBox="0 0 ${Math.ceil(W)} ${Math.ceil(H)}">\n${partes.join('\n')}\n</svg>\n`;
}

fs.writeFileSync(process.argv[2] ?? 'prancha.svg', montar(), 'utf-8');
console.log('ok', process.argv[2]);
