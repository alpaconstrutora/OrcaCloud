import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  MousePointer2,
  Minus,
  DoorOpen,
  Redo2,
  Undo2,
  Upload,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Calculator,
  Pencil,
  Grid3x3,
  Ruler,
  Square,
  Spline,
  Hash,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useBlueprintEditor, type BlueprintTool } from '../../hooks/useBlueprintEditor';
import BlueprintCanvas, { rotuloPasso, type AjustePonta } from './BlueprintCanvas';
import PainelOrcamento from './PainelOrcamento';
import PainelVersoes from './PainelVersoes';
import ControlesDeFundo, { ResumoDaAfericao } from './ControlesDeFundo';
import AbasDoPainel from './AbasDoPainel';
import PainelMedicoes from './PainelMedicoes';
import PainelParedeSelecionada from './PainelParedeSelecionada';
import { useBlueprintMedicoes } from '../../hooks/useBlueprintMedicoes';
import { useBlueprintUnderlay } from '../../hooks/useBlueprintUnderlay';
import type { PontoPx } from '../../utils/blueprintUnderlay';
import type { BlueprintQuantitySnapshot, BlueprintStudy } from '../../types/blueprint';
import {
  computeAndStoreQuantities,
  getQuantitySnapshot,
  listSnapshots,
} from '../../services/blueprintService';
import {
  POLITICA_PADRAO,
  KernelError,
  areCollinear,
  computeQuantities,
  formatarQuantidade,
  isFreeWallEnd,
  pontaEsticada,
  type AlinhamentoParede,
  type Command,
  type Point,
} from '../../utils/blueprintKernel';

/**
 * Tela do editor de plantas (épico E3).
 *
 * A camada FOCÁVEL do "híbrido" do Spike B mora aqui: o canvas é opaco para
 * leitor de tela, então a barra de ferramentas, a lista de ambientes e o estado
 * do salvamento são DOM de verdade — navegáveis por teclado e anunciáveis. O
 * canvas cuida da massa de geometria; o DOM cuida de tudo que precisa ter foco.
 */

/**
 * Inverte o lado do traçado. Do EIXO ele passa a desenhar pela face, porque "o
 * outro lado do eixo" não existe: quem aperta a tecla está pedindo um lado, e
 * devolver o mesmo estado faria a tecla parecer quebrada.
 */
function inverterLado(atual: AlinhamentoParede): AlinhamentoParede {
  return atual === 'ESQUERDA' ? 'DIREITA' : atual === 'DIREITA' ? 'ESQUERDA' : 'DIREITA';
}

const ESPESSURA_PADRAO_MM = 150;
const ALTURA_PADRAO_MM = 2800;

const ABAS = [
  { id: 'ambientes', rotulo: 'Ambientes' },
  { id: 'medicoes', rotulo: 'Medições' },
  { id: 'quantitativos', rotulo: 'Quantitativos' },
  { id: 'orcamento', rotulo: 'Orçamento' },
  { id: 'versoes', rotulo: 'Versões' },
] as const;

type AbaDoPainel = (typeof ABAS)[number]['id'];

interface Props {
  study: BlueprintStudy;
  branchId: string;
  onBack: () => void;
}

