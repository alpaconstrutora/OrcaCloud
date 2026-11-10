// components/empreendimento/DecoradoPorTipologiaSecao.tsx
//
// "VER DECORADO" POR TIPOLOGIA (Espelho de Vendas 3D, F8 — 10/11/2026). Plano:
// docs/planos/2026-11-09-espelho-de-vendas-3d.md.
//
// Por tipologia do empreendimento, o corte 3D mobiliado (uma imagem) e as imagens
// dos ambientes decorados, cada uma com o nome. A ficha da unidade, no Espelho de
// Vendas 3D dos portais do Corretor e do Investidor, abre o decorado da tipologia
// dela — sempre com o selo "Imagem ilustrativa". As tipologias vêm do que já está
// cadastrado (a mesma lista das plantas da F5): aqui não se digita tipologia.
import React from 'react';
import { ArrowDown, ArrowUp, Check, Loader2, Sofa } from 'lucide-react';
import SecaoTitulo from '../ui/SecaoTitulo';
import Button from '../ui/Button';
import ActionIconButton from '../ui/ActionIconButton';
import ImageDropzone from '../ui/ImageDropzone';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { empreendimentoTipologiaPlantasService } from '../../services/empreendimentoTipologiaPlantasService';
import { empreendimentoTipologiaDecoradoService } from '../../services/empreendimentoTipologiaDecoradoService';
import { tipologiasDoEmpreendimento } from '../../utils/espelhoPlantaDaTipologia';
import {
  MAXIMO_DE_AMBIENTES,
  TAMANHO_DO_NOME_DO_AMBIENTE,
  decoradoDoCadastro,
  problemaDoAmbiente,
  type ImagemDoDecorado,
} from '../../utils/espelhoDecoradoDaTipologia';

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

interface TipologiaDoDecorado {
  chave: string;
  rotulo: string;
  unidades: number;
}

const inputCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all';
const rotuloCls = 'text-xs font-semibold text-slate-500';
const SUGESTOES_DE_AMBIENTE = ['Sala', 'Sala de estar e jantar', 'Cozinha', 'Suíte', 'Dormitório', 'Banheiro', 'Lavabo', 'Varanda', 'Varanda gourmet', 'Área de serviço', 'Escritório'];
const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

