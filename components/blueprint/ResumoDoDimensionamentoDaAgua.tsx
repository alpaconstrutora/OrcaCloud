/**
 * A SITUAÇÃO DO DIMENSIONAMENTO na gaveta de água (14/10/2026). Os painéis de
 * reservação, alimentador, recalque, aquecedor e pressões saíram da gaveta para
 * a tela "Dimensionamento da água" (a gaveta tinha 32 campos e a tabela de
 * pressões não cabia nos ~528 px dela). Na gaveta fica uma linha por assunto —
 * o que quem está lançando precisa saber — e o caminho para a tela.
 */
import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { DimensionamentoDaReservacao } from '../../utils/blueprintReservacao';
import type { PlanoDoAlimentador } from '../../utils/blueprintAlimentador';
import type { PlanoDoRecalque } from '../../utils/blueprintRecalque';
import type { AquecedorDimensionado } from '../../utils/blueprintAquecedor';
import type { PressoesDaRede } from '../../utils/blueprintPressaoDaRede';

interface Props {
  reservacao: DimensionamentoDaReservacao | null;
  alimentador: PlanoDoAlimentador | null;
  recalque: PlanoDoRecalque | null;
  aquecedores: readonly AquecedorDimensionado[];
  pressoes: readonly PressoesDaRede[];
  onAbrir: () => void;
}

type Tom = 'ok' | 'erro' | 'aviso' | 'neutro';
const COR: Record<Tom, string> = { ok: 'text-emerald-700', erro: 'text-red-700', aviso: 'text-amber-700', neutro: 'text-slate-500' };
const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

const RESERVACAO: Record<DimensionamentoDaReservacao['situacao'], [string, Tom]> = {
  ATENDE: ['atende', 'ok'],
  INSUFICIENTE: ['volume insuficiente', 'erro'],
  SEM_VOLUME: ['caixa sem volume declarado', 'erro'],
  SEM_RESERVATORIO: ["sem caixa d'água no desenho", 'aviso'],
  SEM_POPULACAO: ['população não identificada', 'aviso'],
};

export function linhasDoDimensionamento({ reservacao, alimentador, recalque, aquecedores, pressoes }: Omit<Props, 'onAbrir'>): { assunto: string; texto: string; tom: Tom }[] {
  const linhas: { assunto: string; texto: string; tom: Tom }[] = [];
  if (reservacao) {
    const [texto, tom] = RESERVACAO[reservacao.situacao];
    linhas.push({ assunto: 'Reservação', texto, tom });
  }
  if (alimentador) {
    linhas.push(
      alimentador.motivo
        ? { assunto: 'Alimentador', texto: 'não calculado', tom: 'neutro' }
        : alimentador.atende
          ? { assunto: 'Alimentador', texto: `chega à boia com ${n(alimentador.pressaoNaBoiaKpa)} kPa`, tom: 'ok' }
          : { assunto: 'Alimentador', texto: `pressão insuficiente na boia (${n(alimentador.pressaoNaBoiaKpa)} kPa)`, tom: 'erro' },
    );
  }
  if (recalque && recalque.inferiorId) {
    linhas.push(recalque.motivo ? { assunto: 'Recalque', texto: 'não calculado', tom: 'aviso' } : { assunto: 'Recalque', texto: `bomba de ${n(recalque.motorCv)} cv`, tom: 'ok' });
  }
  if (aquecedores.length > 0) {
    const falham = aquecedores.filter((a) => !a.atende).length;
    linhas.push(falham === 0 ? { assunto: 'Aquecedor', texto: 'atende', tom: 'ok' } : { assunto: 'Aquecedor', texto: `${falham} não atende(m)`, tom: 'erro' });
  }
  const pontos = pressoes.flatMap((r) => r.pontos);
  if (pontos.length > 0) {
    const insuficientes = pontos.filter((p) => p.estado === 'INSUFICIENTE').length;
    const excessivas = pontos.filter((p) => p.estado === 'EXCESSIVA').length;
    // Ponto ainda sem rede não foi avaliado — NÃO é "atende" (a conferência visual de 14/10/2026 pegou o
    // cartão dizendo "os 3 ponto(s) atendem" antes do lançamento, com o chuveiro abaixo da mínima).
    const naoAvaliados = pontos.filter((p) => p.estado === 'NAO_AVALIADO').length;
    linhas.push(
      insuficientes > 0
        ? { assunto: 'Pressões', texto: `${insuficientes} ponto(s) com pressão insuficiente`, tom: 'erro' }
        : excessivas > 0
          ? { assunto: 'Pressões', texto: `${excessivas} ponto(s) com estática acima da máxima`, tom: 'aviso' }
          : naoAvaliados > 0
            ? { assunto: 'Pressões', texto: `${naoAvaliados} ponto(s) sem rede — lance para avaliar`, tom: 'neutro' }
            : { assunto: 'Pressões', texto: `os ${pontos.length} ponto(s) atendem`, tom: 'ok' },
    );
  }
  return linhas;
}

export default function ResumoDoDimensionamentoDaAgua({ onAbrir, ...dados }: Props) {
  const linhas = linhasDoDimensionamento(dados);
  if (linhas.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600" data-testid="resumo-dimensionamento-agua">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-700">Dimensionamento</span>
        <button type="button" onClick={onAbrir} className="ml-auto inline-flex items-center gap-0.5 font-medium text-blue-600 hover:text-blue-800 hover:underline">
          Abrir dimensionamento
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {linhas.map((l) => (
          <React.Fragment key={l.assunto}>
            <dt className="text-slate-500">{l.assunto}</dt>
            <dd className={COR[l.tom]}>{l.texto}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}
