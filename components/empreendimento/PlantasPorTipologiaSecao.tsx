// components/empreendimento/PlantasPorTipologiaSecao.tsx
//
// PLANTA BAIXA POR TIPOLOGIA (Espelho de Vendas 3D, F5 — 10/11/2026). Plano:
// docs/planos/2026-11-09-espelho-de-vendas-3d.md.
//
// Uma imagem por tipologia do empreendimento. A ficha da unidade, no Espelho de
// Vendas 3D dos portais do Corretor e do Investidor, mostra a planta da tipologia
// dela. As tipologias vêm do que já está cadastrado (unidades das torres e imóveis
// do prédio no estoque): aqui não se digita tipologia, só se sobe a imagem.
import React from 'react';
import { LayoutTemplate, Loader2 } from 'lucide-react';
import SecaoTitulo from '../ui/SecaoTitulo';
import ImageDropzone from '../ui/ImageDropzone';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { empreendimentoTipologiaPlantasService } from '../../services/empreendimentoTipologiaPlantasService';
import { tipologiasDoEmpreendimento, type PlantaDaTipologia, type TipologiaDoEmpreendimento } from '../../utils/espelhoPlantaDaTipologia';

interface Props {
  empreendimentoId: string;
  organizationId: string;
  /** O prédio do estoque ligado ao empreendimento: as tipologias dos imóveis dele também entram na lista. */
  buildingId?: string | null;
  /** Motivo do modo só leitura (o mesmo do TowerEditor). */
  somenteLeitura?: string;
  /** Muda quando as unidades mudaram na tela de cima: a lista de tipologias é relida. */
  recarga?: unknown;
}

const plural = (n: number) => (n === 1 ? '1 unidade' : `${n} unidades`);

export const PlantasPorTipologiaSecao: React.FC<Props> = ({ empreendimentoId, organizationId, buildingId, somenteLeitura, recarga }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [tipologias, setTipologias] = React.useState<TipologiaDoEmpreendimento[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState<string | null>(null);
  const cadastro = React.useRef<{ unidades: (string | null)[]; imoveis: (string | null)[] }>({ unidades: [], imoveis: [] });
  const plantas = React.useRef<PlantaDaTipologia[]>([]);

  const montar = React.useCallback(() => {
    setTipologias(tipologiasDoEmpreendimento({ ...cadastro.current, plantas: plantas.current }));
  }, []);

  React.useEffect(() => {
    let vivo = true;
    setErro(null);
    Promise.all([
      empreendimentoTipologiaPlantasService.tipologiasNoCadastro(empreendimentoId, buildingId),
      empreendimentoTipologiaPlantasService.listar(empreendimentoId),
    ])
      .then(([doCadastro, gravadas]) => {
        if (!vivo) return;
        cadastro.current = doCadastro;
        plantas.current = gravadas;
        montar();
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setTipologias([]);
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar as plantas por tipologia.');
      });
    return () => { vivo = false; };
  }, [empreendimentoId, buildingId, recarga, montar]);

  const enviar = async (t: TipologiaDoEmpreendimento, arquivo: File) => {
    setEnviando(t.chave);
    try {
      const salva = await empreendimentoTipologiaPlantasService.salvar({ organizationId, empreendimentoId, tipologia: t.rotulo, arquivo, anterior: t.planta });
      plantas.current = [...plantas.current.filter((p) => p.tipologia_chave !== salva.tipologia_chave), salva];
      montar();
      showToast(`Planta da tipologia ${t.rotulo} gravada.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível gravar a planta.', 'error');
    } finally {
      setEnviando(null);
    }
  };

  const remover = async (t: TipologiaDoEmpreendimento) => {
    if (!t.planta) return;
    const ok = await confirm({
      title: `Remover a planta da tipologia ${t.rotulo}?`,
      message: 'A ficha das unidades desta tipologia deixa de mostrar a planta nos portais do Corretor e do Investidor.',
      confirmLabel: 'Remover planta',
      variant: 'danger',
    });
    if (!ok) return;
    setEnviando(t.chave);
    try {
      await empreendimentoTipologiaPlantasService.remover(t.planta);
      plantas.current = plantas.current.filter((p) => p.id !== t.planta!.id);
      montar();
      showToast(`Planta da tipologia ${t.rotulo} removida.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível remover a planta.', 'error');
    } finally {
      setEnviando(null);
    }
  };

  const comPlanta = (tipologias ?? []).filter((t) => t.planta).length;
  const emUso = (tipologias ?? []).filter((t) => t.unidades > 0).length;

  return (
    <section className="space-y-3" data-testid="plantas-por-tipologia">
      <SecaoTitulo
        icon={LayoutTemplate}
        titulo="Plantas por tipologia"
        resumo={tipologias && tipologias.length > 0 ? `${comPlanta} de ${emUso} tipologia(s) com planta` : undefined}
      />
      <p className="text-xs text-gray-500">
        A planta baixa de cada tipologia aparece na ficha da unidade no Espelho de Vendas 3D dos portais do Corretor e do Investidor. Imagem JPG, PNG ou WebP, até 5 MB.
      </p>

      {tipologias === null && (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando tipologias…</p>
      )}
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      {tipologias && tipologias.length === 0 && !erro && (
        <p className="text-sm text-gray-500">
          Nenhuma unidade deste empreendimento tem tipologia. Preencha a tipologia das unidades (no card da torre) ou dos imóveis na Tabela de Preços, e ela aparece aqui para receber a planta.
        </p>
      )}

      {tipologias && tipologias.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tipologias.map((t) => (
            <div key={t.chave} className="space-y-1.5" data-testid={`planta-${t.chave}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-gray-900 truncate" title={t.rotulo}>{t.rotulo}</p>
                <p className="text-xs text-gray-500 whitespace-nowrap">
                  {t.unidades > 0 ? plural(t.unidades) : 'nenhuma unidade usa'}
                </p>
              </div>
              <span title={somenteLeitura}>
                <ImageDropzone
                  value={t.planta?.imagem_url ?? null}
                  onSelect={(arquivo) => enviar(t, arquivo)}
                  onRemove={t.planta ? () => remover(t) : undefined}
                  uploading={enviando === t.chave}
                  disabled={!!somenteLeitura}
                  hint={somenteLeitura ? 'Sem planta' : 'Arraste a planta aqui ou clique para selecionar'}
                />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default PlantasPorTipologiaSecao;