export const DecoradoPorTipologiaSecao: React.FC<Props> = ({ empreendimentoId, organizationId, buildingId, somenteLeitura, recarga }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [tipologias, setTipologias] = React.useState<TipologiaDoDecorado[] | null>(null);
  const [imagens, setImagens] = React.useState<ImagemDoDecorado[]>([]);
  const [erro, setErro] = React.useState<string | null>(null);
  const [escolhida, setEscolhida] = React.useState<string | null>(null);
  const [enviandoCorte, setEnviandoCorte] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [nome, setNome] = React.useState('');

  React.useEffect(() => {
    let vivo = true;
    setErro(null);
    Promise.all([
      empreendimentoTipologiaPlantasService.tipologiasNoCadastro(empreendimentoId, buildingId),
      empreendimentoTipologiaDecoradoService.listar(empreendimentoId),
    ])
      .then(([doCadastro, gravadas]) => {
        if (!vivo) return;
        const emUso = tipologiasDoEmpreendimento({ ...doCadastro, plantas: [] }).map(({ chave, rotulo, unidades }) => ({ chave, rotulo, unidades }));
        // A tipologia que saiu do cadastro mas ainda tem decorado aparece no fim, com 0 unidades, para poder ser limpa.
        const conhecidas = new Set(emUso.map((t) => t.chave));
        const orfas = new Map<string, TipologiaDoDecorado>();
        for (const i of gravadas) if (!conhecidas.has(i.tipologia_chave) && !orfas.has(i.tipologia_chave)) orfas.set(i.tipologia_chave, { chave: i.tipologia_chave, rotulo: i.tipologia, unidades: 0 });
        const lista = [...emUso, ...orfas.values()];
        setImagens(gravadas);
        setTipologias(lista);
        setEscolhida((atual) => (atual && lista.some((t) => t.chave === atual) ? atual : lista[0]?.chave ?? null));
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setTipologias([]);
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar o decorado por tipologia.');
      });
    return () => { vivo = false; };
  }, [empreendimentoId, buildingId, recarga]);

  // A prévia da imagem escolhida para o ambiente novo (ainda não enviada).
  const previa = React.useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : null), [arquivo]);
  React.useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);
  // Trocar de tipologia descarta o ambiente que estava sendo montado.
  React.useEffect(() => { setArquivo(null); setNome(''); }, [escolhida]);

  const tipologia = tipologias?.find((t) => t.chave === escolhida) ?? null;
  const { corte, ambientes } = tipologia ? decoradoDoCadastro(imagens, tipologia.chave) : { corte: null, ambientes: [] };
  const motivo = problemaDoAmbiente({ temArquivo: !!arquivo, nome, ambientesJaGravados: ambientes.length });

  const trocar = (antiga: ImagemDoDecorado | null, nova: ImagemDoDecorado | null) =>
    setImagens((atual) => [...atual.filter((i) => i.id !== antiga?.id), ...(nova ? [nova] : [])]);

  const enviarCorte = async (f: File) => {
    if (!tipologia) return;
    // F9: o corte gerado pela Planta só é trocado por uma imagem com confirmação — a Planta deixa de mostrar "em dia".
    if (corte?.origem === 'PLANTA') {
      const ok = await confirm({
        title: `Trocar o corte gerado pela Planta da tipologia ${tipologia.rotulo}?`,
        message: 'A imagem escolhida substitui o corte que a Planta gerou. Para voltar ao da Planta, envie de novo pela tela Unidades do estudo.',
        confirmLabel: 'Trocar corte',
        variant: 'danger',
      });
      if (!ok) return;
    }
    setEnviandoCorte(true);
    try {
      const salvo = await empreendimentoTipologiaDecoradoService.salvarCorte({ organizationId, empreendimentoId, tipologia: tipologia.rotulo, arquivo: f, anterior: corte });
      trocar(corte, salvo);
      showToast(`Corte 3D da tipologia ${tipologia.rotulo} gravado.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível gravar o corte.', 'error');
    } finally {
      setEnviandoCorte(false);
    }
  };

  const salvarAmbiente = async () => {
    if (!tipologia || !arquivo || motivo) return;
    setSalvando(true);
    try {
      const salvo = await empreendimentoTipologiaDecoradoService.adicionarAmbiente({ organizationId, empreendimentoId, tipologia: tipologia.rotulo, nome, arquivo, ambientesJaGravados: ambientes });
      trocar(null, salvo);
      setArquivo(null);
      setNome('');
      showToast(`Ambiente ${salvo.legenda} gravado na tipologia ${tipologia.rotulo}.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível gravar o ambiente.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (imagem: ImagemDoDecorado) => {
    if (!tipologia) return;
    const oQue = imagem.papel === 'CORTE' ? 'o corte 3D' : `o ambiente ${imagem.legenda}`;
    const ok = await confirm({
      title: `Remover ${oQue} da tipologia ${tipologia.rotulo}?`,
      message: 'A ficha das unidades desta tipologia deixa de mostrar esta imagem no decorado, nos portais do Corretor e do Investidor.',
      confirmLabel: 'Remover imagem',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await empreendimentoTipologiaDecoradoService.remover(imagem);
      trocar(imagem, null);
      showToast(imagem.papel === 'CORTE' ? 'Corte 3D removido.' : `Ambiente ${imagem.legenda} removido.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível remover a imagem.', 'error');
    }
  };

  const mover = async (indice: number, passo: -1 | 1) => {
    const nova = [...ambientes];
    const [item] = nova.splice(indice, 1);
    nova.splice(indice + passo, 0, item);
    const comOrdem = nova.map((a, ordem) => ({ ...a, ordem }));
    const antes = imagens;
    setImagens((atual) => [...atual.filter((i) => !comOrdem.some((a) => a.id === i.id)), ...comOrdem]);
    try {
      await empreendimentoTipologiaDecoradoService.reordenar(nova);
    } catch (e) {
      setImagens(antes);
      showToast(e instanceof Error ? e.message : 'Não foi possível mudar a ordem.', 'error');
    }
  };

  const resumoDe = (t: TipologiaDoDecorado) => {
    const d = decoradoDoCadastro(imagens, t.chave);
    if (!d.corte && d.ambientes.length === 0) return 'sem decorado';
    return [d.corte ? 'corte' : null, d.ambientes.length > 0 ? plural(d.ambientes.length, 'ambiente', 'ambientes') : null].filter(Boolean).join(' + ');
  };
  const comDecorado = (tipologias ?? []).filter((t) => resumoDe(t) !== 'sem decorado').length;
  const id = (campo: string) => `decorado-${empreendimentoId}-${campo}`;

  return (
    <section className="space-y-3" data-testid="decorado-por-tipologia">
      <SecaoTitulo
        icon={Sofa}
        titulo="Decorado por tipologia"
        resumo={tipologias && tipologias.length > 0 ? `${comDecorado} de ${tipologias.length} tipologia(s) com decorado` : undefined}
      />
      <p className="text-xs text-gray-500">
        O corte 3D mobiliado e as imagens dos ambientes decorados de cada tipologia. A ficha da unidade, no Espelho de Vendas 3D dos portais do Corretor e do Investidor, abre o decorado da tipologia dela em "Ver decorado". Imagem JPG, PNG ou WebP, até 5 MB.
      </p>
      <p className="text-xs font-medium text-gray-700" data-testid="decorado-aviso-selo">
        Nos portais, toda imagem aparece com o selo "Imagem ilustrativa" — o decorado não é memorial descritivo.
      </p>

      {tipologias === null && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando tipologias…</p>}
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      {tipologias && tipologias.length === 0 && !erro && (
        <p className="text-sm text-gray-500">
          Nenhuma unidade deste empreendimento tem tipologia. Preencha a tipologia das unidades (no card da torre) ou dos imóveis na Tabela de Preços, e ela aparece aqui para receber o decorado.
        </p>
      )}

      {tipologias && tipologias.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipologia do decorado">
            {tipologias.map((t) => (
              <button
                key={t.chave}
                type="button"
                role="radio"
                aria-checked={t.chave === escolhida}
                onClick={() => setEscolhida(t.chave)}
                data-testid={`decorado-tipologia-${t.chave}`}
                className={`h-9 px-3 rounded-[6px] border text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${t.chave === escolhida ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}
              >
                {t.rotulo}
                <span className={`ml-2 text-xs ${t.chave === escolhida ? 'text-blue-600' : 'text-gray-500'}`}>{resumoDe(t)}</span>
              </button>
            ))}
          </div>

          {tipologia && (
            <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5" data-testid="decorado-editor">
              <div className="space-y-1.5">
                <p className={rotuloCls}>Corte 3D mobiliado · {tipologia.rotulo}</p>
                <span title={somenteLeitura}>
                  <ImageDropzone
                    value={corte?.imagem_url ?? null}
                    onSelect={(f) => enviarCorte(f)}
                    onRemove={corte && !somenteLeitura ? () => remover(corte) : undefined}
                    uploading={enviandoCorte}
                    disabled={!!somenteLeitura}
                    hint={somenteLeitura ? 'Sem corte' : 'Arraste o corte 3D aqui ou clique para selecionar'}
                  />
                </span>
                {corte && (
                  <p className="text-xs text-gray-700" data-testid="decorado-origem-do-corte">
                    {corte.origem === 'PLANTA' ? 'Gerado da Planta' : 'Imagem enviada'}
                    {corte.updated_at ? ` em ${new Date(corte.updated_at).toLocaleDateString('pt-BR')}` : ''}
                  </p>
                )}
                <p className="text-xs text-gray-500">A vista de cima da unidade sem teto, com os móveis. Grava ao escolher a imagem; é a primeira que a ficha mostra. O estudo da Planta também pode gerar e enviar o corte (tela Unidades).</p>
                {tipologia.unidades === 0 && <p className="text-xs text-amber-700">Nenhuma unidade usa mais esta tipologia: o decorado dela não aparece em ficha nenhuma.</p>}
              </div>

              <div className="space-y-3 min-w-0">
                <p className={rotuloCls}>Ambientes decorados ({ambientes.length} de {MAXIMO_DE_AMBIENTES})</p>
                {ambientes.length === 0 && <p className="text-sm text-gray-500">Nenhum ambiente nesta tipologia.</p>}
                {ambientes.length > 0 && (
                  <ul className="divide-y divide-gray-100 rounded-[6px] border border-gray-200">
                    {ambientes.map((a, i) => (
                      <li key={a.id} className="flex items-center gap-3 p-2" data-testid="decorado-ambiente">
                        <img src={a.imagem_url} alt={`Ambiente: ${a.legenda}`} className="w-24 h-16 object-cover rounded-[6px] border border-gray-100 shrink-0" />
                        <p className="min-w-0 flex-1 text-sm text-gray-900 truncate" title={a.legenda ?? undefined}>{a.legenda}</p>
                        {!somenteLeitura && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Botão desligado esconde o title (pointer-events-none): o motivo vai no span. */}
                            <span title={i === 0 ? 'Já é o primeiro ambiente' : undefined}>
                              <ActionIconButton kind="move" icon={<ArrowUp className="w-4 h-4" />} title="Subir o ambiente" disabled={i === 0} onClick={() => mover(i, -1)} />
                            </span>
                            <span title={i === ambientes.length - 1 ? 'Já é o último ambiente' : undefined}>
                              <ActionIconButton kind="move" icon={<ArrowDown className="w-4 h-4" />} title="Descer o ambiente" disabled={i === ambientes.length - 1} onClick={() => mover(i, 1)} />
                            </span>
                            <ActionIconButton kind="delete" title="Remover o ambiente" onClick={() => remover(a)} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {!somenteLeitura && (
                  <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-4 rounded-[6px] border border-gray-100 bg-gray-50/40 p-3" data-testid="novo-ambiente">
                    {/* A lição do #315 (vista da janela): a imagem vem primeiro, e o que grava é um botão azul — com o
                        aviso escrito enquanto a imagem escolhida não foi gravada. */}
                    <div className="space-y-1.5">
                      <p className={rotuloCls}>1. Imagem do ambiente</p>
                      <ImageDropzone value={previa} onSelect={(f) => setArquivo(f)} onRemove={() => setArquivo(null)} uploading={salvando} hint="Arraste a imagem aqui ou clique para selecionar" />
                    </div>
                    <div className="space-y-3 content-start">
                      <p className={rotuloCls}>2. Nome do ambiente, e salvar</p>
                      <div className="space-y-1.5">
                        <label htmlFor={id('nome')} className={rotuloCls}>Nome</label>
                        <input
                          id={id('nome')}
                          className={inputCls}
                          list={id('sugestoes')}
                          placeholder="ex: Suíte"
                          maxLength={TAMANHO_DO_NOME_DO_AMBIENTE}
                          value={nome}
                          onChange={(e) => setNome(e.target.value)}
                        />
                        <datalist id={id('sugestoes')}>
                          {SUGESTOES_DE_AMBIENTE.map((s) => <option key={s} value={s} />)}
                        </datalist>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        {motivo && <p className="text-xs text-gray-600" data-testid="novo-ambiente-motivo">{motivo}</p>}
                        {!motivo && <p className="text-xs font-medium text-amber-700" data-testid="novo-ambiente-por-salvar">A imagem ainda não foi gravada. Clique em Salvar ambiente.</p>}
                        <span title={motivo ?? undefined}>
                          <Button type="button" disabled={!!motivo || salvando} onClick={salvarAmbiente}>
                            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-[15px] h-[15px]" />}
                            Salvar ambiente
                          </Button>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default DecoradoPorTipologiaSecao;
