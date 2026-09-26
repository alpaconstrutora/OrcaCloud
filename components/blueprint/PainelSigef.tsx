/**
 * GeoINCRA / SIGEF (A4) — o relatório em gaveta.
 *
 * Na ordem em que o credenciado trabalha: a identificação do imóvel (gravada
 * por estudo), os VÉRTICES (código no padrão do INCRA, tipo, sigmas, altitude,
 * método), os TRECHOS (tipo de limite, confrontante e documentos), as
 * PENDÊNCIAS pelas regras do INCRA, as PEÇAS (planilha ODS no modelo oficial,
 * memorial, cartas de anuência, relatório de vértices) e a CONFERÊNCIA do
 * retorno do SIGEF.
 *
 * Vértices e trechos são comandos de kernel (desfazer, snapshot) emitidos pelo
 * pai; a identificação vai pelo hook. Nada aqui certifica: o validador e o
 * envio são do credenciado, no SIGEF.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Hash } from 'lucide-react';
import type { BlueprintModel, Command, TipoDeLimite } from '../../utils/blueprintKernel';
import { TIPOS_DE_LIMITE } from '../../utils/blueprintKernel';
import {
  cartasDeAnuencia,
  conferirRetornoSigef,
  memorialGeoIncra,
  METODOS_DE_POSICIONAMENTO,
  metrosSigef,
  NATUREZAS_DA_AREA,
  NATUREZAS_DO_SERVICO,
  perimetroSigef,
  relatorioDeVerticesCsv,
  ROTULO_DO_TIPO_DE_LIMITE,
  SITUACOES_DA_AREA,
  validarSigef,
  type IdentificacaoSigef,
  type PendenciaSigef,
} from '../../utils/geo/sigef';
import { roteiroPerimetrico, verticeNoPonto } from '../../utils/blueprintRoteiroPerimetrico';
import type { SigefDoEstudo } from '../../hooks/useBlueprintSigef';

export interface Props {
  model: BlueprintModel;
  sigef: SigefDoEstudo;
  onComandos: (cmds: Command[]) => void;
  /** Gera e baixa a planilha ODS (o pai busca o modelo e grava o arquivo). */
  onPlanilha: () => void;
  onBaixarTexto: (nome: string, texto: string, tipo: 'text/plain' | 'text/csv') => void;
  /** Meridiano central do fuso do lote, para a célula do modelo. */
  meridianoCentral: number | null;
}

const campo = 'w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800';
const numeroOuNulo = (t: string): number | null => {
  const v = Number(t.replace(',', '.'));
  return t.trim() === '' || !Number.isFinite(v) ? null : v;
};

function Texto({ rotulo, valor, onMudar, placeholder }: { rotulo: string; valor: string; onMudar: (v: string) => void; placeholder?: string }) {
  return (
    <label className="text-[11px] text-slate-500">
      <span className="block">{rotulo}</span>
      <input type="text" value={valor} placeholder={placeholder} aria-label={rotulo} onChange={(e) => onMudar(e.target.value)} className={`mt-0.5 ${campo}`} />
    </label>
  );
}

