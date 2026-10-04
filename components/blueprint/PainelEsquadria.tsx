import React, { useCallback, useEffect, useState } from 'react';
import { BookMarked, Search, X } from 'lucide-react';
import {
  FATOR_DE_SOMBREAMENTO_DA_PROTECAO,
  PROTECOES_SOLARES,
  ROTULO_DA_PROTECAO_SOLAR,
  fatorDeSombreamento,
  nomeDaEsquadria,
  nomeDoTipoDeAbertura,
  type Esquadria,
  type Opening,
  type ProtecaoSolar,
  type VidroDaAbertura,
} from '../../utils/blueprintKernel';
import { textoEmCm } from '../../utils/blueprintMedidaCm';
import DatabasePickerModal from '../DatabasePickerModal';
import { useOrgContext, useOrgWriteTarget, forEachTargetOrg } from '../../hooks/useOrgContext';
import {
  listOpeningTypes,
  saveOpeningType,
  type TipoDeEsquadria,
} from '../../services/blueprintOpeningTypeService';

/**
 * O TIPO da abertura selecionada — nome de projeto, item de catálogo e o
 * catálogo de tipos salvos da organização.
 *
 * ─── POR QUE ARQUIVO PRÓPRIO ────────────────────────────────────────────────
 *
 * Irmão de `PainelCamadasParede`, pela mesma razão: `PainelParedeSelecionada`
 * já cuida de parede E abertura, e um catálogo com busca de item, seletor de
 * tipo e "salvar como tipo" é uma tela inteira. Chega lá como slot.
 *
 * ─── APLICAR UM TIPO É UM LOTE, NÃO UM CAMPO ────────────────────────────────
 *
 * Escolher "P1" muda kind, largura, altura, peitoril E esquadria — cinco
 * coisas, um gesto, um passo de desfazer. Por isso `onAplicarTipo` recebe o
 * tipo inteiro e quem o monta (o editor) faz o `applyBatch`. Aplicar só a
 * esquadria e deixar a porta em 90×210 quando o tipo diz 80×210 produziria uma
 * P1 que não é P1, e o quadro de esquadrias a listaria como outra linha.
 *
 * ─── O QUE FICA GRAVADO É A CÓPIA ───────────────────────────────────────────
 *
 * O painel mostra o que a ABERTURA carrega (`abertura.esquadria`), não o que o
 * catálogo diz. Se o catálogo mudar depois, a porta continua como foi
 * desenhada — ver `Esquadria` em `model.ts`.
 */
interface Props {
  abertura: Opening;
  /** Grava nome/item/descrição na abertura. `null` remove o tipo. */
  onEsquadria: (esquadria: Esquadria | null) => void;
  /** Aplica um tipo salvo INTEIRO — kind, medidas, esquadria e vidro — num lote. */
  onAplicarTipo: (tipo: TipoDeEsquadria) => void;
  /** VIDRO (E1.1 da climatização): grava fator solar, U e proteção solar. `null` remove a declaração. */
  onVidro: (vidro: VidroDaAbertura | null) => void;
}

const VIDRO_VAZIO: VidroDaAbertura = { fatorSolar: null, uWm2K: null, protecao: 'SEM', fatorSombreamento: null };
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Campo numérico anulável do vidro: vazio = não declarado; fora da faixa não grava e a borda avisa. */
function CampoDoVidro({ rotulo, valor, faixa, passo, unidade, onValor, chave }: { rotulo: string; valor: number | null; faixa: { min: number; max: number }; passo: number; unidade: string; onValor: (v: number | null) => boolean; chave: string }) {
  const [texto, setTexto] = useState(valor == null ? '' : String(valor));
  useEffect(() => setTexto(valor == null ? '' : String(valor)), [valor, chave]);
  const n = Number(texto.replace(',', '.'));
  const invalido = texto.trim() !== '' && !(Number.isFinite(n) && n > faixa.min && n <= faixa.max);
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-600">
      {rotulo}
      <input
        type="number"
        min={faixa.min}
        max={faixa.max}
        step={passo}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          const t = texto.trim();
          if (t === '') {
            // Sem mudança, sem comando: perder o foco não pode gerar um passo de desfazer.
            if (valor == null) return;
            if (!onValor(null)) setTexto(String(valor));
            return;
          }
          const v = Number(t.replace(',', '.'));
          if (v === valor) return;
          if (Number.isFinite(v) && v > faixa.min && v <= faixa.max) onValor(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label={rotulo}
        aria-invalid={invalido}
        title={`Maior que ${faixa.min} e até ${faixa.max}${unidade ? ` ${unidade}` : ''}; vazio = não declarado`}
        className={`h-8 w-20 rounded-[6px] border px-2 text-sm font-normal text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${invalido ? 'border-red-400' : 'border-slate-200'}`}
      />
      {unidade && <span className="text-slate-400">{unidade}</span>}
    </label>
  );
}

