/**
 * CAMADAS E DESEMPENHO TÉRMICO DE UMA PEÇA (04/10/2026, E1.2 da climatização):
 * a seção que a água de telhado e a laje mostram no painel da seleção — a
 * composição de CIMA para baixo (`EditorDeCamadas`), "Adicionar camada", a
 * escolha no catálogo e o U/R pela NBR 15220 quando toda camada tem λ.
 *
 * Rsi 0,17 / Rse 0,04: superfície horizontal com fluxo DESCENDENTE — o caso da
 * carga térmica de verão (o calor entra pelo telhado). O piso e o forro em
 * `PainelAcabamentos` usam os mesmos números pela mesma razão.
 *
 * Sem camadas, o U fica "não avaliado" — e a tela diz, em vez de inventar.
 */
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { CamadaParede } from '../../utils/blueprintKernel';
import { desempenhoTermico, type Material } from '../../utils/blueprintMateriais';
import DatabasePickerModal from '../DatabasePickerModal';
import EditorDeCamadas from './EditorDeCamadas';

interface Props {
  /** Chave estável da peça — reinicia os campos não controlados quando a seleção muda. */
  chave: string;
  titulo: string;
  camadas: CamadaParede[] | undefined;
  /** `null` remove todas (o kernel não aceita lista vazia). */
  onCamadas: (camadas: CamadaParede[] | null) => void;
  materiais?: readonly Material[];
  /** O que entra como primeira camada ao clicar "Adicionar" numa peça sem camadas. */
  camadaInicial?: CamadaParede;
}

const CAMADA_PADRAO: CamadaParede = { espessuraMm: 100, itemCode: '', descricao: 'Laje de concreto', funcao: 'ESTRUTURAL' };
const fmt2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CamadasDaPeca({ chave, titulo, camadas, onCamadas, materiais = [], camadaInicial = CAMADA_PADRAO }: Props) {
  const [escolhendoItemDe, setEscolhendoItemDe] = useState<number | null>(null);
  const lista = camadas ?? [];
  const mudar = (novas: CamadaParede[]) => onCamadas(novas.length ? novas : null);
  const termico = lista.length && materiais.length ? desempenhoTermico(lista, new Map(materiais.map((m) => [m.codigo, m])), 0.17, 0.04) : null;
  return (
    <div className="mt-3 border-t border-slate-100 pt-3" data-testid="camadas-da-peca">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-700">{titulo}</h4>
        <button
          type="button"
          onClick={() => mudar([...lista, lista.length ? { ...lista[lista.length - 1], itemCode: '', descricao: '' } : camadaInicial])}
          className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 transition-all hover:border-blue-300 hover:text-blue-600 active:scale-95"
          aria-label={`Adicionar camada — ${titulo}`}
        >
          <Plus className="h-3 w-3" /> Adicionar camada
        </button>
      </div>
      <EditorDeCamadas chave={chave} camadas={lista} rotuloDaOrdem="de cima para baixo" onMudar={mudar} onEscolherMaterial={(i) => setEscolhendoItemDe(i)} materiais={materiais} />
      <p className="mt-1.5 text-[11px] text-slate-500" data-testid="camadas-desempenho-termico">
        {lista.length === 0
          ? 'Sem camadas declaradas: U não avaliado — a carga térmica usa a hipótese do estudo, marcada CONFERIR.'
          : !termico
            ? 'Sem biblioteca de materiais: U não calculado.'
            : termico.transmitanciaWm2K != null
              ? `U ${fmt2(termico.transmitanciaWm2K)} W/m²·K · R ${fmt2(termico.resistenciaM2KW)} m²·K/W (NBR 15220, fluxo descendente).`
              : `Sem λ em ${termico.camadasSemLambda.length} camada(s) — U não calculado.`}
      </p>
      <DatabasePickerModal
        isOpen={escolhendoItemDe !== null}
        onClose={() => setEscolhendoItemDe(null)}
        title="Item da camada"
        subtitle="SINAPI ou base própria. A espessura continua a da camada; o item dá o material e a descrição."
        onSelect={(item) => {
          if (escolhendoItemDe !== null) mudar(lista.map((c, k) => (k === escolhendoItemDe ? { ...c, itemCode: item.code, descricao: item.description } : c)));
          setEscolhendoItemDe(null);
        }}
      />
    </div>
  );
}
