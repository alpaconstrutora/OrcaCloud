import React, { useCallback, useEffect, useState } from 'react';
import { Boxes, Download, FileText, GitCompare, Image, Maximize2, Ruler, Shapes, Share2, Table, UploadCloud } from 'lucide-react';
import type { BlueprintStudy, BlueprintSnapshotSummary } from '../../types/blueprint';
import {
  blueprintApprovalService,
  type CarimboDeAprovacao,
} from '../../services/blueprintApprovalService';
import { getSnapshot, listSnapshots } from '../../services/blueprintService';
import {
  exportarDxf,
  exportarIfc,
  exportarManifesto,
  exportarQuantitativoXlsx,
  exportarPranchasPdf,
  exportarPranchasPng,
  type PranchaExport,
} from '../../services/blueprintExportService';
import {
  ESCALAS,
  MENOR_ESCALA_DE_PLANTA,
  PAPEIS,
  enquadrar,
  orientar,
  type OpcoesExportacao,
} from '../../utils/blueprintExport';
import { diffSnapshots, type DiffSnapshots } from '../../utils/blueprintDiff';
import type { TopografiaParaDxf } from '../../utils/blueprintDxf';
import {
  compartilharComCliente,
  publicarNoGed,
  type FormatoParaGed,
} from '../../services/blueprintGedService';
import { clientService } from '../../services/clientService';
import {
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  type BlueprintModel,
} from '../../utils/blueprintKernel';

/**
 * Épico E4 — histórico de versões, comparação e exportação.
 *
 * A escala é ENTRADA, não resultado: quem exporta escolhe 1:50 ou 1:100, e a
 * tela diz de antemão se cabe no papel. Encolher para caber produziria uma folha
 * que diz 1:100 e mede outra coisa — e alguém vai medir com escalímetro.
 */
