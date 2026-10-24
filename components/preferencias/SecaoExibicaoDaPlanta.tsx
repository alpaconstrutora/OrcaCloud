import React from 'react';
import { Box, Grid3X3, Palette, PanelsTopLeft, type LucideIcon } from 'lucide-react';
import TableSwitch from '../ui/TableSwitch';
import SecaoTitulo from '../ui/SecaoTitulo';
import { usePreferenciaDaPlanta } from '../../hooks/usePreferenciaDaPlanta';
import {
  ITENS_DE_EXIBICAO,
  consequenciasDaEscolha,
  type GrupoDeExibicao,
  type ItemDeExibicao,
  type ValorDeExibicao,
} from '../../utils/preferencias/catalogoExibir';

/**
 * Seção "Planta, vistas e 3D" das Preferências da Planta (24/10/2026).
 * Plano docs/planos/2026-10-24-preferencias-exibicao-da-planta.md, tarefa 4.
 *
 * Reúne, num lugar só, as escolhas que o menu Vista › Exibir já tinha — agrupadas em Planta baixa,
 * Vistas, 3D e Estilos. É a MESMA preferência do usuário (`usePreferenciaDaPlanta`, chave
 * `planta.exibir.<item>`): mudar aqui muda o menu Exibir e vice-versa, porque os dois leem o mesmo
 * cache. Vale só para quem está logado e em qualquer organização (REGRA #5: não depende de org).
 *
 *  - uma linha por item do catálogo, na ordem dele; cada linha é um componente (um hook por item);
 *  - `booleano` → interruptor do repositório (`TableSwitch`), com o estado escrito ao lado;
 *  - `opcao` → `<select>` (o mesmo controle que o menu Vista usa para estilo e cor);
 *  - `automatico` (terreno 3D) → o mesmo `<select>` com Automático | Ligado | Desligado
 *    (Automático é gravado como o texto 'AUTOMATICO'; o hook troca por `null` para a tela).
 */

const GRUPOS: { grupo: GrupoDeExibicao; titulo: string; icone: LucideIcon }[] = [
  { grupo: 'PLANTA', titulo: 'Planta baixa', icone: Grid3X3 },
  { grupo: 'VISTAS', titulo: 'Vistas', icone: PanelsTopLeft },
  { grupo: '3D', titulo: '3D', icone: Box },
  { grupo: 'ESTILOS', titulo: 'Estilos', icone: Palette },
];

/** Rótulo da linha QUANDO difere do menu Exibir (o catálogo e o menu não mudam). */
const ROTULO_NA_ABA: Readonly<Record<string, string>> = {
  modoDeCor: 'Cor dos ambientes',
};

const OPCOES_DO_AUTOMATICO = [
  { valor: 'automatico', rotulo: 'Automático' },
  { valor: 'ligado', rotulo: 'Ligado' },
  { valor: 'desligado', rotulo: 'Desligado' },
] as const;

const CAMPO =
  'h-9 min-w-[11rem] max-w-full rounded-[6px] border border-gray-200 bg-white pl-3 pr-8 text-sm text-gray-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer';

function valorDoAutomatico(valor: ValorDeExibicao): string {
  return valor === null ? 'automatico' : valor ? 'ligado' : 'desligado';
}

/**
 * Itens cuja escolha tem CONSEQUÊNCIAS em outros itens (cor/Humanizada ligam o preenchimento; Declividade
 * e Hipsométrico se desligam entre si): a regra é a MESMA do menu Vista (`consequenciasDaEscolha`). Ficam
 * em componente próprio, que lê os itens envolvidos SEMPRE (os mesmos hooks em toda renderização), para
 * as demais linhas não carregarem hooks que não usam.
 */
const ITENS_COM_CONSEQUENCIAS = new Set(['modoDeCor', 'estiloPlanta', 'mostrarDeclividade', 'mostrarHipsometria']);

function LinhaDeExibicao({ def }: { def: ItemDeExibicao }) {
  return ITENS_COM_CONSEQUENCIAS.has(def.item) ? <LinhaComConsequencias def={def} /> : <LinhaComum def={def} />;
}

function LinhaComum({ def }: { def: ItemDeExibicao }) {
  const [valor, setValor] = usePreferenciaDaPlanta<ValorDeExibicao>(def.item);
  return <LinhaDoItem def={def} valor={valor} setValor={setValor} />;
}