export default function PainelEsquadria({ abertura, onEsquadria, onAplicarTipo, onVidro }: Props) {
  const [escolhendoItem, setEscolhendoItem] = useState(false);

  // ⚠️ REGRA #5: `orgId` do CONTEXTO, e `null` ("Todas") não bloqueia a leitura.
  const { orgId } = useOrgContext();
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
  const [tipos, setTipos] = useState<TipoDeEsquadria[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(() => {
    listOpeningTypes(orgId)
      .then(setTipos)
      // Falhar em carregar o catálogo não pode derrubar o painel: o tipo se
      // digita à mão sem ele.
      .catch(() => setTipos([]));
  }, [orgId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const esq = abertura.esquadria ?? null;
  const ehVao = abertura.kind === 'passage';

  // Os tipos que servem a ESTA abertura: mesmo kind. Oferecer uma janela para
  // aplicar numa porta trocaria o tipo da abertura por tabela, e quem quer
  // trocar porta por janela tem o seletor de tipo logo acima.
  const compativeis = tipos.filter((t) => t.kind === abertura.kind);

  function definirNome(nome: string) {
    const limpo = nome.trim();
    if (!limpo) {
      // Nome vazio REMOVE o tipo: o kernel recusa esquadria sem nome, e
      // "apaguei o nome" é o gesto de quem quer a abertura sem tipo.
      if (esq) onEsquadria(null);
      return;
    }
    onEsquadria({ nome: limpo, itemCode: esq?.itemCode ?? '', descricao: esq?.descricao ?? '' });
  }

  async function salvarComoTipo() {
    if (!esq || ehVao) return;
    const target = await resolveWriteOrg('all-allowed');
    if (!target) return;
    const { ok, failed } = await forEachTargetOrg(target, (org) =>
      saveOpeningType(org, {
        nome: esq.nome,
        kind: abertura.kind as TipoDeEsquadria['kind'],
        widthMm: abertura.widthMm,
        heightMm: abertura.heightMm,
        sillMm: abertura.sillMm,
        embutida: abertura.embutida,
        itemCode: esq.itemCode,
        descricao: esq.descricao,
        vidro: abertura.vidro ?? null,
      }),
    );
    setAviso(
      failed.length === 0
        ? ok > 1
          ? `Tipo ${esq.nome} salvo em ${ok} organizações.`
          : `Tipo ${esq.nome} salvo.`
        : `Salvo em ${ok}; ${failed.length} falharam.`,
    );
    carregar();
  }

  if (ehVao) {
    // Vão livre não tem esquadria por definição — não há caixilho a comprar. O
    // painel diz isso em vez de sumir: sumir calado faria parecer que o tipo
    // está em outro lugar.
    return (
      <p className="mt-3 text-[11px] text-slate-500">
        Vão livre não tem tipo de esquadria: não há caixilho a orçar.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-700">Tipo de esquadria</h4>
        <span className="text-[11px] text-slate-400">{nomeDaEsquadria(abertura)}</span>
      </div>

      {/* APLICAR um tipo salvo: kind, medidas e esquadria, num lote. */}
      <div className="mt-2 flex items-center gap-1.5">
        <select
          value=""
          onChange={(e) => {
            const t = tipos.find((x) => x.id === e.target.value);
            if (t) onAplicarTipo(t);
          }}
          disabled={compativeis.length === 0}
          aria-label="Aplicar um tipo de esquadria salvo"
          title={
            compativeis.length === 0
              ? `Nenhum tipo de ${nomeDoTipoDeAbertura(abertura.kind).toLowerCase()} salvo nesta organização`
              : 'Aplica nome, item, largura, altura e peitoril do tipo — um passo de desfazer'
          }
          className="h-8 min-w-0 flex-1 rounded-[6px] border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">
            {compativeis.length === 0 ? 'Nenhum tipo salvo' : 'Aplicar tipo…'}
          </option>
          {compativeis.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome} · {textoEmCm(t.widthMm)}×{textoEmCm(t.heightMm)} cm
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void salvarComoTipo()}
          disabled={!esq}
          title={
            esq
              ? `Guarda "${esq.nome}" com estas medidas e este item para reaplicar em outras aberturas`
              : 'Dê um nome ao tipo para poder salvá-lo'
          }
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[6px] border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 transition-all hover:border-blue-300 hover:text-blue-600 active:scale-95 disabled:opacity-40"
        >
          <BookMarked className="h-3.5 w-3.5" />
          Salvar tipo
        </button>
      </div>

      {/* O NOME de projeto. Vazio = sem tipo. */}
      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        Nome
        <input
          type="text"
          key={`${abertura.id}-nome-${esq?.nome ?? ''}`}
          defaultValue={esq?.nome ?? ''}
          maxLength={24}
          placeholder={abertura.kind === 'window' ? 'J1' : 'P1'}
          aria-label="Código de projeto da esquadria, como P1 ou J3"
          onBlur={(e) => definirNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="h-8 w-24 rounded-[6px] border border-slate-200 px-2 text-sm font-normal text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </label>

      {/* O ITEM de catálogo. Só se escolhe com nome dado: item sem nome não é
          tipo, e o kernel recusa. */}
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setEscolhendoItem(true)}
          disabled={!esq}
          title={esq ? 'SINAPI ou base própria. A unidade do item decide se entra no orçamento por unidade ou por m².' : 'Dê um nome ao tipo antes de escolher o item'}
          className="inline-flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-[6px] border border-slate-200 bg-white px-2 text-left text-[13px] text-slate-700 transition-all hover:border-blue-300 disabled:opacity-40"
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">
            {esq?.itemCode ? `${esq.itemCode} · ${esq.descricao || 'sem descrição'}` : 'Escolher item de catálogo…'}
          </span>
        </button>
        {esq?.itemCode && (
          <button
            type="button"
            onClick={() => onEsquadria({ ...esq, itemCode: '', descricao: '' })}
            aria-label="Remover o item de catálogo do tipo"
            title="Remove o item; o nome fica."
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {esq && !esq.itemCode && (
        <p className="mt-1.5 text-[11px] text-amber-700">
          Sem item de catálogo, {esq.nome} entra no quadro de esquadrias mas fica FORA do
          orçamento — com aviso, não em silêncio.
        </p>
      )}
      {aviso && <p className="mt-1.5 text-[11px] text-emerald-700">{aviso}</p>}

      {/* VIDRO E PROTEÇÃO SOLAR (E1.1 da climatização, kernel 0.91.0): o que a
          carga térmica lê da janela. Declarar a proteção já cria a declaração;
          fator solar e U são opcionais (vazio = o motor usa a hipótese do estudo). */}
      {(() => {
        const vidro = abertura.vidro ?? null;
        const base = vidro ?? VIDRO_VAZIO;
        const chave = `${abertura.id}-${JSON.stringify(vidro)}`;
        const gravar = (parte: Partial<VidroDaAbertura>) => onVidro({ ...base, ...parte });
        const emUso = vidro ? fatorDeSombreamento(vidro) : null;
        return (
          <div className="mt-3 border-t border-slate-100 pt-3" data-testid="vidro-da-abertura">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-700">Vidro e proteção solar</h4>
              {vidro && (
                <button type="button" onClick={() => onVidro(null)} className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline">
                  Remover declaração
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                Proteção
                <select
                  value={vidro ? vidro.protecao : ''}
                  onChange={(e) => {
                    const protecao = e.target.value as ProtecaoSolar | '';
                    if (protecao === '') {
                      onVidro(null);
                      return;
                    }
                    // Personalizada exige o fator: parte do que valia até aqui (tabela ou declarado).
                    gravar({ protecao, fatorSombreamento: protecao === 'PERSONALIZADA' ? (base.fatorSombreamento ?? (vidro ? fatorDeSombreamento(vidro) : 1)) : base.fatorSombreamento });
                  }}
                  aria-label="Proteção solar da abertura"
                  className="h-8 rounded-[6px] border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">não declarada</option>
                  {PROTECOES_SOLARES.map((p) => (
                    <option key={p} value={p}>{ROTULO_DA_PROTECAO_SOLAR[p]}{p !== 'PERSONALIZADA' ? ` (${fmt(FATOR_DE_SOMBREAMENTO_DA_PROTECAO[p])})` : ''}</option>
                  ))}
                </select>
              </label>
              <CampoDoVidro chave={chave} rotulo="Fator solar" valor={base.fatorSolar} faixa={{ min: 0, max: 1 }} passo={0.01} unidade="" onValor={(fatorSolar) => (gravar({ fatorSolar }), true)} />
              <CampoDoVidro chave={chave} rotulo="U" valor={base.uWm2K} faixa={{ min: 0, max: 10 }} passo={0.1} unidade="W/m²·K" onValor={(uWm2K) => (gravar({ uWm2K }), true)} />
              <CampoDoVidro
                chave={chave}
                rotulo="Sombreamento"
                valor={base.fatorSombreamento}
                faixa={{ min: 0, max: 1 }}
                passo={0.05}
                unidade=""
                onValor={(fatorSombreamento) => {
                  // Personalizada não aceita vazio: o kernel recusa — o campo volta ao que era.
                  if (fatorSombreamento == null && base.protecao === 'PERSONALIZADA') return false;
                  gravar({ fatorSombreamento });
                  return true;
                }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500" data-testid="vidro-em-uso">
              {vidro
                ? `Fator de sombreamento em uso: ${fmt(emUso!)} (${vidro.fatorSombreamento != null ? 'declarado' : 'tabela da proteção — CONFERIR NA NORMA: NBR 16655-3'}).`
                : 'Sem declaração: a carga térmica usa a hipótese do estudo, marcada CONFERIR.'}
            </p>
          </div>
        );
      })()}

      <DatabasePickerModal
        isOpen={escolhendoItem}
        onClose={() => setEscolhendoItem(false)}
        title="Item da esquadria"
        subtitle="SINAPI ou base própria. Item em UN entra no orçamento por contagem; em m², pela área do vão."
        onSelect={(item) => {
          if (esq) onEsquadria({ ...esq, itemCode: item.code, descricao: item.description });
          setEscolhendoItem(false);
        }}
      />

      {orgTargetModal}
    </div>
  );
}