export default function PainelVersoes({
  study,
  custoPorUid,
  topografia,
}: {
  study: BlueprintStudy;
  /**
   * Curvas de nível e pontos cotados da versão de topografia exibida, para as
   * camadas `TOPO-*` do DXF. Vem do editor porque a topografia vive fora do
   * payload — o snapshot não a carrega.
   */
  topografia?: TopografiaParaDxf;
  /**
   * Custo por elemento da prévia do orçamento, quando há uma. Sem prévia, a
   * caixa "incluir custo" nem aparece — não há o que incluir.
   */
  custoPorUid?: ReadonlyMap<string, { totalBRL: number; linhas: number }>;
}) {
  const [snapshots, setSnapshots] = useState<BlueprintSnapshotSummary[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [selecionada, setSelecionada] = useState<string>('');
  const [modelo, setModelo] = useState<BlueprintModel | null>(null);
  const [denominador, setDenominador] = useState(100);
  /**
   * Incluir custo no IFC? PADRÃO NÃO, e a cada exportação.
   *
   * Um IFC sai da empresa — vai para o calculista, para o cliente, para quem
   * coordena o modelo. Embutir custo nele é embutir preço de venda num anexo de
   * e-mail: pode ser exatamente o desejado numa coordenação interna e é um
   * vazamento numa troca com terceiro, e a diferença não está no arquivo, está
   * em quem recebe.
   *
   * Por isso não é preferência guardada: quem exporta decide de novo toda vez.
   * Uma caixa que ficasse marcada da última vez mandaria preço no dia em que
   * alguém esquecesse de olhar.
   */
  const [comCusto, setComCusto] = useState(false);
  const [papelId, setPapelId] = useState('A4');
  const [paisagem, setPaisagem] = useState(false);
  const [cotas, setCotas] = useState(false);
  /** Quais pranchas entram no PDF/PNG/DXF — planta e/ou as quatro elevações. */
  const [pranchas, setPranchas] = useState<PranchaExport[]>(['planta']);

  const [compararCom, setCompararCom] = useState<string>('');
  const [diff, setDiff] = useState<DiffSnapshots | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await listSnapshots(study.id);
      setSnapshots(lista);
      if (lista.length > 0) setSelecionada((atual) => atual || lista[0].id);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao carregar as versões');
    } finally {
      setCarregando(false);
    }
  }, [study.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // O modelo da versão escolhida é reconstruído do payload canônico — o mesmo
  // caminho do quantitativo. Exportar do que está na tela produziria uma folha
  // que cita uma versão e desenha outra.
  useEffect(() => {
    if (!selecionada) return;
    setDiff(null);
    getSnapshot(selecionada)
      .then((s) =>
        setModelo(
          s ? modelFromCanonicalPayload(parseCanonicalPayload(JSON.stringify(s.payload))) : null,
        ),
      )
      .catch((e) => setErro(e instanceof Error ? e.message : 'falha ao abrir a versão'));
  }, [selecionada]);

  const papel = orientar(PAPEIS.find((p) => p.id === papelId) ?? PAPEIS[0], paisagem);
  const snapshot = snapshots.find((s) => s.id === selecionada) ?? null;
  // O enquadramento precisa saber das cotas: elas consomem uma faixa fixa de
  // papel, então ligar cota pode fazer uma escala que cabia deixar de caber.
  const enq = modelo ? enquadrar(modelo, denominador, papel, cotas) : null;

  /**
   * Quanto o desenho ocuparia NA ESCALA SUGERIDA.
   *
   * Sem isto a sugestão mente por omissão. `escalaSugerida` é a primeira da
   * lista que CABE, e para um desenho minúsculo isso é sempre 1:20 — a menor
   * da lista. Dizer "em 1:20 ele preenche a folha" seria falso: ele fica cinco
   * vezes maior e continua um risco no meio do branco, porque o problema não é
   * a escala, é não haver o que desenhar.
   */
  const ocupacaoNaSugerida =
    modelo && enq?.escalaSugerida
      ? enquadrar(modelo, enq.escalaSugerida, papel, cotas).ocupacao
      : null;

  /**
   * O carimbo da revisão selecionada.
   *
   * Buscado à parte, e não junto da lista: `blueprint_snapshots` carrega o
   * payload inteiro do desenho, e trazê-lo para ler três colunas seriam
   * megabytes por versão listada.
   */
  const [carimbo, setCarimbo] = useState<CarimboDeAprovacao | null>(null);
  const [enviandoAprovacao, setEnviandoAprovacao] = useState(false);
  /**
   * ⚠️ ERRO PRÓPRIO, e não o `erro` do painel.
   *
   * O painel tem um slot de erro só, no RODAPÉ. Ele fica abaixo da dobra numa
   * lista de versões, e foi exatamente isso que escondeu de mim que "Enviar
   * para aprovação" não funcionava: o serviço levantava, o estado de erro era
   * gravado, e a tela não mostrava nada onde eu estava olhando. Falha tem de
   * aparecer ONDE a ação foi pedida.
   */
  const [erroAprovacao, setErroAprovacao] = useState<string | null>(null);

  /** Publicação no GED: qual formato está subindo, o que deu certo e o que não. */
  const [publicando, setPublicando] = useState<FormatoParaGed | null>(null);
  const [erroGed, setErroGed] = useState<string | null>(null);
  const [publicado, setPublicado] = useState<string | null>(null);

  /**
   * O que ACABOU de ser publicado — os ids que o botão de compartilhar usa.
   *
   * ⚠️ Guardar os ids, e não "a planta", é o desenho inteiro desta seção. O
   * caminho antigo mandava a pessoa para o módulo Documentos achar os arquivos
   * entre todos os da obra — e achar o arquivo certo é justamente o passo mais
   * fácil de errar, com a revisão anterior ao lado da nova e a cobertura como um
   * segundo arquivo de nome parecido. Errar ali manda a revisão errada ao
   * cliente, e a tela não teria como perceber.
   */
  const [publicados, setPublicados] = useState<string[]>([]);
  const [clientes, setClientes] = useState<{ id: string; name: string }[] | null>(null);
  const [clienteId, setClienteId] = useState('');
  const [compartilhando, setCompartilhando] = useState(false);
  const [erroCompartilhar, setErroCompartilhar] = useState<string | null>(null);
  const [compartilhado, setCompartilhado] = useState<string | null>(null);

  /**
   * ⚠️ TROCAR DE VERSÃO APAGA A OFERTA DE COMPARTILHAR.
   *
   * É o caso que quebra a implementação ingênua desta seção: publicar a revisão
   * 3, mudar o seletor para a 7 e clicar em compartilhar. Os ids guardados são
   * os da 3, a tela inteira fala da 7, e o cliente recebe a revisão errada — sem
   * erro nenhum, que é o pior jeito de errar.
   *
   * Efeito PRÓPRIO, e não uma linha dentro do que carrega o modelo, porque
   * aquele roda antes destes estados existirem no corpo do componente.
   */
  useEffect(() => {
    setPublicados([]);
    setPublicado(null);
    setErroGed(null);
    setClienteId('');
    setCompartilhado(null);
    setErroCompartilhar(null);
  }, [selecionada]);

  /**
   * Os clientes só são buscados quando há o que compartilhar.
   *
   * ⚠️ Pela organização do ESTUDO, e não pelo seletor do topo — que parece
   * contrariar a REGRA #5 e é o contrário dela. Com "Todas as organizações"
   * selecionado, o contexto devolve nulo e a lista viria com clientes de TODAS
   * as organizações; compartilhar um documento da org A com um cliente da org B
   * é vazamento entre inquilinos. O documento nasce em `study.organization_id`
   * (é o que `publicarNoGed` usa), então o destinatário tem de ser de lá.
   */
  useEffect(() => {
    if (publicados.length === 0 || clientes !== null) return;
    let vivo = true;
    clientService
      .listClients(study.organization_id)
      .then((lista) => {
        if (vivo) setClientes(lista.map((c) => ({ id: c.id!, name: c.name })));
      })
      .catch((e) => {
        // Aparece ao lado do seletor: uma lista vazia sem motivo pareceria
        // "esta organização não tem cliente", que é uma frase diferente.
        if (vivo) setErroCompartilhar(e instanceof Error ? e.message : 'falha ao carregar clientes');
      });
    return () => {
      vivo = false;
    };
  }, [publicados.length, clientes, study.organization_id]);

  /**
   * Compartilha com o cliente o que ACABOU de ser publicado — a cobertura junto.
   *
   * ⚠️ A cobertura vai porque é o `.txt` que declara o que o arquivo NÃO contém,
   * e é o único motivo pelo qual entregar um IFC parcial é honesto. Mandar o
   * desenho e reter a cobertura faria no Portal o que a publicação evita.
   */
  async function compartilhar() {
    if (publicados.length === 0 || !clienteId) return;
    setCompartilhando(true);
    setErroCompartilhar(null);
    setCompartilhado(null);
    try {
      await compartilharComCliente(publicados, clienteId);
      const nome = clientes?.find((c) => c.id === clienteId)?.name ?? 'o cliente';
      setCompartilhado(
        `${publicados.length} arquivo${publicados.length > 1 ? 's' : ''} no Portal de ${nome}.`,
      );
    } catch (e) {
      setErroCompartilhar(e instanceof Error ? e.message : 'falha ao compartilhar');
    } finally {
      setCompartilhando(false);
    }
  }

  useEffect(() => {
    let vivo = true;
    if (!snapshot?.id) {
      setCarimbo(null);
      return;
    }
    void blueprintApprovalService
      .carimbo(snapshot.id)
      .then((c) => {
        if (vivo) setCarimbo(c);
      })
      .catch(() => {
        if (vivo) setCarimbo(null);
      });
    return () => {
      vivo = false;
    };
  }, [snapshot?.id]);

  async function enviarParaAprovacao() {
    if (!snapshot?.id) return;
    setEnviandoAprovacao(true);
    setErroAprovacao(null);
    try {
      await blueprintApprovalService.enviarParaAprovacao(snapshot.id, study.organization_id);
      setCarimbo(await blueprintApprovalService.carimbo(snapshot.id));
    } catch (e) {
      setErroAprovacao(e instanceof Error ? e.message : 'falha ao enviar para aprovação');
    } finally {
      setEnviandoAprovacao(false);
    }
  }

  function opcoes(): OpcoesExportacao {
    return {
      denominador,
      papel,
      titulo: study.name,
      revisao: snapshot?.revision ?? 0,
      hash: snapshot?.hash ?? '',
      // O IFC usa o estudo para GUID estável de projeto/edifício e para a
      // procedência em `Pset_OpuraPlanta`; as outras saídas ignoram.
      studyId: study.id,
      cotas,
      // Custo no IFC só quando explicitamente marcado nesta exportação — ver o
      // comentário da caixa, abaixo. `undefined`, e não um mapa vazio, para o
      // gerador não declarar moeda à toa.
      custoPorUid:
        comCusto && custoPorUid?.size
          ? new Map([...custoPorUid].map(([uid, c]) => [uid, c.totalBRL]))
          : undefined,
      // ⚠️ O carimbo só viaja quando EXISTE. Revisão que nunca passou por
      // aprovação não menciona o assunto no arquivo — dizer "não aprovado"
      // afirmaria que alguém olhou e recusou.
      aprovacao: carimbo
        ? {
            status: carimbo.status,
            aprovadoPor: carimbo.aprovadoPor,
            aprovadoEm: carimbo.aprovadoEm,
          }
        : undefined,
    };
  }

  /**
   * Publica no GED o formato pedido.
   *
   * ⚠️ Exige SNAPSHOT, e não só modelo: sem revisão e sem hash o arquivo
   * chegaria ao GED sem dizer de que desenho saiu — que é justamente o que a
   * publicação existe para resolver.
   */
  async function publicar(formato: FormatoParaGed) {
    if (!modelo || !snapshot) return;
    setPublicando(formato);
    setErroGed(null);
    setPublicado(null);
    try {
      const docs = await publicarNoGed(formato, modelo, opcoes(), {
        organizationId: study.organization_id,
        projectId: study.project_id,
        titulo: study.name,
        revisao: snapshot.revision,
        hash: snapshot.hash,
      });
      setPublicado(
        `${docs.length} arquivo${docs.length > 1 ? 's' : ''} em Documentos: ${docs
          .map((d) => d.artefato.tipo)
          .join(', ')}.`,
      );
      // ⚠️ ACUMULA, e não substitui: publicar PDF e depois IFC são dois cliques,
      // e trocar a lista mandaria ao cliente só o último. Quem publicou os dois
      // quer os dois no Portal.
      setPublicados((antes) => [...new Set([...antes, ...docs.map((d) => d.documento.id)])]);
      setCompartilhado(null);
    } catch (e) {
      // A falha aparece AQUI, ao lado do botão. Ver `erroAprovacao`: a fatia
      // anterior desta etapa foi publicada quebrada porque o erro renderizava
      // fora da vista de quem clicou.
      setErroGed(e instanceof Error ? e.message : 'falha ao publicar no GED');
    } finally {
      setPublicando(null);
    }
  }

  function exportar(fn: (m: BlueprintModel, o: OpcoesExportacao) => void) {
    if (!modelo) return;
    setErro(null);
    try {
      fn(modelo, opcoes());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao exportar');
    }
  }

  // Os CORTES entram depois das cinco fixas, na ordem do modelo. Vindo antes,
  // a lista reordenaria as pranchas de sempre a cada corte novo.
  const PRANCHAS: { id: PranchaExport; rotulo: string }[] = [
    { id: 'planta', rotulo: 'Planta' },
    { id: 'frente', rotulo: 'Frente' },
    { id: 'fundos', rotulo: 'Fundos' },
    { id: 'lateral-esq', rotulo: 'Lat. esq.' },
    { id: 'lateral-dir', rotulo: 'Lat. dir.' },
    ...(modelo?.sections ?? []).map((c) => ({
      id: `corte:${c.id}` as PranchaExport,
      rotulo: `Corte ${c.rotulo}`,
    })),
  ];
  const alternarPrancha = (id: PranchaExport) =>
    setPranchas((atual) => {
      const proximo = atual.includes(id) ? atual.filter((p) => p !== id) : [...atual, id];
      // Mantém a ordem canônica (planta, frente, fundos, laterais).
      return PRANCHAS.map((p) => p.id).filter((p) => proximo.includes(p));
    });
  const elevacoesSelecionadas = pranchas.filter(
    (p): p is Exclude<PranchaExport, 'planta'> => p !== 'planta',
  );

  async function comparar() {
    if (!compararCom || !modelo) return;
    setOcupado(true);
    setErro(null);
    try {
      const outro = await getSnapshot(compararCom);
      if (!outro) return;
      const antigo = modelFromCanonicalPayload(
        parseCanonicalPayload(JSON.stringify(outro.payload)),
      );
      // A ordem importa na leitura: a versão MAIS ANTIGA é o "antes".
      const revOutro = snapshots.find((s) => s.id === compararCom)?.revision ?? 0;
      const revAtual = snapshot?.revision ?? 0;
      setDiff(
        revOutro < revAtual ? diffSnapshots(antigo, modelo) : diffSnapshots(modelo, antigo),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao comparar');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="overflow-y-auto">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Versões</h2>
        <p className="text-xs text-slate-500">
          Cada versão publicada é imutável. Exportar sempre parte dela, nunca do
          rascunho na tela.
        </p>
      </div>

      {carregando ? (
        <p className="px-4 py-3 text-xs text-slate-500">Carregando…</p>
      ) : snapshots.length === 0 ? (
        <p className="px-4 py-3 text-xs text-slate-500">
          Nenhuma versão publicada ainda. Publique para poder exportar e comparar.
        </p>
      ) : (
        <>
          {/* ── Histórico ──────────────────────────────────────────────────── */}
          <ul className="divide-y divide-slate-100 border-b border-slate-200">
            {snapshots.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelecionada(s.id)}
                  aria-current={s.id === selecionada}
                  className={`w-full px-4 py-2 text-left text-xs hover:bg-slate-50 ${
                    s.id === selecionada ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className="font-medium text-slate-700">Versão {s.revision}</span>
                  <span className="ml-2 text-slate-500">
                    {new Date(s.published_at).toLocaleString('pt-BR')}
                  </span>
                  <span className="block font-mono text-[10px] text-slate-400">
                    {s.hash.slice(0, 16)}
                  </span>
                  {s.notes && <span className="block text-slate-500">{s.notes}</span>}
                </button>
              </li>
            ))}
          </ul>

          {/* ── Aprovação ──────────────────────────────────────────────────
              O que se aprova é a REVISÃO, e não o estudo: ela é imutável e
              carrega o hash, então o carimbo diz exatamente o que foi aprovado.
              E aprovar não tranca nada — publicar continua livre. */}
          {snapshot && (
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Aprovação
              </h3>
              {carimbo ? (
                <>
                  <p className="mt-1 text-xs text-slate-700">{carimbo.status}</p>
                  {carimbo.aprovadoPor && (
                    <p className="text-[11px] text-slate-500">
                      {carimbo.aprovadoPor}
                      {carimbo.aprovadoEm &&
                        ` · ${new Date(carimbo.aprovadoEm).toLocaleDateString('pt-BR')}`}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-slate-400">
                    O carimbo sai no IFC junto do hash desta revisão.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Esta revisão não passou por aprovação. Enviar não tranca nada — publicar e
                    editar continuam livres; o que fica é o registro de quem aprovou e sobre
                    qual versão.
                  </p>
                  {erroAprovacao && (
                    <p className="mt-1.5 text-[11px] text-red-700">{erroAprovacao}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => void enviarParaAprovacao()}
                    disabled={enviandoAprovacao}
                    className="mt-1.5 inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border border-slate-300 px-2.5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    Enviar para aprovação
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Exportação ─────────────────────────────────────────────────── */}
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Exportar versão {snapshot?.revision}
            </h3>

            <div className="mt-2 flex gap-1.5">
              <label className="flex-1 text-[11px] text-slate-600">
                Escala
                <select
                  value={denominador}
                  onChange={(e) => setDenominador(Number(e.target.value))}
                  aria-label="Escala"
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  {ESCALAS.map((d) => (
                    <option key={d} value={d}>
                      1:{d}
                      {d < MENOR_ESCALA_DE_PLANTA ? ' · detalhe' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-[11px] text-slate-600">
                Papel
                <select
                  value={papelId}
                  onChange={(e) => setPapelId(e.target.value)}
                  aria-label="Papel"
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  {PAPEIS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* AJUSTAR À FOLHA escolhe a melhor escala DA LISTA, não um número
                livre. É a diferença entre ajustar e encolher: 1:37,4 preenche a
                folha e não se mede no escalímetro, então a folha passaria a
                declarar uma escala que ninguém consegue conferir. A escala
                continua sendo ENTRADA — o botão só poupa a busca manual. */}
            {enq?.escalaSugerida && enq.escalaSugerida !== denominador && (
              <button
                type="button"
                onClick={() => setDenominador(enq.escalaSugerida!)}
                title="Escolhe a maior escala da lista em que o desenho ainda cabe nesta folha"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                <Maximize2 className="h-3 w-3" />
                Ajustar à folha (1:{enq.escalaSugerida})
              </button>
            )}

            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={paisagem}
                  onChange={(e) => setPaisagem(e.target.checked)}
                />
                Paisagem
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={cotas}
                  onChange={(e) => setCotas(e.target.checked)}
                />
                <Ruler className="h-3 w-3" /> Cotas
              </label>
            </div>
            {cotas && (
              <p className="mt-1 text-[11px] text-slate-500">
                Cotas medidas no EIXO das paredes — a medida de face é menor em meia
                espessura de cada lado. A folha declara isso.
              </p>
            )}

            {/* PRANCHAS — planta e/ou as quatro elevações. O PDF sai com uma
                página por prancha marcada; o PNG, um arquivo por prancha. As
                elevações são derivadas (read-only) e sem remoção de linha
                oculta, a mesma limitação da tela. */}
            <div className="mt-2">
              <p className="text-[11px] font-medium text-slate-600">Pranchas</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {PRANCHAS.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={pranchas.includes(p.id)}
                      onChange={() => alternarPrancha(p.id)}
                    />
                    {p.rotulo}
                  </label>
                ))}
              </div>
              {pranchas.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-700">Marque ao menos uma prancha.</p>
              )}
            </div>

            {/* SEM GEOMETRIA não é problema de escala, e mandar a pessoa mexer
                na escala seria mandá-la resolver a coisa errada. Medição
                traçada à mão NÃO entra na folha: a exportação desenha o
                modelo — paredes, ambientes, aberturas. */}
            {enq?.vazio && (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                Esta versão não tem geometria publicada — a folha sai só com o
                carimbo. As medições traçadas sobre a planta de fundo não entram na
                exportação; elas chegam ao orçamento pela aba Medições.
              </p>
            )}

            {/* O AVISO SIMÉTRICO. O painel só sabia reclamar de desenho grande
                demais; desenho pequeno demais saía numa folha quase branca, sem
                uma palavra — e o número que resolvia (`escalaSugerida`) já
                estava calculado, só não era mostrado nesta direção. */}
            {enq && !enq.vazio && enq.cabe && enq.ocupacao < 0.25 && (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                O desenho vai ocupar {(enq.ocupacao * 100).toFixed(0)}% da folha em 1:
                {denominador} — ele mede {enq.desenhoLarguraMm.toFixed(0)} ×{' '}
                {enq.desenhoAlturaMm.toFixed(0)} mm no papel.{' '}
                {/* Se nem a maior escala da lista resolve, o problema NÃO é a
                    escala — é o tamanho do que foi desenhado. Mandar trocar de
                    escala aqui faria a pessoa exportar de novo e encontrar a
                    mesma folha quase branca. */}
                {ocupacaoNaSugerida !== null && ocupacaoNaSugerida < 0.25
                  ? `Nem em 1:${enq.escalaSugerida}, a maior da lista, ele passaria de ` +
                    `${(ocupacaoNaSugerida * 100).toFixed(0)}% — o desenho é pequeno para ` +
                    `esta folha. Confira se é isto que você quer exportar.`
                  : enq.escalaSugerida && enq.escalaSugerida !== denominador
                    ? `Em 1:${enq.escalaSugerida} ele preenche a folha.`
                    : ''}
              </p>
            )}

            {/* O aviso vem ANTES do botão: descobrir que não cabe depois de
                clicar em exportar é descobrir tarde. */}
            {enq && !enq.cabe && (
              <p className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
                O desenho não cabe em 1:{denominador} neste papel — ele mede{' '}
                {enq.desenhoLarguraMm.toFixed(0)} × {enq.desenhoAlturaMm.toFixed(0)} mm, e a
                área útil é {enq.utilLarguraMm} × {enq.utilAlturaMm} mm.{' '}
                {enq.escalaSugerida
                  ? `A partir de 1:${enq.escalaSugerida} cabe.`
                  : 'Nenhuma escala da lista serve — use um papel maior.'}
              </p>
            )}

            <div className="mt-2 flex gap-1.5">
              <BotaoExportar
                icone={FileText}
                rotulo="PDF"
                onClick={() => exportar((m, o) => exportarPranchasPdf(m, o, pranchas))}
                disabled={!modelo || pranchas.length === 0 || (pranchas.includes('planta') && !enq?.cabe)}
              />
              <BotaoExportar
                icone={Image}
                rotulo="PNG"
                onClick={() => exportar((m, o) => exportarPranchasPng(m, o, pranchas))}
                disabled={!modelo || pranchas.length === 0 || (pranchas.includes('planta') && !enq?.cabe)}
              />
              <BotaoExportar
                icone={Download}
                rotulo="Manifesto"
                onClick={() => exportar(exportarManifesto)}
                disabled={!modelo}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              O manifesto é o JSON que liga o arquivo à versão — não depende de alguém
              ter lido o carimbo.
            </p>

            {/* QUANTITATIVO em planilha. Grupo próprio, e não junto do PDF/PNG:
                aqueles saem em escala de PAPEL e este não tem escala nenhuma —
                é número, não desenho. Também não vai com DXF/IFC, que são troca
                de GEOMETRIA com outro programa. */}
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Quantitativo
            </h3>
            <div className="mt-1.5 flex gap-1.5">
              <BotaoExportar
                icone={Table}
                rotulo="Planilha"
                onClick={() => exportar(exportarQuantitativoXlsx)}
                disabled={!modelo}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Uma aba por família — ambientes, paredes, aberturas e estrutura — com o
              número em célula numérica, que soma. Sem preço: para virar orçamento, use
              o de-para, que trava a unidade do item.
            </p>

            {/* Troca de arquivo com CAD e BIM. Separado da folha de propósito: os
                dois saem em 1:1, em unidade real, e a escala do papel não se
                aplica a eles. */}
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Para outros programas
            </h3>
            <div className="mt-1.5 flex gap-1.5">
              <BotaoExportar
                icone={Shapes}
                rotulo="DXF"
                onClick={() =>
                  exportar((m, o) => exportarDxf(m, o, elevacoesSelecionadas, undefined, topografia))
                }
                disabled={!modelo}
              />
              <BotaoExportar
                icone={Boxes}
                rotulo="IFC"
                onClick={() => exportar(exportarIfc)}
                disabled={!modelo}
              />
            </div>

            {/* A CAIXA DO CUSTO. Só aparece quando há prévia de orçamento —
                oferecer "incluir custo" sem custo apurado seria uma opção que
                não faz nada. Desmarcada sempre: ver `comCusto`. */}
            {!!custoPorUid?.size && (
              <label className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={comCusto}
                  onChange={(e) => setComCusto(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Incluir o <strong>custo</strong> de cada elemento no IFC
                  <span className="block text-[10px] text-amber-700">
                    O arquivo passa a levar preço. Marque só se ele fica na empresa.
                  </span>
                </span>
              </label>
            )}

            <p className="mt-1 text-[11px] text-slate-500">
              DXF e IFC saem em <strong>1:1, em milímetro real</strong> — a escala é da
              prancha, não do arquivo. Cada um vem com um <code>.txt</code> dizendo o que
              contém e o que não contém. O IFC é de <strong>coordenação</strong>: leva
              portas e janelas com vão, propriedades e quantidades, e cada elemento mantém
              o mesmo identificador entre versões; <strong>não leva</strong> escada,
              forro, instalações nem armadura.
            </p>

            {/* ── PUBLICAR NO GED ───────────────────────────────────────────
                Seção própria, e depois das exportações de propósito: baixar e
                publicar não são a mesma ação com destinos diferentes. O que
                baixa vira arquivo na pasta de Downloads de uma pessoa; o que
                publica entra no controle de revisão da empresa e fica onde
                alguém procura daqui a seis meses. */}
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Publicar no GED
            </h3>
            <div className="mt-1.5 flex gap-1.5">
              {(['pdf', 'dxf', 'ifc', 'xlsx'] as FormatoParaGed[]).map((f) => (
                <BotaoExportar
                  key={f}
                  icone={UploadCloud}
                  rotulo={f.toUpperCase()}
                  nomeAcessivel={`Publicar ${f.toUpperCase()} no GED`}
                  onClick={() => publicar(f)}
                  disabled={!modelo || !snapshot || publicando !== null}
                />
              ))}
            </div>
            {!snapshot && (
              <p className="mt-1 text-[11px] text-amber-700">
                Só versão <strong>publicada</strong> vai para o GED: sem revisão e sem
                hash, o arquivo chegaria lá sem dizer de que desenho saiu.
              </p>
            )}
            {publicando && (
              <p className="mt-1 text-[11px] text-slate-500">Enviando {publicando.toUpperCase()}…</p>
            )}
            {erroGed && <p className="mt-1 text-[11px] text-red-600">{erroGed}</p>}
            {publicado && (
              <p className="mt-1 text-[11px] text-emerald-700">{publicado}</p>
            )}
            <p className="mt-1 text-[11px] text-slate-500">
              O arquivo entra em <strong>Documentos</strong>, na obra do estudo, com a
              revisão no nome e o hash na descrição — e o <code>.txt</code> de cobertura
              vai junto. Publicar <strong>não</strong> mostra nada ao cliente: é uma
              decisão à parte, logo abaixo.
            </p>

            {/* ── COMPARTILHAR COM O CLIENTE ────────────────────────────────
                Só aparece DEPOIS de publicar, e age sobre o que acabou de ser
                publicado. Não é "compartilhar a planta", é "compartilhar ESTES
                arquivos" — o que elimina a etapa de achar o documento no GED,
                que é onde o erro mora: a revisão anterior está ao lado da nova,
                com nome parecido, e mandar a errada não dá aviso nenhum. */}
            {publicados.length > 0 && (
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Compartilhar com o cliente
                </h3>
                <p className="mt-1 text-[11px] text-slate-500">
                  Manda ao <strong>Portal do Cliente</strong> os{' '}
                  <strong>{publicados.length}</strong> arquivo
                  {publicados.length > 1 ? 's' : ''} que você acabou de publicar — a
                  cobertura junto.
                </p>
                <div className="mt-1.5 flex gap-1.5">
                  <select
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                    aria-label="Cliente"
                    className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="">
                      {clientes === null ? 'Carregando…' : 'Selecione o cliente…'}
                    </option>
                    {(clientes ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void compartilhar()}
                    disabled={!clienteId || compartilhando}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Share2 className="h-3 w-3" />
                    {compartilhando ? 'Enviando…' : 'Compartilhar'}
                  </button>
                </div>
                {clientes !== null && clientes.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Nenhum cliente cadastrado nesta organização.
                  </p>
                )}
                {/* A falha aparece AQUI, ao lado do botão — ver `erroGed`. */}
                {erroCompartilhar && (
                  <p className="mt-1 text-[11px] text-red-600">{erroCompartilhar}</p>
                )}
                {compartilhado && (
                  <p className="mt-1 text-[11px] text-emerald-700">{compartilhado}</p>
                )}
              </div>
            )}
          </div>

          {/* ── Comparação ─────────────────────────────────────────────────── */}
          <div className="px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Comparar
            </h3>

            {snapshots.length < 2 ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Só há uma versão publicada — não há com o que comparar.
              </p>
            ) : (
              <div className="mt-2 flex gap-1.5">
                <select
                  value={compararCom}
                  onChange={(e) => setCompararCom(e.target.value)}
                  aria-label="Versão a comparar"
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="">Selecione…</option>
                  {snapshots
                    .filter((s) => s.id !== selecionada)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        Versão {s.revision}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => void comparar()}
                  disabled={ocupado || !compararCom}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <GitCompare className="h-3 w-3" /> Comparar
                </button>
              </div>
            )}

            {diff && (
              <div className="mt-3">
                <p className="text-[11px] text-slate-600">
                  {diff.resumo.paredesAntes} → {diff.resumo.paredesDepois} paredes ·{' '}
                  {diff.resumo.ambientesAntes} → {diff.resumo.ambientesDepois} ambientes ·{' '}
                  {diff.resumo.deltaAreaM2 >= 0 ? '+' : ''}
                  {diff.resumo.deltaAreaM2.toFixed(2).replace('.', ',')} m²
                </p>

                {diff.identicos ? (
                  <p className="mt-2 text-[11px] text-slate-500">
                    As duas versões têm a mesma geometria.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {diff.alteracoes.map((a, i) => (
                      <li
                        key={`${a.tipo}-${i}`}
                        className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700"
                      >
                        {a.descricao}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {erro && <p className="px-4 pb-3 text-xs text-red-600">{erro}</p>}
    </div>
  );
}

function BotaoExportar({
  icone: Icone,
  rotulo,
  onClick,
  disabled,
  nomeAcessivel,
}: {
  icone: React.ElementType;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  /**
   * Nome para quem não vê o cabeçalho da seção.
   *
   * ⚠️ Existe porque "PDF" passou a aparecer DUAS vezes neste painel — uma para
   * baixar, outra para publicar no GED. Para quem lê a tela, o cabeçalho
   * desambigua; para quem a ouve, e para o teste, os dois botões tinham o mesmo
   * nome e viraram a mesma coisa.
   */
  nomeAcessivel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={nomeAcessivel}
      className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
    >
      <Icone className="h-3 w-3" /> {rotulo}
    </button>
  );
}