function LinhaComConsequencias({ def }: { def: ItemDeExibicao }) {
  // Os quatro hooks rodam sempre, nesta ordem (sem hook condicional). Quando um deles é o do próprio item,
  // é o mesmo valor: dois consumidores da mesma chave andam juntos.
  const [valor, setValor] = usePreferenciaDaPlanta<ValorDeExibicao>(def.item);
  const [preenchimento, setPreenchimento] = usePreferenciaDaPlanta<boolean>('mostrarPreenchimento');
  const [declividade, setDeclividade] = usePreferenciaDaPlanta<boolean>('mostrarDeclividade');
  const [hipsometria, setHipsometria] = usePreferenciaDaPlanta<boolean>('mostrarHipsometria');

  const escolher = (proximo: ValorDeExibicao) => {
    setValor(proximo);
    // Só quando a escolha MUDA de fato (o hook ignora o igual).
    if (Object.is(proximo, valor)) return;
    const atuais: Record<string, unknown> = {
      mostrarPreenchimento: preenchimento,
      mostrarDeclividade: declividade,
      mostrarHipsometria: hipsometria,
    };
    const setters: Record<string, (v: boolean) => void> = {
      mostrarPreenchimento: setPreenchimento,
      mostrarDeclividade: setDeclividade,
      mostrarHipsometria: setHipsometria,
    };
    for (const c of consequenciasDaEscolha(def.item, proximo, (item) => atuais[item])) setters[c.item]?.(c.valor);
  };
  return <LinhaDoItem def={def} valor={valor} setValor={escolher} />;
}

function LinhaDoItem({
  def,
  valor,
  setValor,
}: {
  def: ItemDeExibicao;
  valor: ValorDeExibicao;
  setValor: (v: ValorDeExibicao) => void;
}) {
  const id = React.useId();
  const rotulo = ROTULO_NA_ABA[def.item] ?? def.rotulo;

  if (def.tipo === 'booleano') {
    const ligado = valor === true;
    return (
      <li className="flex items-center justify-between gap-4 py-2.5">
        <span className="min-w-0 text-sm font-medium text-gray-900">{rotulo}</span>
        <div className="flex shrink-0 items-center gap-2">
          <TableSwitch checked={ligado} onChange={() => setValor(!ligado)} ariaLabel={rotulo} />
          <span className="w-[4.5rem] text-sm font-normal text-gray-900">{ligado ? 'Ligado' : 'Desligado'}</span>
        </div>
      </li>
    );
  }

  const opcoes =
    def.tipo === 'automatico'
      ? OPCOES_DO_AUTOMATICO
      : (def.opcoes ?? []).map((o) => ({ valor: o.valor, rotulo: o.rotulo }));
  const atual = def.tipo === 'automatico' ? valorDoAutomatico(valor) : String(valor ?? '');

  const aoEscolher = (escolhido: string) => {
    if (def.tipo === 'automatico') {
      setValor(escolhido === 'automatico' ? null : escolhido === 'ligado');
    } else {
      setValor(escolhido);
    }
  };

  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <label htmlFor={id} className="min-w-0 text-sm font-medium text-gray-900">
        {rotulo}
      </label>
      <select id={id} value={atual} onChange={(e) => aoEscolher(e.target.value)} className={CAMPO}>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </li>
  );
}

export default function SecaoExibicaoDaPlanta() {
  return (
    <section aria-labelledby="pref-planta-exibicao-titulo" className="space-y-8">
      <div>
        <h3 id="pref-planta-exibicao-titulo" className="text-sm font-bold text-slate-900">
          Planta, vistas e 3D
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Escolha o que a planta mostra no desenho, nas vistas e no 3D. É a mesma escolha do menu Vista › Exibir e vale só
          para você, em qualquer computador.
        </p>
      </div>

      {GRUPOS.map(({ grupo, titulo, icone }) => (
        <div key={grupo} role="group" aria-label={titulo} className="space-y-4">
          <SecaoTitulo icon={icone} titulo={titulo} />
          <ul className="divide-y divide-gray-100">
            {ITENS_DE_EXIBICAO.filter((d) => d.grupo === grupo).map((def) => (
              <LinhaDeExibicao key={def.item} def={def} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
