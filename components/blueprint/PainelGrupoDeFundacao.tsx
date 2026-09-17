import React, { useState } from 'react';
import { Move, Trash2 } from 'lucide-react';
import type { Structural } from '../../utils/blueprintKernel';
import type { ArmaduraDaPeca, ArmaduraManual } from '../../utils/blueprintArmadura';
import SecaoArmadaSvg from './SecaoArmadaSvg';
import ArmaduraManualForm from './ArmaduraManualForm';
import {
  ARRANJOS_CANONICOS,
  ESPACAMENTO_EM_DIAMETROS,
  QUANTIDADE_MAXIMA_DE_ESTACAS,
  nomeDoArranjo,
  type GrupoDeFundacao,
  type PlanoDeEstacasDoBloco,
} from '../../utils/blueprintGrupoDeFundacao';

/**
 * GRUPO DE FUNDAÇÃO selecionado — o bloco e as estacas dele (16/09/2026).
 *
 * Pedido: *"ao clicar no grupo implementar opção de duplicação de estacas ou
 * campo quantidade"*. Um clique num bloco ou numa estaca seleciona o grupo
 * inteiro, e é este painel que aparece — no lugar de "Seleção múltipla", que
 * só saberia contar peças.
 *
 * Quantidade, Ø e comprimento APLICAM NA HORA, num lote só (Ctrl+Z devolve):
 * o desenho é a prévia. As estacas nascem pelo critério de distribuição
 * (`blueprintGrupoDeFundacao`): centro de carga no eixo do pilar, ≥ 3φ entre
 * eixos, arranjo simétrico — dito aqui em cada aplicação, para o projetista
 * saber o que o número fez.
 */

const cm = (mm: number) => (mm / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

/** Lê "2,5" ou "-2.5" como número. `null` se não for número. */
function lerNumero(texto: string): number | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '') return null;
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

interface Props {
  grupo: GrupoDeFundacao;
  /** O plano da quantidade ATUAL — só para o resumo (arranjo, espaçamento, bloco). */
  plano: PlanoDeEstacasDoBloco;
  onQuantidade: (n: number) => void;
  onDiametro: (mm: number) => void;
  onComprimento: (mm: number) => void;
  /** Desloca o grupo inteiro (mm). */
  onMover: (deltaXmm: number, deltaYmm: number) => void;
  onExcluirGrupo: () => void;
  /** Seleciona SÓ a peça — o mesmo que o duplo clique no desenho. */
  onSelecionarPeca: (id: string) => void;
  /**
   * ARMADURA do grupo (17/09/2026: *"ao clicar em uma estaca o drawer
   * propriedades não exibe a armadura para edição"*): um clique na estaca
   * seleciona o grupo, então é AQUI que o bloco e as estacas mostram o esquema,
   * a seção e o lançamento manual. O manual das estacas vale para TODAS as
   * estacas do bloco (elas são iguais por construção).
   */
  armadura?: {
    bloco?: ArmaduraDaPeca;
    estaca?: ArmaduraDaPeca;
    manualDoBloco: ArmaduraManual | null;
    manualDasEstacas: ArmaduraManual | null;
    onManualDoBloco: (spec: ArmaduraManual | null) => void;
    onManualDasEstacas: (spec: ArmaduraManual | null) => void;
  };
}

