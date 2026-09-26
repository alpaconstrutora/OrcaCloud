/**
 * REURB (A5) — o relatório em gaveta: os dados do núcleo, os ocupantes de cada
 * lote (lidos do Empreendimento ligado — B3), as pendências e as peças:
 * memoriais REURB por lote, listagem de ocupantes para cartório e prefeitura e
 * as pranchas (a planta geral + uma por lote, pelo PDF do loteamento).
 */
import React from 'react';
import { AlertTriangle, Download, RefreshCw } from 'lucide-react';
import type { BlueprintModel } from '../../utils/blueprintKernel';
import { rotuloDoLote } from '../../utils/blueprintLoteamento';
import type { EstadoDaGravacao } from '../../hooks/useBlueprintRegularizacao';
import { pendenciasDaReurb, ROTULO_DA_MODALIDADE, type DadosDaReurb, type ModalidadeDaReurb, type OcupanteDoLote } from '../../utils/blueprintReurb';

export interface OcupantesNoPainel {
  estado: 'CARREGANDO' | 'PRONTO' | 'ERRO';
  erro?: string | null;
  empreendimento: { id: string; nome: string } | null;
  lotesComUnidade: number;
  porLoteUid: Record<string, OcupanteDoLote[]>;
}

export interface Props {
  model: BlueprintModel;
  dados: DadosDaReurb;
  onDados: (patch: Partial<DadosDaReurb>) => void;
  ocupantes: OcupantesNoPainel;
  onRecarregar: () => void;
  onMemoriais: () => void;
  onListagem: () => void;
  onPranchas: () => void;
  /** Os dados do núcleo ficam gravados no estudo; isto diz se gravou. */
  estadoDaGravacao?: EstadoDaGravacao;
}

const campo = 'mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800';

