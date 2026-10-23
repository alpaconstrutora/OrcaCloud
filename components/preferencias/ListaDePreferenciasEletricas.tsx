import React from 'react';
import { Lock } from 'lucide-react';
import TableSwitch from '../ui/TableSwitch';
import {
  ITENS_ELETRICOS,
  type AlvoDaPreferencia,
  type ItemDoCatalogo,
  type ItemEletrico,
} from '../../utils/preferencias/catalogo';
import type { ExibicaoEletrica } from '../../utils/preferencias/resolver';

/**
 * Lista das preferências da planta elétrica (23/10/2026): uma linha por item do catálogo, com nome,
 * explicação e uma chave por coluna (Tela | Prancha). Reusada pela gaveta Preferências e, depois,
 * pela troca "personalizar a prancha desta planta".
 *
 * As travas vêm do CATÁLOGO e de `travaDaPrancha` — nunca de "quem gravou o valor":
 *  - item que a prancha não escreve (`naPrancha: false`) → célula Prancha travada, MOTIVO_SO_NA_TELA;
 *  - item que depende de "Fios" com "Fios" desligado NAQUELA coluna → travado, MOTIVO_SEM_FIOS;
 *  - `travaDaPrancha` (não é gestor, topo em "Todas"…) → coluna Prancha inteira travada; o motivo
 *    fica escrito no cabeçalho da coluna e cada chave aponta para ele (`aria-describedby`).
 * Controle travado SEMPRE mostra o motivo escrito (não só no `title`) e mostra se está ligado ou
 * desligado, em texto escuro — nunca só esmaecido.
 */

export const MOTIVO_SEM_FIOS = 'Depende de "Fios" — ligue "Fios" para escolher este item.';
export const MOTIVO_SO_NA_TELA = 'A prancha não escreve este item.';

const ROTULO_DA_COLUNA: Record<AlvoDaPreferencia, string> = { tela: 'Tela', prancha: 'Prancha' };
const DESCRICAO_PADRAO_DA_COLUNA: Record<AlvoDaPreferencia, string> = {
  tela: 'O que aparece no seu desenho. Vale só para você.',
  prancha: 'O que sai na prancha exportada (PDF e DXF).',
};

export interface ListaDePreferenciasEletricasProps {
  colunas: AlvoDaPreferencia[];
  tela: ExibicaoEletrica;
  prancha: ExibicaoEletrica;
  /** Motivo de a coluna Prancha estar travada por inteiro; `null` = livre. */
  travaDaPrancha: string | null;
  aoAlterar(alvo: AlvoDaPreferencia, item: ItemEletrico, valor: boolean | null): void;
  aoVoltarAoPadrao(alvo: AlvoDaPreferencia): void;
  /** Por coluna: por que "Voltar ao padrão do sistema" está desligado (aparece escrito). */
  voltarDesligado?: Partial<Record<AlvoDaPreferencia, string>>;
  /** Por coluna: texto de apoio sob o título (o padrão fala de "Tela" e "Prancha" da empresa). */
  descricaoDaColuna?: Partial<Record<AlvoDaPreferencia, string>>;
  /** Texto do botão de voltar ao padrão (o padrão é "Voltar ao padrão do sistema"). */
  rotuloDoVoltar?: string;
}

function motivoDaCelula(alvo: AlvoDaPreferencia, def: ItemDoCatalogo, exibicao: ExibicaoEletrica): string | null {
  if (alvo === 'prancha' && !def.naPrancha) return MOTIVO_SO_NA_TELA;
  if (def.dependeDe && !exibicao[def.dependeDe]) return MOTIVO_SEM_FIOS;
  return null;
}


const Motivo: React.FC<{ id?: string; children: React.ReactNode }> = ({ id, children }) => (
  <p id={id} className="flex items-start gap-1 text-xs text-gray-600">
    <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </p>
);

export default function ListaDePreferenciasEletricas({
  colunas,
  tela,
  prancha,
  travaDaPrancha,
  aoAlterar,
  aoVoltarAoPadrao,
  voltarDesligado,
  descricaoDaColuna,
  rotuloDoVoltar = 'Voltar ao padrão do sistema',
}: ListaDePreferenciasEletricasProps) {
  // Ids derivados de `useId`: a lista pode montar em dois lugares ao mesmo tempo (gaveta de Preferências
  // e painel de exportação da planta) e `aria-describedby` não pode apontar para o motivo do outro.
  const base = React.useId();
  const idDoMotivoDaColuna = (alvo: AlvoDaPreferencia) => `${base}-${alvo}-trava`;
  const idDoMotivoDaCelula = (alvo: AlvoDaPreferencia, item: ItemEletrico) => `${base}-${alvo}-${item}-motivo`;
  const exibicaoDe = (alvo: AlvoDaPreferencia) => (alvo === 'tela' ? tela : prancha);
  const grade = colunas.length > 1 ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <div className="rounded-[10px] border border-gray-100">
      <div className={`grid ${grade} gap-x-6 border-b border-gray-200 px-4 py-3`}>
        {colunas.map((alvo) => {
          const trava = alvo === 'prancha' ? travaDaPrancha : null;
          const desligado = trava ?? voltarDesligado?.[alvo] ?? null;
          return (
            <div key={alvo} className="min-w-0 space-y-2">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">{ROTULO_DA_COLUNA[alvo]}</h4>
                <p className="mt-0.5 text-xs text-gray-600">
                  {descricaoDaColuna?.[alvo] ?? DESCRICAO_PADRAO_DA_COLUNA[alvo]}
                </p>
              </div>
              {trava && <Motivo id={idDoMotivoDaColuna(alvo)}>{trava}</Motivo>}
              <button
                type="button"
                onClick={() => aoVoltarAoPadrao(alvo)}
                disabled={desligado !== null}
                title={desligado ?? undefined}
                className="h-8 rounded-[6px] border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed"
              >
                {rotuloDoVoltar}
              </button>
              {!trava && desligado && <Motivo>{desligado}</Motivo>}
            </div>
          );
        })}
      </div>

      <ul className="divide-y divide-gray-100">
        {ITENS_ELETRICOS.map((def) => (
          <li key={def.item} className="px-4 py-3">
            <p className="text-sm font-medium text-gray-900">{def.rotulo}</p>
            <p className="mt-0.5 text-xs text-gray-600">{def.explicacao}</p>
            <div className={`mt-2 grid ${grade} gap-x-6`}>
              {colunas.map((alvo) => {
                const exibicao = exibicaoDe(alvo);
                const ligado = exibicao[def.item];
                const motivoProprio = motivoDaCelula(alvo, def, exibicao);
                const travaDaColuna = alvo === 'prancha' ? travaDaPrancha : null;
                const travado = motivoProprio !== null || travaDaColuna !== null;
                const descritoPor = motivoProprio
                  ? idDoMotivoDaCelula(alvo, def.item)
                  : travaDaColuna
                    ? idDoMotivoDaColuna(alvo)
                    : undefined;
                return (
                  <div key={alvo} className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <TableSwitch
                        checked={ligado}
                        disabled={travado}
                        onChange={() => aoAlterar(alvo, def.item, !ligado)}
                        ariaLabel={`${def.rotulo} · ${ROTULO_DA_COLUNA[alvo]}`}
                        ariaDescribedBy={descritoPor}
                      />
                      <span className="text-sm font-normal text-gray-900">{ligado ? 'Ligado' : 'Desligado'}</span>
                    </div>
                    {motivoProprio && <Motivo id={idDoMotivoDaCelula(alvo, def.item)}>{motivoProprio}</Motivo>}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
