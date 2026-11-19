/**
 * O RELATÓRIO DO LOTE (PE8d do prédio pelo Empreendimento, decisão do usuário de 19/11/2026: "numa tela do lote", aberta
 * pela Casa automática). Calculado do desenho (`relatorioDoLote`) — vale com as torres já lançadas: uma seção por torre e
 * as entradas do lote. Só leitura.
 */
import React from 'react';
import { AlertCircle, Building2, Check, Plug } from 'lucide-react';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import type { PendenciasLancadas, RelatorioDoLote } from '../../utils/predioAutomatico/relatorioDoLote';
import { ROTULO_DA_PENDENCIA, type GrupoDaPendencia } from '../../utils/blueprintGeradorPpci';

const cardCls = 'rounded-[10px] border border-gray-100 bg-white p-6 shadow-sm';
const rotuloCls = 'text-xs font-semibold text-slate-500';
const kva = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kVA`);

function Dado({ rotulo, valor, nota }: { rotulo: string; valor: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className={rotuloCls}>{rotulo}</dt>
      <dd className="text-lg font-semibold text-gray-900 tabular-nums">{valor}</dd>
      {nota && <dd className="text-xs text-slate-500">{nota}</dd>}
    </div>
  );
}

/** Uma entrada do lote: uma só é o certo; mais de uma, com o aviso no texto (nunca só a cor). */
function Entrada({ rotulo, n }: { rotulo: string; n: number }) {
  const ok = n === 1;
  return (
    <div className="space-y-1">
      <dt className={rotuloCls}>{rotulo}</dt>
      <dd className={`flex items-center gap-1.5 text-lg font-semibold tabular-nums ${ok ? 'text-gray-900' : 'text-amber-700'}`}>
        {ok ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <AlertCircle className="h-4 w-4" aria-hidden />}
        {n}
      </dd>
      <dd className="text-xs text-slate-500">{n === 1 ? 'uma no lote' : n === 0 ? 'nenhuma no desenho' : 'mais de uma no lote'}</dd>
    </div>
  );
}

/** PE9: as pendências do gerador da prévia lançada da torre (guardadas no navegador no Lançar), por grupo. */
function DoGerador({ dados }: { dados: PendenciasLancadas }) {
  const grupos = [...new Set(dados.pendencias.map((p) => p.grupo))];
  const quando = new Date(dados.quando);
  return (
    <details className="rounded-[8px] border border-gray-100 bg-gray-50 px-4 py-3" data-testid="pendencias-do-gerador">
      <summary className="cursor-pointer text-sm font-medium text-gray-800">
        {dados.pendencias.length} pendência(s) do gerador — da prévia lançada em {Number.isNaN(quando.getTime()) ? '—' : quando.toLocaleString('pt-BR')} (neste navegador)
      </summary>
      <div className="mt-3 space-y-3">
        {grupos.map((g) => (
          <div key={g} className="space-y-1">
            <p className="text-xs font-semibold text-slate-600">{ROTULO_DA_PENDENCIA[g as GrupoDaPendencia] ?? g}</p>
            <ul className="space-y-1">
              {dados.pendencias.filter((p) => p.grupo === g).map((p, i) => (
                <li key={i} className="text-sm text-gray-700">{p.texto}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function TelaRelatorioDoLote({ relatorio, doGerador = {} }: { relatorio: RelatorioDoLote | null; doGerador?: Record<string, PendenciasLancadas> }) {
  if (!relatorio) return <div className={`${cardCls} text-sm text-slate-500`}>Calculando o relatório do lote…</div>;
  if (!relatorio.torres.length)
    return <div className={`${cardCls} text-sm text-slate-600`} data-testid="relatorio-do-lote">Nenhuma torre lançada no estudo ainda — gere e lance uma torre pelo Prédio automático para ver o relatório do lote.</div>;
  return (
    <div className="space-y-6" data-testid="relatorio-do-lote">
      <section className={`${cardCls} space-y-5`}>
        <SecaoTitulo icon={Plug} titulo="Entradas do lote" resumo="uma de cada rede, para o lote inteiro" />
        <dl className="grid grid-cols-2 gap-6 md:grid-cols-5">
          <Entrada rotulo="Ligação de esgoto" n={relatorio.entradas.esgoto} />
          <Entrada rotulo="Ligação pluvial" n={relatorio.entradas.pluvial} />
          <Entrada rotulo="Cavalete de água" n={relatorio.entradas.agua} />
          <Entrada rotulo="Entrada de energia" n={relatorio.entradas.energia} />
          <Dado rotulo="Demanda da entrada" valor={kva(relatorio.demandaDoLoteKva)} nota="todas as torres" />
        </dl>
        <dl className="grid grid-cols-2 gap-6 md:grid-cols-5">
          <Dado rotulo="Janelas em parede comum" valor={relatorio.janelasNaParedeComum} nota={relatorio.janelasNaParedeComum ? 'feche-as ou confira a ventilação' : 'nenhuma'} />
          <Dado rotulo="Pontas abertas nas redes" valor={relatorio.pontasAbertas} nota="esgoto, pluvial e água fria — veja na Verificação de rede" />
        </dl>
        {relatorio.avisos.length > 0 && (
          <ul className="space-y-1.5" data-testid="avisos-do-lote">
            {relatorio.avisos.map((a) => (
              <li key={a} className="flex items-start gap-2 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {a}
              </li>
            ))}
          </ul>
        )}
      </section>
      {relatorio.torres.map((t) => (
        <section key={t.nome} className={`${cardCls} space-y-5`} data-testid="torre-do-relatorio">
          <SecaoTitulo icon={Building2} titulo={t.nome} resumo={t.quadroGeral?.alimentadoDe ? `energia pelo quadro geral da ${t.quadroGeral.alimentadoDe}` : 'a entrada de energia do lote'} />
          <dl className="grid grid-cols-2 gap-6 md:grid-cols-5">
            <Dado rotulo="Pavimentos" valor={t.pavimentos} nota="com a garagem e a cobertura" />
            <Dado rotulo="Unidades" valor={t.unidades} />
            <Dado rotulo="Quadro geral" valor={t.quadroGeral ? kva(t.quadroGeral.demandaKva) : '—'} nota={t.quadroGeral ? (t.quadroGeral.alimentadoDe ? `alimentado do QGBT da ${t.quadroGeral.alimentadoDe}` : 'na entrada de serviço') : 'sem quadro geral'} />
            <Dado rotulo="Conflitos entre redes" valor={t.conflitos} nota={`${t.encostos} encosto(s)`} />
          </dl>
          {doGerador[t.nome] ? (
            <DoGerador dados={doGerador[t.nome]} />
          ) : (
            <p className="text-xs text-slate-500">As pendências do gerador desta torre aparecem aqui quando ela é lançada neste navegador.</p>
          )}
        </section>
      ))}
    </div>
  );
}
