/**
 * O `Desenhista` que coleta as primitivas como nós SVG (React), na escala `k` (px por mm de papel). Nasceu dentro do
 * `PainelUnifilar` (15/09/2026); saiu para cá na etapa B da casa automática (11/11/2026), quando a PLANTA DA PRÉVIA passou a
 * desenhar a casa com o mesmo `desenharPlanta` das pranchas. A planta usa o texto centralizado e girado (nome do ambiente,
 * cota); o unifilar não passa essas opções e sai como sempre saiu.
 */
import React from 'react';
import type { Desenhista, EstiloTraco } from '../../utils/blueprintExport';

/**
 * O RETÂNGULO: `UNIFILAR` (o padrão, como nasceu) é caixa branca com contorno — o símbolo do disjuntor cobre o barramento que
 * passa por trás. `PRANCHA` segue o contrato dos desenhistas do PDF e do canvas (`blueprintExportService`): cor branca é
 * preenchimento, outra cor é só contorno. A planta precisa do segundo: com recorte, a moldura sai por ÚLTIMO e, preenchida,
 * cobria o desenho inteiro (conferido no app, 11/11/2026).
 */
export type ModoDoDesenhistaSvg = 'UNIFILAR' | 'PRANCHA';

export class DesenhistaSvg implements Desenhista {
  readonly nos: React.ReactNode[] = [];
  private n = 0;
  constructor(
    private readonly k: number,
    private readonly modo: ModoDoDesenhistaSvg = 'UNIFILAR',
  ) {}
  private px(v: number) {
    return v * this.k;
  }
  linha(x1: number, y1: number, x2: number, y2: number, estilo: EstiloTraco): void {
    this.nos.push(
      <line
        key={this.n++}
        x1={this.px(x1)}
        y1={this.px(y1)}
        x2={this.px(x2)}
        y2={this.px(y2)}
        stroke={estilo.cor}
        strokeWidth={Math.max(1, this.px(estilo.espessuraMm))}
        strokeLinecap="round"
      />,
    );
  }
  poligono(pontos: { x: number; y: number }[], preenchimento: string): void {
    this.nos.push(<polygon key={this.n++} points={pontos.map((p) => `${this.px(p.x)},${this.px(p.y)}`).join(' ')} fill={preenchimento} />);
  }
  texto(x: number, y: number, texto: string, alturaMm: number, cor?: string, opcoes?: { anguloGraus?: number; centralizar?: boolean }): void {
    const X = this.px(x);
    const Y = this.px(y);
    // O ângulo do `Desenhista` é anti-horário no desenho; no SVG o y cresce para baixo, então o giro troca de sinal.
    const giro = opcoes?.anguloGraus ? `rotate(${-opcoes.anguloGraus} ${X} ${Y})` : undefined;
    this.nos.push(
      <text
        key={this.n++}
        x={X}
        y={Y}
        fontSize={Math.max(9, this.px(alturaMm) * 1.25)}
        fill={cor ?? '#0f172a'}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        textAnchor={opcoes?.centralizar ? 'middle' : undefined}
        transform={giro}
      >
        {texto}
      </text>,
    );
  }
  retangulo(x: number, y: number, w: number, h: number, estilo: EstiloTraco): void {
    if (this.modo === 'PRANCHA') {
      const fundo = estilo.cor === '#ffffff';
      this.nos.push(
        <rect
          key={this.n++}
          x={this.px(x)}
          y={this.px(y)}
          width={this.px(w)}
          height={this.px(h)}
          fill={fundo ? '#ffffff' : 'none'}
          stroke={fundo ? undefined : estilo.cor}
          strokeWidth={fundo ? undefined : Math.max(1, this.px(estilo.espessuraMm))}
        />,
      );
      return;
    }
    this.nos.push(
      <rect
        key={this.n++}
        x={this.px(x)}
        y={this.px(y)}
        width={this.px(w)}
        height={this.px(h)}
        fill="#ffffff"
        stroke={estilo.cor}
        strokeWidth={Math.max(1, this.px(estilo.espessuraMm))}
      />,
    );
  }
  circulo(cx: number, cy: number, raio: number, estilo: EstiloTraco, preenchimento: string): void {
    this.nos.push(
      <circle key={this.n++} cx={this.px(cx)} cy={this.px(cy)} r={this.px(raio)} fill={preenchimento} stroke={estilo.cor} strokeWidth={Math.max(1, this.px(estilo.espessuraMm))} />,
    );
  }
}