export default function PainelGrupoDeFundacao({
  grupo,
  plano,
  onQuantidade,
  onDiametro,
  onComprimento,
  onMover,
  onExcluirGrupo,
  onSelecionarPeca,
  armadura,
}: Props) {
  const { bloco, estacas, pilar } = grupo;
  const n = estacas.length;
  const diametroMm = estacas[0]?.larguraMm ?? plano.diametroMm;
  const comprimentoMm = estacas[0]?.alturaMm ?? plano.comprimentoMm;
  const [dx, setDx] = useState('0');
  const [dy, setDy] = useState('0');
  const [quantidadeLivre, setQuantidadeLivre] = useState(String(n));
  // O campo livre acompanha a quantidade real quando ela muda por fora (botão, Desfazer).
  const [nVisto, setNVisto] = useState(n);
  if (nVisto !== n) {
    setNVisto(n);
    setQuantidadeLivre(String(n));
  }

  const aplicarQuantidade = (valor: string) => {
    const q = lerNumero(valor);
    if (q === null) return;
    const inteiro = Math.max(1, Math.min(QUANTIDADE_MAXIMA_DE_ESTACAS, Math.round(q)));
    setQuantidadeLivre(String(inteiro));
    if (inteiro !== n) onQuantidade(inteiro);
  };
  const aplicarMedida = (valor: string, atual: number, aplicar: (mm: number) => void, escala: number, minimoMm: number) => {
    const v = lerNumero(valor);
    if (v === null) return;
    const mm = Math.max(minimoMm, Math.round(v * escala));
    if (mm !== atual) aplicar(mm);
  };
  function mover() {
    const x = lerNumero(dx);
    const y = lerNumero(dy);
    if (x === null || y === null) return;
    onMover(Math.round(x * 1000), Math.round(y * 1000));
    setDx('0');
    setDy('0');
  }

  const nomeDoBloco = bloco.rotulo?.trim() || 'Bloco';
  const espacamentoMm = ESPACAMENTO_EM_DIAMETROS * diametroMm;

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3" data-testid="painel-grupo-fundacao">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grupo de fundação</h3>
      <p className="mt-1 text-sm font-semibold text-slate-800">
        {nomeDoBloco} · {n} estaca{n === 1 ? '' : 's'}
        {pilar ? <span className="font-normal text-slate-500"> · sob o pilar {pilar.rotulo?.trim() || 'sem rótulo'}</span> : null}
      </p>
      <p className="text-xs text-slate-500">
        Bloco {cm(bloco.larguraMm)} × {cm(bloco.profundidadeMm)} × {cm(bloco.alturaMm)} cm · topo {m(bloco.baseMm + bloco.alturaMm)} m
        {n > 0 ? ` · estacas Ø ${cm(diametroMm)} cm × ${m(comprimentoMm)} m` : ''}
      </p>

      {/* ─── Quantidade ─────────────────────────────────────────────────── */}
      <div className="mt-3">
        <p className="text-xs font-semibold text-slate-500">Estacas no bloco</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5" role="group" aria-label="Arranjos de estacas">
          {ARRANJOS_CANONICOS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => aplicarQuantidade(String(q))}
              aria-pressed={q === n}
              title={`${q} estaca${q === 1 ? '' : 's'} em ${nomeDoArranjo(q)}`}
              aria-label={`${q} estaca${q === 1 ? '' : 's'} em ${nomeDoArranjo(q)}`}
              className={`rounded-[6px] border px-2 py-1 text-xs tabular-nums transition-colors ${
                q === n
                  ? 'border-blue-300 bg-blue-50 font-semibold text-blue-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {q}
            </button>
          ))}
          <label className="ml-1 flex items-center gap-1.5 text-xs text-slate-600">
            ou
            <input
              type="number"
              min={1}
              max={QUANTIDADE_MAXIMA_DE_ESTACAS}
              step={1}
              value={quantidadeLivre}
              onChange={(e) => setQuantidadeLivre(e.target.value)}
              onBlur={(e) => aplicarQuantidade(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicarQuantidade((e.target as HTMLInputElement).value)}
              aria-label="Quantidade de estacas"
              className="w-14 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
            />
          </label>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {n > 0 ? (
            <>
              Arranjo <strong>{nomeDoArranjo(n)}</strong>: centro de carga no eixo do {pilar ? 'pilar' : 'bloco'} ·{' '}
              <strong>{cm(espacamentoMm)} cm</strong> (3Ø) entre eixos · simétrico. O bloco acompanha o arranjo.
            </>
          ) : (
            <>Sem estaca. Escolha a quantidade: elas nascem pelo critério (centro de carga no pilar, 3Ø, simétrico).</>
          )}
        </p>
        {plano.aviso && <p className="mt-1 text-xs text-amber-800">{plano.aviso}</p>}
      </div>

      {/* ─── Ø e comprimento ─────────────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Ø
          <input
            key={`d-${diametroMm}`}
            type="text"
            inputMode="decimal"
            defaultValue={cm(diametroMm)}
            onBlur={(e) => aplicarMedida(e.target.value, diametroMm, onDiametro, 10, 100)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Diâmetro da estaca, em centímetros"
            className="w-14 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
          />
          cm
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Comprimento
          <input
            key={`c-${comprimentoMm}`}
            type="text"
            inputMode="decimal"
            defaultValue={m(comprimentoMm)}
            onBlur={(e) => aplicarMedida(e.target.value, comprimentoMm, onComprimento, 1000, 500)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Comprimento da estaca, em metros"
            className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
          />
          m
        </label>
      </div>

      {/* ─── Armadura do bloco e das estacas ─────────────────────────────── */}
      {armadura && (armadura.bloco || armadura.estaca) && (
        <div className="mt-3 space-y-3">
          {armadura.bloco && (
            <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5" data-testid="armadura-do-bloco">
              <p className="text-xs font-semibold text-slate-700">
                Armadura do bloco {nomeDoBloco}
                <span className="ml-1 font-normal text-slate-500">
                  ≈ {armadura.bloco.kg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg · {armadura.bloco.descricao} (
                  {armadura.bloco.origem === 'MANUAL' ? 'manual' : armadura.bloco.origem === 'TAXA' ? 'taxa de referência' : 'mínimos NBR 6118'})
                </span>
              </p>
              <SecaoArmadaSvg estrutura={bloco} armadura={armadura.bloco} larguraPx={180} />
              <ArmaduraManualForm estrutura={bloco} armadura={armadura.bloco} manual={armadura.manualDoBloco} onManual={armadura.onManualDoBloco} />
            </div>
          )}
          {armadura.estaca && estacas[0] && (
            <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5" data-testid="armadura-das-estacas">
              <p className="text-xs font-semibold text-slate-700">
                Armadura das estacas
                <span className="ml-1 font-normal text-slate-500">
                  ≈ {armadura.estaca.kg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg cada ×{' '}
                  {n} · {armadura.estaca.descricao} (
                  {armadura.estaca.origem === 'MANUAL' ? 'manual' : armadura.estaca.origem === 'TAXA' ? 'taxa de referência' : 'mínimos NBR 6118'})
                </span>
              </p>
              <SecaoArmadaSvg estrutura={estacas[0]} armadura={armadura.estaca} larguraPx={120} />
              <ArmaduraManualForm estrutura={estacas[0]} armadura={armadura.estaca} manual={armadura.manualDasEstacas} onManual={armadura.onManualDasEstacas} />
              {n > 1 && <p className="mt-1 text-[10px] text-slate-500">O lançamento manual vale para as {n} estacas deste bloco.</p>}
            </div>
          )}
        </div>
      )}

      {/* ─── Peças do grupo ──────────────────────────────────────────────── */}
      <p className="mt-3 text-xs text-slate-500">
        Peças (duplo clique no desenho, ou aqui, para editar uma sozinha):{' '}
        {[bloco, ...estacas].map((p: Structural, i) => (
          <React.Fragment key={p.id}>
            {i > 0 ? ' · ' : ''}
            <button
              type="button"
              onClick={() => onSelecionarPeca(p.id)}
              className="rounded px-1 text-blue-700 underline-offset-2 hover:underline"
            >
              {p.rotulo?.trim() || (p.kind === 'ESTACA' ? 'estaca' : 'bloco')}
            </button>
          </React.Fragment>
        ))}
      </p>

      {/* ─── Mover e excluir ─────────────────────────────────────────────── */}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Δx
          <input
            type="text"
            inputMode="decimal"
            value={dx}
            onChange={(e) => setDx(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && mover()}
            aria-label="Deslocamento horizontal do grupo em metros"
            className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
          />
          m
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Δy
          <input
            type="text"
            inputMode="decimal"
            value={dy}
            onChange={(e) => setDy(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && mover()}
            aria-label="Deslocamento vertical do grupo em metros"
            className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
          />
          m
        </label>
        <button
          type="button"
          onClick={mover}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Move className="h-3.5 w-3.5" />
          Mover grupo
        </button>
        <button
          type="button"
          onClick={onExcluirGrupo}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700 transition-colors hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir grupo
        </button>
      </div>
    </div>
  );
}
