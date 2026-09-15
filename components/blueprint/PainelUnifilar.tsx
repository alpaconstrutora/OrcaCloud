import React, { useMemo } from 'react';
import type { BlueprintModel } from '../../utils/blueprintKernel';
import type { Desenhista, EstiloTraco } from '../../utils/blueprintExport';
import { HIPOTESES_PADRAO, type HipotesesEletricas } from '../../utils/blueprintEletricaDimensionamento';
import { desenharUnifilar, medidasDoUnifilar, montarUnifilar, rodapeDoUnifilar } from '../../utils/blueprintUnifilar';

/**
 * DIAGRAMA UNIFILAR na tela (15/09/2026) — ver `blueprintUnifilar.ts`.
 *
 * O traçado é o MESMO da prancha PDF: `desenharUnifilar` fala com um
 * `Desenhista`, e aqui o desenhista escreve SVG. Um `<svg>` por quadro, em
 * mm × `PX_POR_MM`, rolando na horizontal quando há muitos circuitos — o
 * diagrama não quebra linha, porque o barramento é um só.
 *
 * 15/09/2026: saiu do drawer (672 px) para uma TELA própria — a escala subiu
 * de 3,4 para 4,4 px/mm, porque os textos de 9 px do ramal eram o preço da
 * largura curta, não uma escolha.
 */
const PX_POR_MM = 4.4;

/** Coleta as primitivas do `Desenhista` como nós SVG. */
class DesenhistaSvg implements Desenhista {
  readonly nos: React.ReactNode[] = [];
  private n = 0;
  constructor(private readonly k: number) {}
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
    this.nos.push(
      <polygon key={this.n++} points={pontos.map((p) => `${this.px(p.x)},${this.px(p.y)}`).join(' ')} fill={preenchimento} />,
    );
  }
  texto(x: number, y: number, texto: string, alturaMm: number, cor?: string): void {
    this.nos.push(
      <text
        key={this.n++}
        x={this.px(x)}
        y={this.px(y)}
        fontSize={Math.max(9, this.px(alturaMm) * 1.25)}
        fill={cor ?? '#0f172a'}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {texto}
      </text>,
    );
  }
  retangulo(x: number, y: number, w: number, h: number, estilo: EstiloTraco): void {
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
}

export default function PainelUnifilar({
  model,
  hipoteses = HIPOTESES_PADRAO,
}: {
  model: BlueprintModel;
  hipoteses?: HipotesesEletricas;
}) {
  const diagramas = useMemo(() => montarUnifilar(model, hipoteses), [model, hipoteses]);

  if (diagramas.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nenhum quadro de distribuição ainda. Insira um (Instalações › Componentes) e crie os circuitos — o
        diagrama nasce deles.
      </p>
    );
  }

  return (
    <div className="space-y-6" data-testid="unifilar">
      {diagramas.map((dg) => {
        const { larguraMm, alturaMm } = medidasDoUnifilar(dg);
        const d = new DesenhistaSvg(PX_POR_MM);
        desenharUnifilar(d, dg, 0, 0, 1);
        const w = Math.ceil(larguraMm * PX_POR_MM);
        const h = Math.ceil(alturaMm * PX_POR_MM);
        return (
          <section key={dg.quadroId} aria-label={`Diagrama unifilar ${dg.nome}`}>
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Unifilar do quadro ${dg.nome}`}>
                {d.nos}
              </svg>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {dg.ramais.length} circuito(s) · instalado {dg.entrada.instaladaVA} VA · demandado {dg.entrada.demandadaVA} VA
              {dg.entrada.disjuntorGeralA != null ? ` · geral ${dg.entrada.disjuntorGeralA} A` : ' · geral não calculado (declare a tensão do quadro)'}
            </p>
          </section>
        );
      })}
      <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-500">
        {rodapeDoUnifilar(diagramas).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
