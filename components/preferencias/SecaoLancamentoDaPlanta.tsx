import React from 'react';
import { Cable } from 'lucide-react';
import SecaoTitulo from '../ui/SecaoTitulo';
import { usePreferenciaDaPlanta } from '../../hooks/usePreferenciaDaPlanta';
import {
  CATALOGO_DE_LANCAMENTO,
  OPCOES_CAIXAS_DE_PASSAGEM,
  type CaixasDePassagem,
} from '../../utils/preferencias/catalogoLancamento';

/**
 * Seção "Lançamento" das Preferências da Planta, grupo Elétrica (24/10/2026).
 * Plano docs/planos/2026-10-24-preferencia-caixas-de-passagem.md.
 *
 * Pedido: *"Incluir em preferencias se ele quer utilizar caixas de passagens ou utilizar prefertencialmente
 * encaminhamentos via luz no teto. o usuário escolhe"*.
 *
 * É a preferência do USUÁRIO `planta.lancamento.caixasDePassagem` (`usePreferenciaDaPlanta` com o catálogo do
 * lançamento): a caixa de seleção do painel dos eletrodutos lê e grava a MESMA escolha (mesmo cache), então mudar
 * aqui muda lá e vice-versa. Vale para quem está logado, em qualquer organização (REGRA #5: não depende de org).
 *
 * A preferência só liga/desliga as caixas; o CAMINHO é o "Encaminhamento" do painel dos eletrodutos (linha de ajuda).
 *
 * Duas opções de texto longo → grupo de rádio (escolha única, os dois textos à vista), não `<select>`.
 */
export default function SecaoLancamentoDaPlanta() {
  const [caixas, setCaixas] = usePreferenciaDaPlanta<CaixasDePassagem>('caixasDePassagem', CATALOGO_DE_LANCAMENTO);
  const nome = React.useId();

  return (
    <section aria-labelledby="pref-planta-lancamento-titulo" className="space-y-8">
      <div>
        <h3 id="pref-planta-lancamento-titulo" className="text-sm font-bold text-slate-900">
          Lançamento
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Como a planta lança os eletrodutos (Lançar, Relançar e Refazer). Vale só para você, em qualquer computador.
        </p>
      </div>

      <div className="space-y-4">
        <SecaoTitulo icon={Cable} titulo="Caixas de passagem" />
        <div role="radiogroup" aria-label="Caixas de passagem" className="space-y-3">
          {OPCOES_CAIXAS_DE_PASSAGEM.map((o) => (
            <label key={o.valor} className="flex cursor-pointer items-start gap-3 text-sm font-normal text-gray-900">
              <input
                type="radio"
                name={nome}
                value={o.valor}
                checked={caixas === o.valor}
                onChange={() => setCaixas(o.valor)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
              />
              <span>{o.rotulo}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          Sem caixas de passagem, se algum trecho passar do que a NBR 5410 pede, o lançamento avisa onde.
        </p>
        <p className="text-xs text-gray-500">
          O caminho do eletroduto (quadro → luz do ambiente → tomadas, ou árvore no teto) é o &apos;Encaminhamento&apos; do
          painel dos eletrodutos.
        </p>
      </div>
    </section>
  );
}
