/**
 * Traço das dependências do Gantt (Planejamento) — 11/10/2026, com print de referência:
 * *"Nao pode ter esses espaços. do traço. veja tambem uma seta aparentemente solta"*.
 *
 * Como na referência (padrão MS Project): o traço SAI colado na borda da barra de origem,
 * anda um degrau curto (`DEGRAU_PX`) e desce ali mesmo; chega à barra de destino pelo lado
 * certo e a seta encosta na borda. Quando não dá para descer direto (o destino começa antes
 * de onde o traço sai — sobreposição, folga negativa, SS/FF), ele desce até a divisa entre
 * as linhas, volta por baixo da origem e desce até o destino.
 *
 * Antes a descida era no MEIO do caminho entre as barras e os pontos vinham de outra conta
 * (início + duração), que não batia com a barra desenhada.
 */

export type TipoDependencia = 'FS' | 'SS' | 'FF' | 'SF';

/** Bordas da barra como DESENHADA, em px no sistema do svg. */
export interface BordasDaBarra {
    left: number;
    right: number;
    /** Centro vertical da linha. */
    y: number;
}

/** Degrau de SAÍDA: o traço anda isto colado na origem antes de descer. */
export const DEGRAU_PX = 8;

/** Seta (marcador SVG do Gantt): comprimento e altura em px de tela. O desenho do marcador
 *  em ScheduleGantt.tsx lê estas constantes — mudou aqui, muda lá. */
export const COMPRIMENTO_SETA_PX = 12;
export const ALTURA_SETA_PX = 8;

/** Degrau de CHEGADA: o trecho reto em que a seta assenta. Tem de ser MAIOR que a seta —
 *  com 8px (12/10/2026) a seta de 12px passava da curva e o traço vertical encostava na
 *  LATERAL dela (*"a linha se conecte corretamente pela base da seta e nao pela laterial"*). */
export const DEGRAU_CHEGADA_PX = COMPRIMENTO_SETA_PX + 6;

/** Altura de uma linha do Gantt (`h-9`). */
export const ALTURA_LINHA_PX = 36;

/**
 * Caminho SVG (`d`) da dependência. Origem: fim (FS/FF) ou início (SS/SF) da antecessora.
 * Destino: início (FS/SS) ou fim (FF/SF) da sucessora — a seta encosta nessa borda.
 */
export function rotaDaDependencia(origem: BordasDaBarra, destino: BordasDaBarra, tipo: TipoDependencia): string {
    const saiDoFim = tipo === 'FS' || tipo === 'FF';
    const chegaNoInicio = tipo === 'FS' || tipo === 'SS';

    const x0 = saiDoFim ? origem.right : origem.left;
    const sentidoSaida = saiDoFim ? 1 : -1;
    const xt = chegaNoInicio ? destino.left : destino.right;
    // A seta entra no início andando para a DIREITA; no fim, andando para a esquerda.
    const sentidoChegada = chegaNoInicio ? 1 : -1;

    const xSaida = x0 + sentidoSaida * DEGRAU_PX;      // depois do degrau de saída
    const xEntrada = xt - sentidoChegada * DEGRAU_CHEGADA_PX;  // antes do degrau de chegada
    const y0 = origem.y;
    const yt = destino.y;

    // Desce direto, colado na origem (logo depois do degrau de saída), quando dali ainda
    // sobra um degrau de CHEGADA inteiro até a borda, no sentido em que a seta entra —
    // senão a seta não cabe no trecho reto e o traço encosta na lateral dela.
    if (sentidoChegada * (xt - xSaida) >= DEGRAU_CHEGADA_PX - 0.5) {
        return `M ${x0} ${y0} H ${xSaida} V ${yt} H ${xt}`;
    }
    // Contorno: desce até a divisa das linhas, cruza até antes do destino e desce até ele.
    const sentidoVertical = yt >= y0 ? 1 : -1;
    const yDivisa = y0 + sentidoVertical * (ALTURA_LINHA_PX / 2);
    return `M ${x0} ${y0} H ${xSaida} V ${yDivisa} H ${xEntrada} V ${yt} H ${xt}`;
}