export default function BlueprintEditor({ study, branchId, onBack }: Props) {
  const editor = useBlueprintEditor(branchId);
  const [espessura, setEspessura] = useState(ESPESSURA_PADRAO_MM);
  // `null` = automatico: o passo acompanha o zoom. Qualquer numero fixa o passo.
  const [passoGrade, setPassoGrade] = useState<number | null>(null);
  const [passoEmVigor, setPassoEmVigor] = useState(100);
  const [larguraAbertura, setLarguraAbertura] = useState(900);
  const [aba, setAba] = useState<AbaDoPainel>('ambientes');
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [ortogonal, setOrtogonal] = useState(true);
  /** Mostra o comprimento de cada parede no desenho, como uma cota de planta. */
  const [mostrarMedidas, setMostrarMedidas] = useState(false);
  /**
   * Onde o clique cai: no eixo ou na face da parede.
   *
   * O padrão é a FACE À DIREITA porque o trabalho real aqui é copiar planta de
   * fundo: quem copia aponta o canto que está desenhado, e contornando o perímetro
   * no sentido do relógio a parede nasce para dentro. Desenhar pelo eixo continua
   * a um clique de distância, para quem está criando planta nova.
   */
  const [alinhamento, setAlinhamento] = useState<AlinhamentoParede>('DIREITA');
  /** Aferição em curso: os dois pontos já clicados, esperando a distância. */
  const [afericao, setAfericao] = useState<{ p1: PontoPx; p2: PontoPx } | null>(null);
  const [distanciaDigitada, setDistanciaDigitada] = useState('');
  const [alinharNaAfericao, setAlinharNaAfericao] = useState(false);
  const [qtdOficial, setQtdOficial] = useState<BlueprintQuantitySnapshot | null>(null);
  const [gerando, setGerando] = useState(false);
  const [tipoAbertura, setTipoAbertura] = useState<'door' | 'window'>('door');

  const levelId = editor.model.levels[0]?.id ?? null;

  const fundo = useBlueprintUnderlay(study.id, study.organization_id, levelId);
  const [camadaAtiva, setCamadaAtiva] = useState('Geral');
  /** Camadas desligadas. Estado de TELA — preferência de quem olha, não do dado. */
  const [camadasOcultas, setCamadasOcultas] = useState<Set<string>>(new Set());
  const medicoes = useBlueprintMedicoes(
    study.id,
    study.organization_id,
    levelId,
    fundo.ativaId,
    camadaAtiva,
  );

  /**
   * O que aparece na tela: a prancha ativa, menos as camadas desligadas.
   *
   * O recorte por prancha não é cosmético. As coordenadas de uma forma só fazem
   * sentido sob a aferição da prancha em que foi traçada; mostrar as do térreo
   * sobre a cobertura desenharia contornos no lugar errado, com o número certo
   * ao lado — que é o pior jeito de errar.
   *
   * A FORMA SEM PRANCHA aparece em TODAS. Ela foi traçada sem fundo nenhum, então
   * não há aferição de outra prancha que a contradiga — e escondê-la a deixaria
   * inalcançável: some da lista, e não sobra nenhum controle para religá-la a
   * coisa alguma. O banco tem duas assim (`orfas=2` na conferência da 000014).
   */
  const medicoesVisiveis = useMemo(
    () =>
      medicoes.formas.filter(
        (f) =>
          (f.underlayId === null || f.underlayId === fundo.ativaId) &&
          !camadasOcultas.has(f.camada || 'Geral'),
      ),
    [medicoes.formas, fundo.ativaId, camadasOcultas],
  );

  const alternarCamada = (camada: string) =>
    setCamadasOcultas((atual) => {
      const nova = new Set(atual);
      if (nova.has(camada)) nova.delete(camada);
      else nova.add(camada);
      return nova;
    });

  // Atalhos de desfazer/refazer. Ctrl+Z / Ctrl+Shift+Z, como todo editor.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      // F8 alterna a trava ortogonal — é a tecla que todo CAD usa, e quem
      // desenha planta chega aqui com o dedo já treinado nela.
      if (e.key === 'F8') {
        e.preventDefault();
        setOrtogonal((v) => !v);
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [editor.undo, editor.redo]);

  const ambientes = useMemo(
    () =>
      editor.model.spaces
        .filter((s) => !levelId || s.levelId === levelId)
        .map((s, i) => ({
          id: s.id,
          nome: s.name ?? '',
          rotulo: s.name ?? `Ambiente ${i + 1}`,
          areaM2: s.areaMm2 / 1_000_000,
          perimetroM: s.perimeterMm / 1000,
        })),
    [editor.model.spaces, levelId],
  );

  const areaTotal = ambientes.reduce((soma, a) => soma + a.areaM2, 0);

  const quant = useMemo(
    () => computeQuantities(editor.model, POLITICA_PADRAO),
    [editor.model],
  );
  const fmt = (v: number) => formatarQuantidade(v, POLITICA_PADRAO);

  /**
   * Quantitativo OFICIAL da última versão publicada.
   *
   * O painel calcula ao vivo enquanto se desenha, e isso é útil — mas número que
   * o orçamento vai citar não pode vir de geometria que ainda muda. O oficial sai
   * do snapshot publicado e fica gravado com a política que o produziu.
   */
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (editor.baseRevision === 0) {
        setQtdOficial(null);
        return;
      }
      try {
        const snaps = await listSnapshots(study.id);
        if (cancelado || snaps.length === 0) return;
        setQtdOficial(await getQuantitySnapshot(snaps[0].id, POLITICA_PADRAO.version));
      } catch {
        /* silencioso: a ausência do oficial não impede desenhar */
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [study.id, editor.baseRevision]);

  async function gerarQuantitativoOficial() {
    setGerando(true);
    try {
      const snaps = await listSnapshots(study.id);
      if (snaps.length === 0) return;
      setQtdOficial(await computeAndStoreQuantities(snaps[0].id, POLITICA_PADRAO));
    } catch (e) {
      console.error('falha ao gerar quantitativo:', e);
    } finally {
      setGerando(false);
    }
  }

  /**
   * Grava o trecho de parede e as correções de canto que ele exige.
   *
   * UM passo de histórico para o gesto todo (`runBatch`): a parede nova e a ponta
   * mitrada da anterior são o mesmo ato do usuário, e desfazer metade dele
   * deixaria um canto que ninguém desenhou.
   *
   * Se o lote for recusado — o caso real é abertura que não caberia mais na parede
   * encurtada — a parede entra SEM a mitra. O canto fica com folga visível, que se
   * arruma arrastando a ponta; perder o clique inteiro em silêncio seria pior.
   */
  function adicionarParede(a: Point, b: Point, ajustes?: AjustePonta[]): string | null {
    if (!levelId) return null;
    const nova: Command = {
      type: 'AddWall',
      levelId,
      a,
      b,
      thicknessMm: espessura,
      heightMm: ALTURA_PADRAO_MM,
    };
    const correcoes: Command[] = (ajustes ?? []).map((aj) => ({
      type: 'MoveVertex',
      wallId: aj.wallId,
      end: aj.end,
      to: aj.to,
    }));

    const criados = editor.runBatch([...correcoes, nova]);
    if (criados.length === 0 && correcoes.length > 0) return adicionarParede(a, b);
    return criados.find((id) => id.startsWith('wal')) ?? null;
  }

  const paredeSel = editor.model.walls.find((w) => w.id === editor.selectedId) ?? null;
  const aberturaSel = editor.model.openings.find((o) => o.id === editor.selectedId) ?? null;

  function adicionarAbertura(wallId: string, offsetMm: number) {
    editor.run({
      type: 'AddOpening',
      wallId,
      kind: tipoAbertura,
      offsetMm,
      widthMm: larguraAbertura,
      heightMm: tipoAbertura === 'door' ? 2100 : 1200,
      sillMm: tipoAbertura === 'door' ? 0 : 900,
    });
  }

  function dividirSelecionada() {
    if (!paredeSel) return;
    // Divide no meio: e o unico ponto que sempre existe e nunca coincide com
    // ponta, entao nao depende de o usuario acertar um clique no eixo.
    editor.run({
      type: 'SplitWall',
      wallId: paredeSel.id,
      at: {
        x: Math.round((paredeSel.a.x + paredeSel.b.x) / 2),
        y: Math.round((paredeSel.a.y + paredeSel.b.y) / 2),
      },
    });
    editor.setSelectedId(null);
  }

  /**
   * A vizinha que pode ser unida à selecionada.
   *
   * Precisa ser COLINEAR, e não só encostada. A primeira versão pegava qualquer
   * parede que compartilhasse uma ponta — mas numa sala retangular toda vizinha
   * é perpendicular, então ela escolhia a errada e o kernel recusava com
   * "Paredes não são colineares". O botão ficava quebrado no caso mais comum, e
   * o erro aparecia depois do clique em vez de antes.
   *
   * Calculado como memo para a UI poder DESABILITAR o botão quando não houver
   * candidata, em vez de deixar o usuário descobrir clicando.
   */
  const vizinhaParaUnir = useMemo(() => {
    if (!paredeSel) return null;
    const mesmaPonta = (p: Point, q: Point) => p.x === q.x && p.y === q.y;
    return (
      editor.model.walls.find((o) => {
        if (o.id === paredeSel.id || o.levelId !== paredeSel.levelId) return false;
        if (o.thicknessMm !== paredeSel.thicknessMm) return false;
        const encosta =
          mesmaPonta(o.a, paredeSel.b) ||
          mesmaPonta(o.b, paredeSel.a) ||
          mesmaPonta(o.a, paredeSel.a) ||
          mesmaPonta(o.b, paredeSel.b);
        if (!encosta) return false;
        // Os quatro pontos têm que estar na mesma reta — testado com os dois
        // extremos da vizinha, senão uma parede que só toca de raspão passa.
        return (
          areCollinear(paredeSel.a, paredeSel.b, o.a) &&
          areCollinear(paredeSel.a, paredeSel.b, o.b)
        );
      }) ?? null
    );
  }, [paredeSel, editor.model.walls]);

  function unirSelecionada() {
    if (!paredeSel || !vizinhaParaUnir) return;
    editor.run({ type: 'MergeWalls', firstId: paredeSel.id, secondId: vizinhaParaUnir.id });
    editor.setSelectedId(null);
  }

  /**
   * Qual ponta anda ao digitar um novo comprimento, e se isso arrasta o canto.
   *
   * Decisão de produto (12/08/2026): se uma das pontas está LIVRE, é ela que
   * anda — a correção feita à mão, logo depois de desenhar, não deve mexer em
   * nada já encaixado. Se as duas estão livres, ou as duas presas, anda a
   * FINAL (`b`, a última clicada ao desenhar): é a regra mais fácil de prever
   * quando não há uma ponta obviamente "solta".
   */
  const esticamento = useMemo(() => {
    if (!paredeSel) return { pontaQueAnda: null as 'a' | 'b' | null, arrastaCanto: false };
    const nivel = editor.model.walls.filter((w) => w.levelId === paredeSel.levelId);
    const aLivre = isFreeWallEnd(nivel, paredeSel.a, paredeSel.id);
    const bLivre = isFreeWallEnd(nivel, paredeSel.b, paredeSel.id);
    const pontaQueAnda: 'a' | 'b' = aLivre && !bLivre ? 'a' : 'b';
    return { pontaQueAnda, arrastaCanto: !(pontaQueAnda === 'a' ? aLivre : bLivre) };
  }, [paredeSel, editor.model.walls]);

  /**
   * Aplica o comprimento digitado no painel.
   *
   * A ponta escolhida (`esticamento.pontaQueAnda`) anda ao longo do PRÓPRIO
   * EIXO — `pontaEsticada` preserva a direção, a parede nunca gira.
   *
   * Se aquela ponta ENCONTRA outras paredes, elas andam JUNTO, no MESMO lote de
   * histórico (`runBatch`): mover só a nossa abriria o canto e apagaria o
   * ambiente e o quantitativo em silêncio — a mesma razão pela qual o traçado
   * pela face mitra o canto num lote só. `runBatch` aborta o lote inteiro se
   * alguma correção for recusada, então o canto nunca fica pior do que estava.
   *
   * LIMITAÇÃO CONHECIDA: numa junção em T, a ponta que morre no MEIO do corpo de
   * outra parede não é vértice de ninguém — não há `MoveVertex` de vizinha para
   * disparar, e o encontro simplesmente desencosta. O painel de pontas soltas
   * acusa, e a lista de vãos oferece fechar; corrigido aqui seria refazer o
   * `SplitWall` que a junção em T já resolve para o caso de desenhar.
   */
  function esticarParede(comprimentoMm: number) {
    if (!paredeSel) return;
    // `esticamento.pontaQueAnda` só é `null` quando `paredeSel` é `null` — mas o
    // memo devolve um tipo próprio, e o TypeScript não enxerga essa relação
    // entre as duas variáveis. A guarda é redundante em runtime, não em tipo.
    const { pontaQueAnda } = esticamento;
    if (!pontaQueAnda) return;
    const nivel = editor.model.walls.filter((w) => w.levelId === paredeSel.levelId);
    const ancora = pontaQueAnda === 'a' ? paredeSel.b : paredeSel.a;
    const pontaAtual = pontaQueAnda === 'a' ? paredeSel.a : paredeSel.b;

    let novaPonta: Point;
    try {
      novaPonta = pontaEsticada(ancora, pontaAtual, comprimentoMm);
    } catch (e) {
      // Coordenada fora de ±1.000.000 mm (alguém digitou metros achando que
      // eram milímetros). Recusa silenciosa: o campo já ressincroniza com o
      // valor atual no próximo render, então não há necessidade de expor o
      // erro do kernel para um dígito a mais.
      if (e instanceof KernelError) return;
      throw e;
    }

    const lote: Command[] = [{ type: 'MoveVertex', wallId: paredeSel.id, end: pontaQueAnda, to: novaPonta }];
    for (const w of nivel) {
      if (w.id === paredeSel.id) continue;
      if (w.a.x === pontaAtual.x && w.a.y === pontaAtual.y) {
        lote.push({ type: 'MoveVertex', wallId: w.id, end: 'a', to: novaPonta });
      }
      if (w.b.x === pontaAtual.x && w.b.y === pontaAtual.y) {
        lote.push({ type: 'MoveVertex', wallId: w.id, end: 'b', to: novaPonta });
      }
    }
    editor.runBatch(lote);
  }

  /**
   * Vãos candidatos: pares de pontas de parede que não encontram nada e estão
   * perto o bastante para ser abertura.
   *
   * O sistema NÃO decide qual fechar — só apresenta. Cinco rodadas do Spike C
   * mostraram que essa decisão é justamente a que a máquina erra: fechar por
   * proximidade junta parede com guarda-corpo; fechar por colinearidade fecha a
   * borda de terraço, que devia ficar aberta. Porta, guarda-corpo e limite do
   * envelope têm geometria parecida demais.
   *
   * O que a máquina faz bem é ACHAR os candidatos e medir. Quem sabe se aquele
   * vão de 90 cm é porta ou passagem é quem conhece o projeto.
   */
  const vaosCandidatos = useMemo(() => {
    const grau = new Map<string, { p: Point; n: number }>();
    for (const w of editor.model.walls) {
      if (levelId && w.levelId !== levelId) continue;
      for (const extremo of [w.a, w.b]) {
        const k = `${extremo.x},${extremo.y}`;
        const atual = grau.get(k);
        if (atual) atual.n += 1;
        else grau.set(k, { p: extremo, n: 1 });
      }
    }
    const soltas = [...grau.values()].filter((v) => v.n === 1).map((v) => v.p);

    // Faixa de abertura de verdade: de 40 cm (passagem estreita) a 3 m (vão de
    // sala). Fora disso não é abertura — é parede faltando ou desenho separado.
    const MIN = 400;
    const MAX = 3000;
    const pares: { a: Point; b: Point; mm: number }[] = [];
    for (let i = 0; i < soltas.length; i++) {
      for (let j = i + 1; j < soltas.length; j++) {
        const mm = Math.round(Math.hypot(soltas[i].x - soltas[j].x, soltas[i].y - soltas[j].y));
        if (mm < MIN || mm > MAX) continue;
        pares.push({ a: soltas[i], b: soltas[j], mm });
      }
    }
    // Cada ponta entra num par só: o mais curto ganha.
    pares.sort((p, q) => p.mm - q.mm);
    const usada = new Set<string>();
    const escolhidos: { a: Point; b: Point; mm: number }[] = [];
    for (const par of pares) {
      const ka = `${par.a.x},${par.a.y}`;
      const kb = `${par.b.x},${par.b.y}`;
      if (usada.has(ka) || usada.has(kb)) continue;
      usada.add(ka);
      usada.add(kb);
      escolhidos.push(par);
    }
    return { soltas, vaos: escolhidos };
  }, [editor.model.walls, levelId]);

  /** Fecha o vão com parede cheia. Use quando a interrupção era só desenho. */
  function fecharComParede(vao: { a: Point; b: Point }) {
    if (!levelId) return;
    editor.run({
      type: 'AddWall',
      levelId,
      a: vao.a,
      b: vao.b,
      thicknessMm: espessura,
      heightMm: ALTURA_PADRAO_MM,
    });
  }

  /**
   * Fecha o vão e marca que ali existe uma porta.
   *
   * Duas operações porque são dois fatos: o contorno passa a fechar (e o
   * ambiente aparece com a área certa) E fica registrado que aquele trecho é
   * abertura, não alvenaria. Sem a segunda, o quantitativo contaria parede onde
   * há porta.
   */
  function fecharComPorta(vao: { a: Point; b: Point; mm: number }) {
    if (!levelId) return;
    // O ID VEM DO COMANDO, não de `editor.model`.
    //
    // Aqui estava `editor.model.walls[antes]` depois do `run`, e `editor.model` é
    // estado de React: dentro deste mesmo tratador ele ainda é o modelo ANTERIOR,
    // então a leitura devolvia `undefined`, o `if` não entrava e a porta nunca era
    // criada. O vão fechava com alvenaria cheia e o quantitativo contava parede
    // onde havia porta — em silêncio, que é o pior jeito de errar.
    const [idParede] = editor.run({
      type: 'AddWall',
      levelId,
      a: vao.a,
      b: vao.b,
      thicknessMm: espessura,
      heightMm: ALTURA_PADRAO_MM,
    });
    if (!idParede) return;
    editor.run({
      type: 'AddOpening',
      wallId: idParede,
      kind: 'door',
      offsetMm: 0,
      widthMm: vao.mm,
      heightMm: 2100,
      sillMm: 0,
    });
  }

  /**
   * Move a ponta de uma parede.
   *
   * O comando já existia no kernel desde o Spike A — com undo e rederivação de
   * ambientes — e nenhuma parte da tela o acionava. Consertar uma parede torta
   * exigia apagar e redesenhar, e redesenhar é justamente onde o erro nasce.
   */
  /**
   * Fecha a aferição com a distância digitada.
   *
   * O valor entra em METROS porque é assim que a cota vem escrita na planta, e
   * vai para o serviço em milímetros — a conversão fica num lugar só, aqui.
   */
  function aplicarAfericao() {
    const metros = Number(distanciaDigitada);
    if (!afericao || !(metros > 0)) return;

    // A escala ANTERIOR precisa ser capturada antes de aplicar a nova: é dela
    // que as medições já traçadas são transformadas. Sem isso, corrigir a
    // escala deixaria cada contorno flutuando fora do que foi traçado.
    const escalaAnterior = fundo.underlay;

    void fundo
      .aplicarCalibracao(afericao.p1, afericao.p2, Math.round(metros * 1000), alinharNaAfericao)
      .then((nova) => {
        // `nova` VEM DA CHAMADA, não do estado: ler `fundo.underlay` aqui
        // devolveria o valor velho, porque o React só atualiza o closure na
        // renderização seguinte — e as medições seriam transformadas de uma
        // escala para ela mesma, ou seja, não seriam transformadas.
        if (escalaAnterior && nova)
          void medicoes.reposicionar(escalaAnterior, nova, fundo.ativaId);
      });
    setAfericao(null);
    setDistanciaDigitada('');
    editor.setTool('selecionar');
  }

  function moverPonta(wallId: string, end: 'a' | 'b', to: Point) {
    editor.run({ type: 'MoveVertex', wallId, end, to });
  }

  function removerSelecionada() {
    if (!editor.selectedId) return;
    // Abertura e parede sao objetos diferentes com a mesma tecla de atalho.
    if (aberturaSel) editor.run({ type: 'DeleteOpening', openingId: aberturaSel.id });
    else editor.run({ type: 'DeleteWall', wallId: editor.selectedId });
    editor.setSelectedId(null);
  }

  const rotuloSalvamento: Record<string, string> = {
    limpo: 'Sem alterações',
    pendente: 'Alterações não salvas',
    salvando: 'Salvando…',
    salvo: 'Rascunho salvo',
    erro: 'Falha ao salvar',
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      {/* Cabeçalho */}
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <BotaoBarra icone={ArrowLeft} rotulo="Voltar para a lista" onClick={onBack} />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-slate-800">{study.name}</h1>
          <p className="text-xs text-slate-500">
            Revisão publicada {editor.baseRevision} · unidades em milímetros ·{' '}
            <span
              className={
                editor.saveState === 'erro'
                  ? 'text-red-600'
                  : editor.saveState === 'salvo'
                    ? 'text-emerald-600'
                    : 'text-slate-500'
              }
            >
              {rotuloSalvamento[editor.saveState]}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => editor.publish()}
          disabled={editor.publishing || !editor.dirtySincePublish}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          title={
            editor.dirtySincePublish
              ? 'Publica uma versão imutável desta planta'
              : 'Nada mudou desde a última publicação'
          }
        >
          {editor.publishing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Publicar versão
        </button>
      </header>

      {/* Barra de ferramentas */}
      {/* `flex-wrap`: a barra ganhou muitos controles (ferramentas, espessura,
          planta de fundo, orto, grade, desfazer/refazer) e sem quebra de linha
          ela transborda em tela estreita. Item de flex NÃO encolhe abaixo do
          próprio conteúdo — foi assim que duas abas sumiram nesta mesma tela.
          Quebrar linha torna o recorte estruturalmente impossível. */}
      <div
        className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2"
        role="toolbar"
        aria-label="Ferramentas de desenho"
      >
        <Ferramenta
          atual={editor.tool}
          valor="selecionar"
          icone={MousePointer2}
          rotulo="Selecionar"
          onClick={editor.setTool}
        />
        <Ferramenta
          atual={editor.tool}
          valor="parede"
          icone={Minus}
          rotulo="Parede"
          onClick={editor.setTool}
        />

        <Ferramenta
          atual={editor.tool}
          valor="abertura"
          icone={DoorOpen}
          rotulo="Abertura"
          onClick={editor.setTool}
        />

        {/* MEDIR ≠ DESENHAR. Estas três não produzem geometria: produzem uma
            AFIRMAÇÃO sobre a planta de fundo. O separador existe para isso — na
            barra, a fronteira entre derivar e afirmar precisa ser visível. */}
        <span className="h-5 w-px bg-slate-200" aria-hidden />

        <Ferramenta
          atual={editor.tool}
          valor="medir-area"
          icone={Square}
          rotulo="Área"
          onClick={editor.setTool}
        />
        <Ferramenta
          atual={editor.tool}
          valor="medir-linha"
          icone={Spline}
          rotulo="Linha"
          onClick={editor.setTool}
        />
        <Ferramenta
          atual={editor.tool}
          valor="contar"
          icone={Hash}
          rotulo="Contar"
          onClick={editor.setTool}
        />

        <span className="mx-2 h-5 w-px bg-slate-200" aria-hidden />

        {editor.tool === 'abertura' ? (
          <>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Tipo
              <select
                value={tipoAbertura}
                onChange={(e) => setTipoAbertura(e.target.value as 'door' | 'window')}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="door">Porta</option>
                <option value="window">Janela</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Largura
              <select
                value={larguraAbertura}
                onChange={(e) => setLarguraAbertura(Number(e.target.value))}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                {[600, 700, 800, 900, 1000, 1200, 1500, 2000].map((mm) => (
                  <option key={mm} value={mm}>
                    {mm} mm
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
        <>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Espessura
          <select
            value={espessura}
            onChange={(e) => setEspessura(Number(e.target.value))}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            {[100, 150, 200, 250].map((mm) => (
              <option key={mm} value={mm}>
                {mm} mm
              </option>
            ))}
          </select>
        </label>

        {/* ONDE O CLIQUE CAI. O kernel guarda a parede pelo EIXO, mas quem copia
            uma planta de fundo aponta o CANTO — e com o clique no eixo a parede
            nascia meia espessura para fora do que estava desenhado. O canto de
            junção é mitrado pelo kernel (`eixoDaParede`), senão o contorno não
            fecharia e o ambiente não apareceria. */}
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Clique
          <select
            value={alinhamento}
            onChange={(e) => setAlinhamento(e.target.value as AlinhamentoParede)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            title="Onde o ponto clicado cai na parede. Pela face, o clique é o canto da parede e ela cresce toda para o lado escolhido — contorne no sentido do relógio com 'à direita' para a parede nascer para dentro. A BARRA DE ESPAÇO inverte o lado sem sair do desenho."
          >
            <option value="DIREITA">Na face · parede à direita</option>
            <option value="ESQUERDA">Na face · parede à esquerda</option>
            <option value="EIXO">No eixo (meio da parede)</option>
          </select>
        </label>
        </>
        )}

        <ControlesDeFundo
          linhas={fundo.linhas}
          linha={fundo.linha}
          underlay={fundo.underlay}
          opacidade={fundo.opacidade}
          calibrando={editor.tool === 'calibrar'}
          ocupado={fundo.ocupado}
          totalPaginas={fundo.totalPaginas}
          onSelecionar={fundo.selecionar}
          onImportar={(arquivo, pagina) => void fundo.importar(arquivo, pagina)}
          onCalibrar={() => {
            setAfericao(null);
            editor.setTool(editor.tool === 'calibrar' ? 'selecionar' : 'calibrar');
          }}
          onOpacidade={fundo.setOpacidade}
          onRemover={() => void fundo.remover()}
        />

        <span className="h-5 w-px bg-slate-200" aria-hidden />

        {/* ORTO. Encaixar na grade NÃO impede parede torta: impede só que a
            ponta pare fora da grade. Um desvio de um passo é invisível na escala
            da tela e só aparece no CAD — ou na obra. Foi assim que uma parede
            saiu 200 mm fora do esquadro sem ninguém notar. */}
        <button
          type="button"
          onClick={() => setOrtogonal((v) => !v)}
          aria-pressed={ortogonal}
          title={
            ortogonal
              ? 'Orto LIGADO: as paredes travam em 90°. Shift libera; F8 alterna.'
              : 'Orto desligado: a parede segue o cursor. Shift trava; F8 alterna.'
          }
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
            ortogonal
              ? 'border-blue-600 bg-blue-50 text-blue-700'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Grid3x3 className="h-3.5 w-3.5" />
          Orto
        </button>

        <label className="flex items-center gap-2 text-xs text-slate-600">
          Grade
          <select
            value={passoGrade === null ? 'auto' : String(passoGrade)}
            onChange={(e) =>
              setPassoGrade(e.target.value === 'auto' ? null : Number(e.target.value))
            }
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            title="Passo de encaixe. Em automático, acompanha o zoom."
          >
            <option value="auto">Automática ({rotuloPasso(passoEmVigor)})</option>
            {[10, 50, 100, 250, 500, 1000].map((mm) => (
              <option key={mm} value={mm}>
                {rotuloPasso(mm)}
              </option>
            ))}
          </select>
        </label>

        {/* MEDIDAS. Escreve o comprimento de cada parede na tela, como uma cota
            de planta — útil para conferir o desenho contra as cotas do
            projetista sem abrir o painel de propriedades parede por parede.
            Desligado por padrão: numa planta cheia, cota em toda parede vira
            poluição visual antes de virar informação. */}
        <button
          type="button"
          onClick={() => setMostrarMedidas((v) => !v)}
          aria-pressed={mostrarMedidas}
          title={
            mostrarMedidas
              ? 'Ocultar o comprimento das paredes no desenho'
              : 'Mostrar o comprimento de cada parede no desenho'
          }
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
            mostrarMedidas
              ? 'border-blue-600 bg-blue-50 text-blue-700'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Ruler className="h-3.5 w-3.5" />
          Medidas
        </button>

        <span className="mx-2 h-5 w-px bg-slate-200" aria-hidden />

        <BotaoBarra
          icone={Undo2}
          rotulo="Desfazer (Ctrl+Z)"
          onClick={editor.undo}
          disabled={!editor.canUndo}
        />
        <BotaoBarra
          icone={Redo2}
          rotulo="Refazer (Ctrl+Shift+Z)"
          onClick={editor.redo}
          disabled={!editor.canRedo}
        />
        {/* Excluir é ação de linha no vocabulário do ActionIconButton, então usa
            o componente padrão. Desfazer/refazer/voltar não estão na taxonomia
            dele (`ActionKind` não tem esses casos) — forçar um `kind` só para
            reaproveitar o estilo mentiria na semântica do componente. */}
        <ActionIconButton
          kind="delete"
          title="Excluir parede selecionada (Delete)"
          onClick={removerSelecionada}
          disabled={!editor.selectedId}
        />

        <div className="ml-auto text-xs text-slate-500">
          {editor.model.walls.length} parede(s) · {ambientes.length} ambiente(s)
        </div>
      </div>

      {editor.lastError && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{editor.lastError}</span>
          {editor.hasConflict ? (
            <button
              type="button"
              onClick={editor.reload}
              className="shrink-0 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              Recarregar do servidor
            </button>
          ) : (
            <button
              type="button"
              onClick={editor.clearError}
              className="text-xs font-medium underline"
            >
              dispensar
            </button>
          )}
        </div>
      )}

      {/* Corpo */}
      {fundo.linha && fundo.underlay && (
        <ResumoDaAfericao linha={fundo.linha} underlay={fundo.underlay} />
      )}
      {fundo.erro && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {fundo.erro}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {/* Aferição: os dois pontos já foram clicados, falta a distância real.
              O diálogo aparece SOBRE o desenho, junto de onde o usuário acabou
              de clicar — mandá-lo procurar um campo na lateral quebraria o
              gesto no meio. */}
          {afericao && (
            <div className="absolute left-1/2 top-4 z-10 w-80 -translate-x-1/2 rounded-lg border border-amber-300 bg-white p-3 shadow-lg">
              <p className="text-xs font-semibold text-slate-800">
                Qual a distância real entre os dois pontos?
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Use uma cota escrita na planta. Quanto mais longa, melhor a aferição.
              </p>

              <div className="mt-2 flex items-center gap-1.5">
                <input
                  autoFocus
                  type="number"
                  step="0.01"
                  min="0"
                  value={distanciaDigitada}
                  onChange={(e) => setDistanciaDigitada(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') aplicarAfericao();
                    if (e.key === 'Escape') setAfericao(null);
                  }}
                  aria-label="Distância real em metros"
                  placeholder="0,00"
                  className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
                <span className="text-xs text-slate-600">metros</span>

                <button
                  type="button"
                  onClick={aplicarAfericao}
                  disabled={!(Number(distanciaDigitada) > 0)}
                  className="ml-auto rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  Aferir
                </button>
                <button
                  type="button"
                  onClick={() => setAfericao(null)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>

              <label className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={alinharNaAfericao}
                  onChange={(e) => setAlinharNaAfericao(e.target.checked)}
                />
                Estes dois pontos são horizontais (endireita a planta torta)
              </label>
            </div>
          )}

          {editor.loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando planta…
            </div>
          ) : (
            <BlueprintCanvas
              model={editor.model}
              tool={editor.tool}
              levelId={levelId}
              selectedId={editor.selectedId}
              onSelect={editor.setSelectedId}
              onAddWall={adicionarParede}
              alinhamento={alinhamento}
              onInverterLado={() => setAlinhamento(inverterLado)}
              onAddOpening={adicionarAbertura}
              larguraAberturaMm={larguraAbertura}
              onDelete={removerSelecionada}
              espessuraMm={espessura}
              passoGradeMm={passoGrade}
              onPassoEfetivo={setPassoEmVigor}
              vaos={vaosCandidatos.vaos}
              pontasSoltas={vaosCandidatos.soltas}
              ortogonal={ortogonal}
              mostrarMedidasParedes={mostrarMedidas}
              onMoveVertex={moverPonta}
              fundo={
                fundo.imagem && fundo.underlay
                  ? {
                      imagem: fundo.imagem,
                      underlay: fundo.underlay,
                      opacidade: fundo.opacidade,
                    }
                  : null
              }
              onCalibrar={(p1, p2) => setAfericao({ p1, p2 })}
              medicoes={medicoesVisiveis}
              medicaoSelecionada={medicoes.selecionada}
              onSelecionarMedicao={medicoes.setSelecionada}
              onMedicaoPronta={(tipo, pontos) => void medicoes.criar(tipo, pontos)}
            />
          )}
        </div>

        {/* Painel lateral — é aqui que a planta vira navegável por teclado. */}
        <aside
          className="flex w-96 shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white"
          aria-label="Ambientes derivados"
        >
          <AbasDoPainel abas={ABAS} ativa={aba} onEscolher={setAba} />

          {aba === 'medicoes' ? (
            <PainelMedicoes
              formas={medicoesVisiveis}
              todas={medicoes.formas}
              selecionada={medicoes.selecionada}
              temFundo={!!fundo.linha}
              ocupado={medicoes.ocupado}
              camadasOcultas={camadasOcultas}
              camadaAtiva={camadaAtiva}
              onAlternarCamada={alternarCamada}
              onCamadaAtiva={setCamadaAtiva}
              onSelecionar={medicoes.setSelecionada}
              onRenomear={(id, nome) => void medicoes.atualizar(id, { nome })}
              onEditarItem={(id, campos) => void medicoes.atualizar(id, campos)}
              onRemover={(id) => void medicoes.remover(id)}
              onEnviarOrcamento={() =>
                void medicoes.enviarAoOrcamento(
                  study.project_id,
                  study.name,
                  fundo.linha?.file_sha256 ?? null,
                  fundo.underlay?.mmPorPixel ?? null,
                )
              }
              aviso={medicoes.aviso}
              erro={medicoes.erro}
            />
          ) : aba === 'versoes' ? (
            <PainelVersoes study={study} />
          ) : aba === 'orcamento' ? (
            <PainelOrcamento
              study={study}
              revisao={editor.baseRevision}
              dirty={editor.dirtySincePublish}
            />
          ) : aba === 'quantitativos' ? (
            <PainelQuantitativos
              quant={quant}
              fmt={fmt}
              revisao={editor.baseRevision}
              oficial={qtdOficial}
              gerando={gerando}
              onGerar={gerarQuantitativoOficial}
              dirty={editor.dirtySincePublish}
            />
          ) : (
          <div className="overflow-y-auto">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Ambientes</h2>
            <p className="text-xs text-slate-500">
              Derivados da topologia — não são desenhados à mão.
            </p>
          </div>

          <PainelParedeSelecionada
            parede={paredeSel}
            abertura={aberturaSel}
            pontaQueAnda={esticamento.pontaQueAnda}
            arrastaCanto={esticamento.arrastaCanto}
            onComprimento={esticarParede}
            onEspessura={(mm) =>
              paredeSel &&
              editor.run({ type: 'SetThickness', wallId: paredeSel.id, thicknessMm: mm })
            }
            podeUnir={!!vizinhaParaUnir}
            onDividir={dividirSelecionada}
            onUnir={unirSelecionada}
          />

          {vaosCandidatos.soltas.length > 0 && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-800">
                <strong>{vaosCandidatos.soltas.length} ponta(s) solta(s).</strong> Enquanto
                houver ponta sem encontro, o contorno não fecha e o ambiente não aparece.
              </p>

              {vaosCandidatos.vaos.length === 0 ? (
                <p className="mt-2 text-xs text-amber-700">
                  Nenhum par de pontas na faixa de abertura (40 cm a 3 m). Aproxime as
                  paredes ou desenhe o trecho que falta.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs text-amber-700">
                    {vaosCandidatos.vaos.length} vão(s) encontrado(s). O sistema não decide
                    qual fechar — porta, guarda-corpo e limite externo têm a mesma
                    geometria. Você decide:
                  </p>
                  <ul className="mt-2 space-y-2">
                    {vaosCandidatos.vaos.map((v, i) => (
                      <li
                        key={`${v.a.x},${v.a.y}-${v.b.x},${v.b.y}`}
                        className="rounded-md border border-amber-300 bg-white p-2"
                      >
                        <p className="text-xs font-medium text-slate-700">
                          Vão {i + 1} · {(v.mm / 1000).toFixed(2)} m
                        </p>
                        <div className="mt-1 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => fecharComPorta(v)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <DoorOpen className="h-3 w-3" /> É porta
                          </button>
                          <button
                            type="button"
                            onClick={() => fecharComParede(v)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Minus className="h-3 w-3" /> É parede
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-amber-700">
                    Vão que é limite externo (varanda, terraço) deve ficar aberto — não
                    feche.
                  </p>
                </>
              )}
            </div>
          )}

          <div aria-live="polite" className="px-4 py-2 text-xs text-slate-600">
            {ambientes.length === 0
              ? 'Nenhum ambiente fechado ainda.'
              : `${ambientes.length} ambiente(s) · ${areaTotal.toFixed(2)} m² no total`}
          </div>

          <ul className="divide-y divide-slate-100">
            {ambientes.map((a) => (
              <li key={a.id}>
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    {renomeando === a.id ? (
                      // O nome é ancorado num PONTO dentro do ambiente, não no id
                      // dele: ambiente é derivado e o id muda a cada rederivação.
                      <input
                        autoFocus
                        defaultValue={a.nome}
                        aria-label={`Nome do ambiente ${a.rotulo}`}
                        onBlur={(e) => {
                          editor.run({ type: 'NameSpace', spaceId: a.id, name: e.target.value });
                          setRenomeando(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenomeando(null);
                        }}
                        className="w-full rounded border border-blue-400 px-1.5 py-0.5 text-sm"
                      />
                    ) : (
                      <>
                        <span className="truncate text-sm font-medium text-slate-700">
                          {a.rotulo}
                        </span>
                        <button
                          type="button"
                          onClick={() => setRenomeando(a.id)}
                          title="Renomear ambiente"
                          aria-label={`Renomear ${a.rotulo}`}
                          className="ml-auto shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                  <dl className="mt-1 flex gap-4 text-xs text-slate-500">
                    <div>
                      <dt className="inline">Área </dt>
                      <dd className="inline font-medium text-slate-700">
                        {a.areaM2.toFixed(2)} m²
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Perímetro </dt>
                      <dd className="inline font-medium text-slate-700">
                        {a.perimetroM.toFixed(2)} m
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            ))}
          </ul>

          {ambientes.length === 0 && !editor.loading && (
            <p className="px-4 py-3 text-xs text-slate-400">
              Feche um contorno de paredes para que um ambiente apareça. Pontas soltas
              não fecham área.
            </p>
          )}
          </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Controle de barra: voltar, desfazer, refazer. `title` + `aria-label` porque
 *  botão só com ícone não tem nome acessível nenhum sem isso. */
function BotaoBarra({
  icone: Icone,
  rotulo,
  onClick,
  disabled,
}: {
  icone: React.ElementType;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={rotulo}
      aria-label={rotulo}
      className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
    >
      <Icone className="h-4 w-4" />
    </button>
  );
}

/**
 * Quantitativos derivados do desenho.
 *
 * Mostra a área de EIXO ao lado da de PISO de propósito. Elas diferem em ~9% numa
 * planta comum, e quem confere o orçamento precisa ver as duas para entender de
 * onde veio o número — a de eixo é a que aparece na aba Ambientes, a de piso é a
 * que vira material comprado.
 */
function PainelQuantitativos({
  quant,
  fmt,
  revisao,
  oficial,
  gerando,
  onGerar,
  dirty,
}: {
  quant: ReturnType<typeof computeQuantities>;
  fmt: (v: number) => string;
  revisao: number;
  oficial: BlueprintQuantitySnapshot | null;
  gerando: boolean;
  onGerar: () => void;
  dirty: boolean;
}) {
  const t = quant.totais;
  return (
    <div className="overflow-y-auto">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Quantitativos</h2>
        <p className="text-xs text-slate-500">
          Do desenho atual. Política {quant.policy.version}.
        </p>
      </div>

      {/* Oficial × ao vivo. A distinção é o ponto: o orçamento cita o oficial. */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        {revisao === 0 ? (
          <p className="text-xs text-slate-500">
            Publique uma versão para gerar o quantitativo oficial — o orçamento não
            cita rascunho.
          </p>
        ) : oficial ? (
          <>
            <p className="text-xs text-emerald-700">
              <strong>Oficial da revisão {revisao}</strong> gerado em{' '}
              {new Date(oficial.computed_at).toLocaleDateString('pt-BR')}.
            </p>
            {dirty && (
              <p className="mt-1 text-xs text-amber-700">
                O desenho mudou desde então. Publique de novo para gerar o oficial da
                próxima revisão.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-slate-600">
              A revisão {revisao} ainda não tem quantitativo oficial.
            </p>
            <BotaoTexto icone={Calculator} rotulo={gerando ? 'Gerando…' : 'Gerar oficial'} onClick={onGerar} disabled={gerando} />
          </>
        )}
      </div>

      {quant.ambientes.length === 0 ? (
        <p className="px-4 py-3 text-xs text-slate-400">
          Nenhum ambiente fechado — sem contorno fechado não há área para quantificar.
        </p>
      ) : (
        <>
          <dl className="divide-y divide-slate-100">
            <Linha rotulo="Área de piso" valor={`${fmt(t.areaPisoM2)} m²`} forte />
            <Linha
              rotulo={`Piso + perda ${(quant.policy.perdaRevestimento * 100).toFixed(0)}%`}
              valor={`${fmt(t.areaPisoComPerdaM2)} m²`}
            />
            <Linha
              rotulo="Parede (2 faces)"
              valor={`${fmt(t.areaParedeDuasFacesM2)} m²`}
              forte
            />
            <Linha rotulo="Alvenaria" valor={`${fmt(t.volumeAlvenariaM3)} m³`} />
            <Linha rotulo="Rodapé" valor={`${fmt(t.comprimentoRodapeM)} m`} />
            <Linha
              rotulo="Aberturas"
              valor={`${t.portas} porta(s), ${t.janelas} janela(s) · ${fmt(t.areaAberturasM2)} m²`}
            />
          </dl>

          <div className="border-t border-slate-200 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Por ambiente
            </h3>
            <ul className="mt-2 space-y-2">
              {quant.ambientes.map((a, i) => (
                <li key={a.spaceId} className="rounded-md border border-slate-200 p-2">
                  <p className="text-xs font-medium text-slate-700">
                    {a.nome ?? `Ambiente ${i + 1}`}
                  </p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                    <dt>Piso</dt>
                    <dd className="text-right font-medium text-slate-700">
                      {fmt(a.areaPisoM2)} m²
                    </dd>
                    <dt title="Inclui meia espessura de parede em volta">Eixo</dt>
                    <dd className="text-right">{fmt(a.areaEixoM2)} m²</dd>
                    <dt>Rodapé</dt>
                    <dd className="text-right">{fmt(a.comprimentoRodapeM)} m</dd>
                  </dl>
                </li>
              ))}
            </ul>
          </div>

          <p className="px-4 py-3 text-[11px] leading-relaxed text-slate-400">
            Estudo preliminar assistido; requer validação de profissional habilitado.
            Área de piso = {quant.ambientes[0]?.formulaAreaPiso}
          </p>
        </>
      )}
    </div>
  );
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <dt className="text-xs text-slate-600">{rotulo}</dt>
      <dd className={`text-xs ${forte ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>
        {valor}
      </dd>
    </div>
  );
}

/** Botão pequeno com ícone e rótulo, para ações do painel. */
function BotaoTexto({
  icone: Icone,
  rotulo,
  onClick,
  disabled,
  titulo,
}: {
  icone: React.ElementType;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo ?? rotulo}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icone className="h-3.5 w-3.5" />
      {rotulo}
    </button>
  );
}

function Ferramenta({
  atual,
  valor,
  icone: Icone,
  rotulo,
  onClick,
}: {
  atual: BlueprintTool;
  valor: BlueprintTool;
  icone: React.ElementType;
  rotulo: string;
  onClick: (t: BlueprintTool) => void;
}) {
  const ativo = atual === valor;
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={() => onClick(valor)}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        ativo ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      <Icone className="h-4 w-4" />
      {rotulo}
    </button>
  );
}