function Lista<T extends string>({ rotulo, valor, opcoes, onMudar }: { rotulo: string; valor: T; opcoes: readonly T[]; onMudar: (v: T) => void }) {
  return (
    <label className="text-[11px] text-slate-500">
      <span className="block">{rotulo}</span>
      <select value={valor} aria-label={rotulo} onChange={(e) => onMudar(e.target.value as T)} className={`mt-0.5 ${campo}`}>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function PainelSigef({ model, sigef, onComandos, onPlanilha, onBaixarTexto, meridianoCentral }: Props) {
  const id = sigef.identificacao;
  const perimetro = useMemo(() => perimetroSigef(model), [model]);
  const pendencias = useMemo(() => validarSigef(perimetro, id), [perimetro, id]);
  const erros = pendencias.filter((p) => p.gravidade === 'ERRO');
  const [inicio, setInicio] = useState<{ M: string; P: string; V: string }>({ M: '1', P: '1', V: '1' });
  const [retorno, setRetorno] = useState('');
  const conferencia = useMemo(() => (perimetro && retorno.trim() ? conferirRetornoSigef(retorno, perimetro) : null), [perimetro, retorno]);
  const nomeBase = (id.denominacao || 'imovel').replace(/[\\/:*?"<>|]+/g, '-');

  const credenciadoOk = /^[A-Z0-9]{4}$/.test(id.credenciado.trim().toUpperCase());
  const motivoSemNomear = !perimetro ? 'Informe latitude, longitude e o CRS em "Onde fica" e feche o lote: a numeração segue o sentido horário a partir do vértice mais ao norte' : !credenciadoOk ? 'Preencha o código do credenciado (4 caracteres) na identificação' : null;

  const nomear = () => {
    if (!perimetro) return;
    onComandos([
      {
        type: 'NomearVerticesDoTerreno',
        pontos: perimetro.linhas.map((l) => l.ponto),
        sigef: { credenciado: id.credenciado, inicio: { M: Number(inicio.M) || 1, P: Number(inicio.P) || 1, V: Number(inicio.V) || 1 } },
      },
    ]);
  };

  const vertice = (ponto: { x: number; y: number }, patch: Omit<Extract<Command, { type: 'SetVerticeDoTerreno' }>, 'type' | 'ponto' | 'nome'>) => {
    const v = verticeNoPonto(model, ponto);
    const roteiro = roteiroPerimetrico(model);
    const nome = v?.nome ?? roteiro.vertices.find((x) => x.ponto.x === ponto.x && x.ponto.y === ponto.y)?.nome ?? 'V';
    onComandos([{ type: 'SetVerticeDoTerreno', ponto, nome, ...patch }]);
  };

  const divisaDe = (codigo: string) => {
    const l = perimetro?.linhas.find((x) => x.codigo === codigo);
    if (!l || !perimetro) return null;
    const lado = perimetro.roteiro.lados.find((x) => x.de === l.codigo);
    return lado ? (model.boundaries ?? []).find((b) => b.id === lado.divisaId) ?? null : null;
  };

  return (
    <div className="space-y-5 text-xs text-slate-700" data-testid="painel-sigef">
      <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-600">
        Estas são as peças para o <strong>credenciado</strong> revisar e enviar: a certificação, a validação da planilha contra os imóveis já
        certificados e o envio são no SIGEF, por ele.
      </p>

      {/* Identificação */}
      <section>
        <div className="flex items-center justify-between">
          <p className="font-medium text-slate-800">Identificação do imóvel</p>
          <span className={`text-[11px] ${sigef.estado === 'INDISPONIVEL' ? 'text-amber-700' : 'text-slate-500'}`}>
            {sigef.estado === 'SALVO' ? 'gravada no estudo' : sigef.estado === 'SALVANDO' ? 'gravando…' : sigef.estado === 'INDISPONIVEL' ? 'sem a tabela: só nesta aba' : 'carregando…'}
          </span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Lista rotulo="Natureza do serviço" valor={id.naturezaDoServico} opcoes={NATUREZAS_DO_SERVICO} onMudar={(v) => sigef.alterar({ naturezaDoServico: v })} />
          <Lista rotulo="Tipo pessoa" valor={id.tipoPessoa} opcoes={['Física', 'Jurídica'] as const} onMudar={(v) => sigef.alterar({ tipoPessoa: v })} />
          <Texto rotulo="Detentor (nome)" valor={id.nome} onMudar={(v) => sigef.alterar({ nome: v })} />
          <Texto rotulo={id.tipoPessoa === 'Física' ? 'CPF' : 'CNPJ'} valor={id.cpfCnpj} onMudar={(v) => sigef.alterar({ cpfCnpj: v })} />
          <Texto rotulo="Denominação do imóvel" valor={id.denominacao} onMudar={(v) => sigef.alterar({ denominacao: v })} />
          <Texto rotulo="Município" valor={id.municipio} placeholder="Belo Horizonte-MG" onMudar={(v) => sigef.alterar({ municipio: v })} />
          <Lista rotulo="Situação" valor={id.situacao} opcoes={SITUACOES_DA_AREA} onMudar={(v) => sigef.alterar({ situacao: v })} />
          <Lista rotulo="Natureza da área" valor={id.naturezaDaArea} opcoes={NATUREZAS_DA_AREA} onMudar={(v) => sigef.alterar({ naturezaDaArea: v })} />
          <Texto rotulo="Código do imóvel (SNCR/INCRA)" valor={id.codigoSncr} onMudar={(v) => sigef.alterar({ codigoSncr: v })} />
          <Texto rotulo="CNS do cartório" valor={id.cns} onMudar={(v) => sigef.alterar({ cns: v })} />
          <Texto rotulo="Matrícula" valor={id.matricula} onMudar={(v) => sigef.alterar({ matricula: v })} />
          <Texto rotulo="Código do credenciado" valor={id.credenciado} placeholder="4 caracteres" onMudar={(v) => sigef.alterar({ credenciado: v.toUpperCase().slice(0, 4) })} />
          <Texto rotulo="Responsável técnico (nome, conselho e registro)" valor={id.responsavelTecnico} onMudar={(v) => sigef.alterar({ responsavelTecnico: v })} />
          <Texto rotulo="Parcela número" valor={id.parcela.numero} onMudar={(v) => sigef.alterar({ parcela: { ...id.parcela, numero: v } })} />
        </div>
      </section>

      {!perimetro ? (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Sem coordenadas: feche o lote e informe latitude, longitude e o sistema (CRS) em "Onde fica". O SIGEF só aceita o imóvel georreferenciado em SIRGAS 2000.</span>
        </p>
      ) : (
        <>
          {/* Vértices */}
          <section>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="font-medium text-slate-800">
                Vértices · {perimetro.linhas.length} · sentido horário a partir do mais ao norte
              </p>
              <div className="flex items-end gap-1">
                {(['M', 'P', 'V'] as const).map((t) => (
                  <label key={t} className="text-[11px] text-slate-500">
                    <span className="block">Próximo {t}</span>
                    <input
                      type="number"
                      min="1"
                      value={inicio[t]}
                      aria-label={`Próximo sequencial ${t}`}
                      onChange={(e) => setInicio({ ...inicio, [t]: e.target.value })}
                      className="mt-0.5 w-16 rounded-md border border-slate-300 px-1 py-1 text-right text-xs"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={nomear}
                  disabled={!!motivoSemNomear}
                  title={motivoSemNomear ?? `${id.credenciado.toUpperCase()}-M-${inicio.M.padStart(4, '0')}… — um comando só, Ctrl+Z desfaz. A sequência é do credenciado: continue de onde ele parou.`}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Hash className="h-3.5 w-3.5" /> Nomear no padrão SIGEF
                </button>
              </div>
            </div>
            <div className="mt-1 overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-xs" data-testid="sigef-vertices">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-2 py-1.5">Código</th>
                    <th className="px-2 py-1.5">Tipo</th>
                    <th className="px-2 py-1.5 text-right">σ long (m)</th>
                    <th className="px-2 py-1.5 text-right">σ lat (m)</th>
                    <th className="px-2 py-1.5 text-right">h (m)</th>
                    <th className="px-2 py-1.5 text-right">σ h (m)</th>
                    <th className="px-2 py-1.5">Método</th>
                  </tr>
                </thead>
                <tbody>
                  {perimetro.linhas.map((l) => (
                    <tr key={`${l.ponto.x},${l.ponto.y}`} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-2 py-1" title={`${l.longitudeTexto} · ${l.latitudeTexto}`}>
                        {l.codigo}
                      </td>
                      <td className="px-2 py-1">
                        <select value={l.tipo ?? ''} aria-label={`Tipo do vértice ${l.codigo}`} onChange={(e) => vertice(l.ponto, { tipo: (e.target.value || null) as 'M' | 'P' | 'V' | null })} className="rounded-md border border-slate-300 px-1 py-0.5 text-xs">
                          <option value="">—</option>
                          <option value="M">M marco</option>
                          <option value="P">P ponto</option>
                          <option value="V">V virtual</option>
                        </select>
                      </td>
                      {(
                        [
                          ['sigmaEMm', l.sigmaLongM, 'σ long'],
                          ['sigmaNMm', l.sigmaLatM, 'σ lat'],
                          ['altitudeM', l.alturaM, 'h'],
                          ['sigmaHMm', l.sigmaAlturaM, 'σ h'],
                        ] as const
                      ).map(([chave, valor, rot]) => (
                        <td key={chave} className="px-2 py-1 text-right">
                          <input
                            key={`${chave}:${valor}`}
                            type="text"
                            inputMode="decimal"
                            defaultValue={valor === null ? '' : metrosSigef(valor)}
                            aria-label={`${rot} do vértice ${l.codigo}`}
                            onBlur={(e) => {
                              const v = numeroOuNulo(e.target.value);
                              vertice(l.ponto, chave === 'altitudeM' ? { altitudeM: v } : { [chave]: v === null ? null : Math.round(v * 1000) });
                            }}
                            className="w-20 rounded-md border border-slate-300 px-1 py-0.5 text-right text-xs"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1">
                        <select value={l.metodo ?? ''} aria-label={`Método do vértice ${l.codigo}`} onChange={(e) => vertice(l.ponto, { metodo: e.target.value || null })} className="max-w-36 rounded-md border border-slate-300 px-1 py-0.5 text-xs">
                          <option value="">—</option>
                          {Object.entries(METODOS_DE_POSICIONAMENTO).map(([c, m]) => (
                            <option key={c} value={c} disabled={!!l.tipo && !m.tipos.includes(l.tipo)}>
                              {c} · {m.rotulo}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Trechos */}
          <section>
            <p className="font-medium text-slate-800">Trechos · limite e confrontante</p>
            <div className="mt-1 overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-xs" data-testid="sigef-trechos">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-2 py-1.5">Trecho</th>
                    <th className="px-2 py-1.5">Tipo de limite</th>
                    <th className="px-2 py-1.5">Confrontante</th>
                    <th className="px-2 py-1.5">CNS</th>
                    <th className="px-2 py-1.5">Matrícula</th>
                    <th className="px-2 py-1.5">CPF/CNPJ</th>
                  </tr>
                </thead>
                <tbody>
                  {perimetro.linhas.map((l) => {
                    const b = divisaDe(l.codigo);
                    if (!b) return null;
                    const doc = (k: 'confrontanteCns' | 'confrontanteMatricula' | 'confrontanteDocumento', rot: string) => (
                      <td className="px-2 py-1">
                        <input
                          key={`${k}:${b[k] ?? ''}`}
                          type="text"
                          defaultValue={b[k] ?? ''}
                          aria-label={`${rot} do trecho ${l.codigo}`}
                          onBlur={(e) => onComandos([{ type: 'SetBoundarySigef', boundaryId: b.id, [k]: e.target.value }])}
                          className="w-24 rounded-md border border-slate-300 px-1 py-0.5 text-xs"
                        />
                      </td>
                    );
                    return (
                      <tr key={b.id} className="border-t border-slate-100">
                        <td className="whitespace-nowrap px-2 py-1 text-[11px]">
                          {l.codigo} → {l.paraCodigo}
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={b.tipoDeLimite ?? ''}
                            aria-label={`Tipo de limite do trecho ${l.codigo}`}
                            onChange={(e) => onComandos([{ type: 'SetBoundarySigef', boundaryId: b.id, tipoDeLimite: (e.target.value || null) as TipoDeLimite | null }])}
                            className="max-w-40 rounded-md border border-slate-300 px-1 py-0.5 text-xs"
                          >
                            <option value="">—</option>
                            {TIPOS_DE_LIMITE.map((t) => (
                              <option key={t} value={t}>
                                {t} · {ROTULO_DO_TIPO_DE_LIMITE[t]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input
                            key={`confrontante:${b.confrontante ?? ''}`}
                            type="text"
                            defaultValue={b.confrontante ?? ''}
                            aria-label={`Confrontante do trecho ${l.codigo}`}
                            onBlur={(e) => onComandos([{ type: 'SetBoundaryEscritura', boundaryId: b.id, medidaMm: b.medidaEscrituraMm ?? null, confrontante: e.target.value }])}
                            className="w-40 rounded-md border border-slate-300 px-1 py-0.5 text-xs"
                          />
                        </td>
                        {doc('confrontanteCns', 'CNS')}
                        {doc('confrontanteMatricula', 'Matrícula')}
                        {doc('confrontanteDocumento', 'CPF/CNPJ')}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Área no plano topográfico local (a que o SIGEF confere): {(perimetro.areaSglM2 / 10_000).toFixed(4).replace('.', ',')} ha · perímetro{' '}
              {perimetro.perimetroSglM.toFixed(2).replace('.', ',')} m.
            </p>
          </section>

          {/* Pendências */}
          <section data-testid="sigef-pendencias">
            <p className="font-medium text-slate-800">
              Pendências {erros.length > 0 ? `· ${erros.length} ${erros.length === 1 ? 'erro' : 'erros'}` : ''}
            </p>
            {pendencias.length === 0 ? (
              <p className="mt-1 flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Nada que o validador recusaria pelas regras que dá para ver aqui. O validador do SIGEF ainda confere contra os imóveis certificados.
              </p>
            ) : (
              <ul className="mt-1 max-h-48 space-y-1 overflow-auto">
                {pendencias.map((p: PendenciaSigef, i) => (
                  <li key={i} className={`rounded-md px-2 py-1 ${p.gravidade === 'ERRO' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
                    <strong className="font-mono">{p.onde}</strong>: {p.texto}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Peças */}
          <section>
            <p className="font-medium text-slate-800">Peças</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onPlanilha}
                disabled={erros.length > 0 || meridianoCentral === null}
                title={
                  erros.length > 0
                    ? `Resolva os ${erros.length} erros acima: a planilha sairia recusada pelo validador`
                    : 'O modelo oficial do INCRA (1.4 rc5) preenchido — abra no LibreOffice e valide com a extensão do SIGEF antes de enviar'
                }
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" /> Planilha ODS
              </button>
              <button
                type="button"
                onClick={() => onBaixarTexto(`${nomeBase} - memorial descritivo.txt`, memorialGeoIncra(perimetro, id), 'text/plain')}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" /> Memorial
              </button>
              <button
                type="button"
                onClick={() =>
                  onBaixarTexto(
                    `${nomeBase} - cartas de anuencia.txt`,
                    cartasDeAnuencia(perimetro, id)
                      .map((c) => c.texto)
                      .join('\n\n\f\n'),
                    'text/plain',
                  )
                }
                title="Uma carta por confrontante, com os trechos que ele confronta — separadas por quebra de página"
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" /> Cartas de anuência ({cartasDeAnuencia(perimetro, id).length})
              </button>
              <button
                type="button"
                onClick={() => onBaixarTexto(`${nomeBase} - relatorio de vertices.csv`, relatorioDeVerticesCsv(perimetro), 'text/csv')}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" /> Relatório de vértices
              </button>
            </div>
          </section>

          {/* Retorno */}
          <section>
            <p className="font-medium text-slate-800">Conferir o retorno do SIGEF</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Cole os vértices certificados (código; longitude; latitude — em GMS ou decimal). A diferença é medida contra o desenho.</p>
            <textarea
              value={retorno}
              onChange={(e) => setRetorno(e.target.value)}
              aria-label="Vértices certificados pelo SIGEF"
              rows={4}
              className={`mt-1 font-mono ${campo}`}
            />
            {conferencia && (
              <div className="mt-1 space-y-1" data-testid="sigef-retorno">
                <p className={conferencia.maiorM > 0.5 ? 'text-amber-800' : 'text-slate-700'}>
                  {conferencia.diferencas.length} vértices conferidos · maior diferença {conferencia.maiorM.toFixed(3).replace('.', ',')} m
                  {conferencia.soNoDesenho.length > 0 && ` · só no desenho: ${conferencia.soNoDesenho.join(', ')}`}
                  {conferencia.soNoRetorno.length > 0 && ` · só no retorno: ${conferencia.soNoRetorno.join(', ')}`}
                </p>
                <table className="w-full text-xs">
                  <tbody>
                    {conferencia.diferencas.map((d) => (
                      <tr key={d.codigo} className="border-t border-slate-100">
                        <td className="px-2 py-0.5">{d.codigo}</td>
                        <td className="px-2 py-0.5 text-right">ΔE {d.dLesteM.toFixed(3).replace('.', ',')} m</td>
                        <td className="px-2 py-0.5 text-right">ΔN {d.dNorteM.toFixed(3).replace('.', ',')} m</td>
                        <td className="px-2 py-0.5 text-right">{d.distanciaM.toFixed(3).replace('.', ',')} m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export type { IdentificacaoSigef };