export default function PainelReurb({ model, dados, onDados, ocupantes, onRecarregar, onMemoriais, onListagem, onPranchas, estadoDaGravacao = 'SALVO' }: Props) {
  const lotes = (model.lotes ?? []).filter((l) => l.tipo === 'LOTE');
  const pendencias = pendenciasDaReurb(model, ocupantes.porLoteUid, dados);
  const semLote = lotes.length === 0 ? 'Desenhe os lotes do núcleo (grupo Loteamento) — sobre a ortofoto, se houver' : null;
  const texto = (rotulo: string, chave: keyof DadosDaReurb, placeholder?: string) => (
    <label className="text-[11px] text-slate-500">
      <span className="block">{rotulo}</span>
      <input type="text" value={(dados[chave] as string | null | undefined) ?? ''} placeholder={placeholder} aria-label={rotulo} onChange={(e) => onDados({ [chave]: e.target.value })} className={campo} />
    </label>
  );
  return (
    <div className="space-y-5 text-xs text-slate-700" data-testid="painel-reurb">
      <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-600">
        Peças da Regularização Fundiária Urbana (Lei 13.465/2017) para o responsável técnico e a comissão municipal. A instauração e a decisão
        são do município.
      </p>

      <section>
        <p className="font-medium text-slate-800">Núcleo urbano informal</p>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {texto('Nome do núcleo', 'nome', 'Núcleo Vila Esperança')}
          <label className="text-[11px] text-slate-500">
            <span className="block">Modalidade</span>
            <select value={dados.modalidade} aria-label="Modalidade" onChange={(e) => onDados({ modalidade: e.target.value as ModalidadeDaReurb })} className={campo}>
              {(Object.keys(ROTULO_DA_MODALIDADE) as ModalidadeDaReurb[]).map((m) => (
                <option key={m} value={m}>
                  {ROTULO_DA_MODALIDADE[m]}
                </option>
              ))}
            </select>
          </label>
          {texto('Município', 'municipio')}
          {texto('UF', 'uf')}
          {texto('Matrícula de origem', 'matricula')}
          {texto('Cartório', 'cartorio')}
          {texto('Responsável técnico', 'responsavelTecnico')}
          {texto('Registro no conselho', 'registroDoConselho', 'CREA-MG 123456')}
        </div>
        <p className={`text-[11px] ${estadoDaGravacao === 'INDISPONIVEL' ? 'text-amber-700' : 'text-slate-500'}`} data-testid="reurb-gravacao">
        {estadoDaGravacao === 'CARREGANDO'
          ? 'Lendo os dados gravados do estudo…'
          : estadoDaGravacao === 'SALVANDO'
            ? 'Gravando no estudo…'
            : estadoDaGravacao === 'INDISPONIVEL'
              ? 'Não consegui gravar no estudo: o que mudar agora fica só nesta aba.'
              : 'Gravado no estudo, para todos da organização.'}
        </p>
      </section>

      <section data-testid="reurb-ocupantes">
        <div className="flex items-center justify-between">
          <p className="font-medium text-slate-800">Ocupantes</p>
          <button type="button" onClick={onRecarregar} className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900" title="Relê as ocupações do Empreendimento">
            <RefreshCw className="h-3.5 w-3.5" /> Reler
          </button>
        </div>
        {ocupantes.estado === 'CARREGANDO' ? (
          <p className="mt-1 text-slate-500">Lendo as ocupações do Empreendimento…</p>
        ) : ocupantes.estado === 'ERRO' ? (
          <p className="mt-1 text-rose-700">{ocupantes.erro}</p>
        ) : !ocupantes.empreendimento ? (
          <p className="mt-1 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Este estudo não está ligado a um Empreendimento. Envie o loteamento (Colaborar › <strong>Enviar loteamento</strong>): cada lote vira uma
              unidade, e os ocupantes se cadastram — ou se importam por planilha — em Empreendimento › Ocupantes.
            </span>
          </p>
        ) : (
          <>
            <p className="mt-1 text-slate-600">
              Do Empreendimento <strong>{ocupantes.empreendimento.nome}</strong> · {ocupantes.lotesComUnidade} de {lotes.length} lotes com unidade.
              A base se edita (e se importa por planilha) em Empreendimento › Ocupantes.
            </p>
            <div className="mt-1 max-h-64 overflow-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-2 py-1.5">Lote</th>
                    <th className="px-2 py-1.5">Ocupante(s)</th>
                  </tr>
                </thead>
                <tbody>
                  {lotes.map((l) => {
                    const os = ocupantes.porLoteUid[l.uid] ?? [];
                    return (
                      <tr key={l.uid} className="border-t border-slate-100">
                        <td className="whitespace-nowrap px-2 py-1">{rotuloDoLote(model, l)}</td>
                        <td className={`px-2 py-1 ${os.length === 0 ? 'text-amber-700' : ''}`}>{os.length === 0 ? 'nenhum' : os.map((o) => `${o.nome}${o.documento ? ` (${o.documento})` : ''}`).join('; ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {pendencias.length > 0 && (
        <section>
          <p className="font-medium text-slate-800">Pendências · {pendencias.length}</p>
          <ul className="mt-1 max-h-40 space-y-1 overflow-auto" data-testid="reurb-pendencias">
            {pendencias.map((p, i) => (
              <li key={i} className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">
                <strong>{p.rotulo}</strong>: {p.texto}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <p className="font-medium text-slate-800">Peças</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {(
            [
              [onMemoriais, `Memoriais REURB (${lotes.length})`, 'Um memorial por lote: núcleo, modalidade, descrição do lote e os ocupantes — num .zip'],
              [onListagem, 'Listagem de ocupantes (xlsx)', 'Quadra, lote, área, testada, ocupante, CPF/CNPJ e vínculo — para o cartório e a prefeitura'],
              [onPranchas, `Pranchas (${lotes.length + 2} folhas)`, 'A planta geral, uma planta por lote e o quadro de áreas, em PDF'],
            ] as const
          ).map(([fn, rotulo, dica]) => (
            <button
              key={rotulo}
              type="button"
              onClick={fn}
              disabled={!!semLote}
              title={semLote ?? dica}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> {rotulo}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
