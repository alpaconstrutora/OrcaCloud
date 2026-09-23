import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, DoorOpen, Download, FileUp, Loader2, SquareDashedMousePointer, Wand2, X } from 'lucide-react';
import type { BlueprintModel, Command } from '../../utils/blueprintKernel';
import { novoUid } from '../../utils/blueprintKernel';
import {
  aberturasDoDxf,
  HIPOTESES_ESQUADRIAS_PADRAO,
  paredesDeEixos,
  paredesDoDxf,
  prepararDxf,
  tirarDuplicadas,
  type EscalaSugerida,
  type HipotesesDeEsquadrias,
  type ParedeDoDxf,
} from '../../utils/dxfParaKernel';
import type { ArcoDxf, InsercaoDxf, RecusaDxf, TextoDxf } from '../../utils/dxfLeitor';
import { gerarTemplateOpura, lerPadraoOpura, REGRAS_DO_PADRAO, temPadraoOpura, VERSAO_DO_PADRAO } from '../../utils/dxfPadraoOpura';
import { planejarFundo, rasterizarDxf } from '../../utils/dxfParaFundo';
import type { Underlay } from '../../utils/blueprintUnderlay';
import type { DesenhoDaPrancha } from '../../services/blueprintUnderlayService';
import { comandosDaCorrecao, conferirPortas, type ConferenciaDePortas } from '../../utils/dxfConferirPortas';
import { usePersistedState } from '../ui/TableUtils';
import { converterDwgParaDxf } from '../../services/blueprintDwgService';
import {
  caixaDePontos,
  caixaDoDesenho,
  deslocamentoDaImportacao,
  type AncoragemIfc,
} from '../../utils/ancoragemImportacao';

/**
 * Importar PAREDES de um DXF.
 *
 * ─── AS DUAS PERGUNTAS QUE A TELA FAZ, E POR QUÊ ─────────────────────────────
 *
 * 1. **Qual camada é parede.** Nenhuma heurística sobre nome resolve: o projeto
 *    real da empresa tem `PAREDE`, mas também `ARQ-LAYOUT`, `dc_paisagismo` e
 *    `MÓVEIS` cheias de traço. Quem desenhou sabe; o programa, não.
 * 2. **Em que unidade o arquivo está.** ⚠️ E aqui a tela SUGERE MEDINDO, em vez
 *    de acreditar no cabeçalho: medido no projeto aprovado na prefeitura, o
 *    arquivo declara milímetro e está em METRO. Acreditar nele daria uma casa
 *    de 13 centímetros, com a forma perfeita.
 *
 * ─── DOIS CAMINHOS PARA A MESMA CAMADA ──────────────────────────────────────
 *
 * Um DXF de terceiro desenha parede como duas FACES paralelas, e daí vem o
 * pareamento. Onde existe camada de EIXO — a que o nosso próprio export
 * escreve, e a que quem desenha com disciplina mantém —, o traço já É o eixo, e
 * pareá-lo trocaria dado exato por estimativa.
 *
 * ─── ESQUADRIAS (P2.33) ─────────────────────────────────────────────────────
 *
 * A parede com porta volta do pareamento como dois trechos com um buraco. O que
 * está desenhado em cima do buraco diz o que ele é: arco de folha = porta (com
 * dobradiça e lado de abrir), traços paralelos dentro = janela, nada = vão
 * livre até 3 m. Os símbolos ficam em OUTRAS camadas (PORTAS, JANELAS) e são
 * procurados em todas. O DXF é planta e não sabe altura: porta, peitoril e
 * altura de janela são HIPÓTESES editáveis aqui, persistidas por tela.
 *
 * ─── PADRÃO ÒPURA (P2.35) ───────────────────────────────────────────────────
 *
 * Quando o arquivo segue o padrão (camadas `OPURA-PAREDE-<mm>`, blocos
 * `OPURA-PORTA`/`JANELA`/`CORRER`/`VAO` com atributos, textos em
 * `OPURA-AMBIENTE`), nada é adivinhado: eixo é parede, atributo é medida,
 * texto é nome de ambiente. O painel detecta, avisa e esconde as perguntas
 * que o padrão já respondeu (camada, unidade, caminho, espessuras). O template
 * sai daqui, pelo botão "Baixar template".
 *
 * ─── O DESENHO ORIGINAL POR BAIXO (P2.36) ───────────────────────────────────
 *
 * Como na importação de PDF, o desenho de origem fica como PLANTA DE FUNDO por
 * baixo das paredes geradas — para comparar e corrigir onde o reconhecimento
 * errou. Aqui ele entra JÁ AFERIDO: o DXF tem medida, e o raster é posicionado
 * com a mesma unidade e a mesma ancoragem das paredes. O upload é do editor
 * (`onFundo`), que tem o estudo e o pavimento; este painel só rasteriza.
 *
 * ─── GERAR DE NOVO, SEM O ARQUIVO (P2.38) ───────────────────────────────────
 *
 * O desenho de origem fica guardado ao lado da planta de fundo. Com ele, a
 * tela oferece "Usar o desenho desta prancha": muda-se a camada, a unidade, as
 * espessuras ou as hipóteses e gera-se outra vez — ou só de uma REGIÃO marcada
 * no desenho — sem apontar o arquivo de novo. O que nasce assim é alinhado à
 * planta de fundo (o deslocamento da importação veio junto), então cai em cima
 * dela; e o fundo não é subido outra vez.
 *
 * ─── CONFERIR O LADO DAS PORTAS (P2.39) ─────────────────────────────────────
 *
 * Com o desenho guardado dá para responder a pergunta que a pessoa faz olhando
 * a tela — "este arco está do lado certo?" — porta por porta, comparando o arco
 * que o app desenha com o do arquivo. O que estiver espelhado é corrigido com
 * um giro (`FlipOpening`), sem tocar na geometria e num passo de desfazer. Vale
 * para o que já está no desenho, inclusive o que entrou por versões antigas do
 * leitor.
 *
 * ─── DWG (E9.1) ─────────────────────────────────────────────────────────────
 *
 * Um .dwg entra pelo MESMO caminho: vai à Edge Function `dwg-converter`
 * (libredwg em wasm), volta como DXF e segue daqui como se fosse DXF. A
 * versão do DWG (cabeçalho, "AutoCAD 2018+") fica declarada ao lado do nome.
 * Não há o caminho inverso — exportar para o CAD é o DXF, e a tela diz isso.
 */
interface Props {
  model: BlueprintModel;
  levelIdAtivo: string | null;
  onImportar: (comandos: Command[]) => void;
  /** P2.36: guarda o raster do desenho original como planta de fundo já aferida. Devolve `false` se não conseguiu. */
  onFundo?: (blob: Blob, nomeArquivo: string, underlay: Underlay, larguraPx: number, desenho?: DesenhoDaPrancha) => Promise<boolean>;
  /** Já existe uma planta de fundo neste pavimento (a nova entra como mais uma prancha). */
  fundoAtivo?: boolean;
  /** P2.38: o desenho guardado na prancha de fundo ativa, para gerar de novo sem o arquivo. */
  onDesenhoGuardado?: () => Promise<DesenhoDaPrancha | null>;
  /** P2.38: região marcada no desenho (mm do modelo) — gera só o que está dentro dela. */
  regiao?: { x0: number; y0: number; x1: number; y1: number } | null;
  regiaoArmada?: boolean;
  onArmarRegiao?: () => void;
  onLimparRegiao?: () => void;
}

interface Preparado {
  nomeArquivo: string;
  /** O DXF cru, para guardar ao lado da prancha (P2.38). */
  texto: string;
  segmentos: ReturnType<typeof prepararDxf>['segmentos'];
  arcos: ArcoDxf[];
  insercoes: InsercaoDxf[];
  textos: TextoDxf[];
  blocosExpandidos: number;
  porCamada: { camada: string; segmentos: number; arcos: number; comprimento: number }[];
  escalas: EscalaSugerida[];
  recusas: RecusaDxf[];
  mmPorUnidadeDeclarado: number | null;
  /** Só quando o arquivo era DWG: a versão lida do cabeçalho e o código do libredwg. */
  dwg?: { versao: string; release: string; bytes: number; codigoLibredwg: number };
}

type Modo = 'FACES' | 'EIXOS';

const m2 = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

export default function PainelImportarDxf({ model, levelIdAtivo, onImportar, onFundo, fundoAtivo = false, onDesenhoGuardado, regiao = null, regiaoArmada = false, onArmarRegiao, onLimparRegiao }: Props) {
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [preparado, setPreparado] = useState<Preparado | null>(null);
  const [camada, setCamada] = useState('');
  const [mmPorUnidade, setMmPorUnidade] = useState(1000);
  const [modo, setModo] = useState<Modo>('FACES');
  const [espessuraMm, setEspessuraMm] = useState(150);
  // ⚠️ ORIGEM é o padrão AQUI, e não ARQUIVO como no IFC. As coordenadas de um
  // DXF são onde o desenhista pôs o desenho na prancha, não um lugar do mundo:
  // medido no projeto real da empresa, o desenho está a 3.976.897 mm da origem
  // do arquivo — quase 4 km. O kernel limita coordenada a ±1.000.000 mm, então
  // sem ancorar a importação inteira é RECUSADA. Foi o que o harness achou.
  const [ancoragem, setAncoragem] = useState<AncoragemIfc>('ORIGEM');
  /** Espessuras DESMARCADAS pela pessoa (P2.34) — por arquivo, zera a cada leitura. */
  const [espessurasFora, setEspessurasFora] = useState<Set<number>>(new Set());
  /** PADRÃO ÒPURA (P2.35): ler pelo padrão quando o arquivo o segue; a pessoa pode desligar e ler como DXF comum. */
  const [usarOpura, setUsarOpura] = useState(true);
  const [mostrarRegras, setMostrarRegras] = useState(false);
  /** FUNDO (P2.36): guardar o desenho original por baixo das paredes geradas. Persistido por tela. */
  const [guardarFundo, setGuardarFundo] = usePersistedState<boolean>('blueprint:dxf-fundo', true);
  const [importando, setImportando] = useState(false);
  /** P2.38: quando o desenho veio da prancha de fundo, o deslocamento é o da importação que a criou. */
  const [daPrancha, setDaPrancha] = useState<{ dx: number; dy: number } | null>(null);
  /** P2.38: a prancha ativa tem desenho guardado? `null` = ainda não perguntamos. */
  const [temGuardado, setTemGuardado] = useState<DesenhoDaPrancha | null>(null);
  /** P2.39: o resultado da última conferência de portas. */
  const [conferencia, setConferencia] = useState<ConferenciaDePortas | null>(null);
  // ESQUADRIAS (P2.33): as hipóteses de altura e o teto do vão livre, persistidas por tela.
  const [hip, setHip] = usePersistedState<HipotesesDeEsquadrias>('blueprint:dxf-esquadrias', HIPOTESES_ESQUADRIAS_PADRAO);
  const hipoteses: HipotesesDeEsquadrias = { ...HIPOTESES_ESQUADRIAS_PADRAO, ...hip };

  // P2.38: ao abrir a tela, ver se a prancha de fundo ativa traz um desenho guardado.
  useEffect(() => {
    let cancelado = false;
    if (!onDesenhoGuardado) return;
    void onDesenhoGuardado().then((d) => {
      if (!cancelado) setTemGuardado(d);
    });
    return () => {
      cancelado = true;
    };
  }, [onDesenhoGuardado]);

  const preparar = useCallback(async (arquivo: File) => {
    setLendo(true);
    setErro(null);
    setPreparado(null);
    try {
      const ehDwg = /\.dwg$/i.test(arquivo.name);
      const convertido = ehDwg ? await converterDwgParaDxf(arquivo) : null;
      const texto = convertido ? convertido.dxf : await arquivo.text();
      const p = prepararDxf(texto);
      setPreparado({
        nomeArquivo: arquivo.name,
        texto,
        ...p,
        ...(convertido ? { dwg: { versao: convertido.versao, release: convertido.release, bytes: convertido.bytes, codigoLibredwg: convertido.codigoLibredwg } } : {}),
      });
      // A camada mais longa é o palpite inicial; quem escolhe é a pessoa.
      setCamada(p.porCamada[0]?.camada ?? '');
      setMmPorUnidade(p.escalas[0]?.mmPorUnidade ?? 1000);
      setModo('FACES');
      setEspessurasFora(new Set());
      setUsarOpura(true);
      setDaPrancha(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLendo(false);
    }
  }, []);

  const temOpura = preparado ? temPadraoOpura(preparado) : false;
  const pelaOpura = temOpura && usarOpura;
  const daCamada = preparado && !pelaOpura ? preparado.segmentos.filter((s) => s.camada === camada) : [];
  // ⚠️ A limpeza vale só para o caminho das FACES: é lá que a mesma parede pode
  // ser pareada duas vezes. Na camada de eixo cada traço é um traço, e remover
  // qualquer coisa seria apagar o que o desenhista desenhou.
  const bruto: ParedeDoDxf[] =
    daCamada.length === 0
      ? []
      : modo === 'EIXOS'
        ? paredesDeEixos(daCamada, mmPorUnidade, espessuraMm)
        : paredesDoDxf(daCamada, mmPorUnidade);
  const limpo = modo === 'EIXOS' ? { paredes: bruto, removidas: 0 } : tirarDuplicadas(bruto);
  const nivel = model.levels.find((l) => l.id === levelIdAtivo) ?? null;
  // FILTRO DE ESPESSURAS (P2.34): o pareamento de faces acha "parede" em qualquer par de linhas
  // paralelas a 5–50 cm — grade de vaga, escada, projeção de telhado. Medido no projeto real:
  // 33 espessuras diferentes, e as de 50–90 mm eram tudo menos parede. Quem escolhe é a pessoa.
  const porEspessura = [...limpo.paredes.reduce((m, p) => {
    const e = m.get(p.espessuraMm) ?? { paredes: 0, comprimentoMm: 0 };
    e.paredes++;
    e.comprimentoMm += p.comprimentoMm;
    return m.set(p.espessuraMm, e);
  }, new Map<number, { paredes: number; comprimentoMm: number }>()).entries()]
    .map(([espessuraMm, v]) => ({ espessuraMm, ...v }))
    .sort((a, b) => a.espessuraMm - b.espessuraMm);
  const comprimentoBruto = porEspessura.reduce((s, e) => s + e.comprimentoMm, 0);
  const filtradas = limpo.paredes.filter((p) => !espessurasFora.has(p.espessuraMm));
  const dxDaRegiao = daPrancha?.dx ?? 0;
  const dyDaRegiao = daPrancha?.dy ?? 0;
  // ESQUADRIAS (P2.33): porta pelo arco, janela pelo símbolo, vão livre pelo buraco — em cima das paredes limpas e filtradas.
  // PADRÃO ÒPURA (P2.35): lido, não reconhecido — o mesmo `paredes` de saída, mais os ambientes.
  const opura = preparado && pelaOpura ? lerPadraoOpura(preparado, nivel?.defaultHeightMm ?? 2800, hipoteses) : null;
  const esquadrias = opura
    ? { paredes: opura.paredes, resumo: opura.resumo }
    : preparado && !pelaOpura
      ? aberturasDoDxf(filtradas, preparado, mmPorUnidade, camada, nivel?.defaultHeightMm ?? 2800, hipoteses)
      : { paredes: [], resumo: { portas: 0, janelas: 0, vaos: 0, arcosSemParede: 0, tocosDeBatente: 0, encostadas: 0, pontasSoltas: 0, cantosFechados: 0 } };
  // REGIÃO (P2.38): gera só o que está dentro do retângulo marcado no desenho. O critério é o ponto
  // MÉDIO da parede: uma parede que atravessa a borda pertence a quem tem a maior parte dela.
  const dentroDaRegiao = (p: { a: { x: number; y: number }; b: { x: number; y: number } }) => {
    if (!regiao) return true;
    const mx = (p.a.x + p.b.x) / 2 + dxDaRegiao;
    const my = (p.a.y + p.b.y) / 2 + dyDaRegiao;
    return mx >= Math.min(regiao.x0, regiao.x1) && mx <= Math.max(regiao.x0, regiao.x1) && my >= Math.min(regiao.y0, regiao.y1) && my <= Math.max(regiao.y0, regiao.y1);
  };
  const paredes = esquadrias.paredes.filter(dentroDaRegiao);
  const foraDaRegiao = esquadrias.paredes.length - paredes.length;
  // ⚠️ Os contadores vêm do que VAI ENTRAR, não do que foi reconhecido: com uma região marcada, as
  // esquadrias das paredes de fora não entram, e anunciá-las prometeria o que não vai acontecer.
  const aberturasQueEntram = paredes.flatMap((p) => p.aberturas as (typeof p.aberturas[number] & { correr?: boolean })[]);
  const contagem = {
    correr: aberturasQueEntram.filter((ab) => ab.correr).length,
    portas: aberturasQueEntram.filter((ab) => ab.kind === 'door' && !ab.correr).length,
    janelas: aberturasQueEntram.filter((ab) => ab.kind === 'window').length,
    vaos: aberturasQueEntram.filter((ab) => ab.kind === 'passage').length,
  };
  const totalDeAberturas = aberturasQueEntram.length;

  const pegada = caixaDePontos(paredes.flatMap((p) => [p.a, p.b]));
  const desloc = deslocamentoDaImportacao(ancoragem, pegada, caixaDoDesenho(model));
  // P2.38: o desenho da prancha entra onde a planta de fundo está — é o que faz o gerado cair em cima dela.
  const { dx, dy } = daPrancha ?? desloc;
  // ⚠️ O kernel recusa coordenada além de ±1.000.000 mm, e a recusa vem de dentro do lote: o editor
  // inteiro caía de volta para a lista. Medido no projeto real da empresa, o desenho está a 3.976.897 mm
  // da origem do arquivo — "manter as coordenadas" é um clique que derrubava a tela.
  const longe = !!pegada && Math.max(Math.abs(pegada.minX), Math.abs(pegada.maxX), Math.abs(pegada.minY), Math.abs(pegada.maxY)) > 900_000;

  const espessuras = [...new Set(paredes.map((p) => p.espessuraMm))].sort((a, b) => a - b);
  const comprimentoTotal = paredes.reduce((s, p) => s + p.comprimentoMm, 0);
  // FUNDO (P2.36): o plano do raster (tamanho e resolução), sem desenhar — só para o relatório.
  const opcoesDoFundo = preparado ? { mmPorUnidade: pelaOpura ? 1 : mmPorUnidade, dx, dy, camadaDestaque: pelaOpura ? null : camada } : null;
  const planoDoFundo = preparado && opcoesDoFundo && onFundo && guardarFundo && !daPrancha ? planejarFundo(preparado, opcoesDoFundo) : null;

  async function importar() {
    if (!levelIdAtivo || paredes.length === 0 || !nivel || importando) return;
    // FUNDO (P2.36) primeiro: se o raster falhar, as paredes entram do mesmo jeito, com o aviso.
    let avisoDoFundo: string | null = null;
    if (preparado && opcoesDoFundo && onFundo && guardarFundo && !daPrancha) {
      setImportando(true);
      try {
        const r = await rasterizarDxf(preparado, opcoesDoFundo);
        if (!r) avisoDoFundo = 'O desenho original não pôde ser rasterizado neste navegador; as paredes entraram sem a planta de fundo.';
        // O DESENHO vai junto (P2.38): é ele que permite gerar de novo sem apontar o arquivo.
        else if (!(await onFundo(r.blob, preparado.nomeArquivo, r.plano.underlay, r.plano.larguraPx, { v: 1, nomeArquivo: preparado.nomeArquivo, mmPorUnidade, camada, modo, espessuraMm, dx, dy, texto: preparado.texto }))) avisoDoFundo = 'As paredes entraram, mas a planta de fundo não foi guardada — veja o painel Planta de fundo.';
      } catch (e) {
        avisoDoFundo = `As paredes entraram, mas a planta de fundo não foi guardada: ${e instanceof Error ? e.message : String(e)}`;
      } finally {
        setImportando(false);
      }
    }
    const comandos: Command[] = [];
    for (const p of paredes) {
      // ESQUADRIAS (P2.33): o vão aponta para a parede pelo `uid` — o `id` só existe depois do lote (o truque da P2.29).
      const uid = novoUid();
      const heightMm = nivel.defaultHeightMm;
      comandos.push({
        type: 'AddWall',
        levelId: levelIdAtivo,
        // O deslocamento é aplicado AQUI, no ponto: o que entra é parede igual
        // à desenhada à mão, e tem de poder ser movida depois.
        a: { x: p.a.x + dx, y: p.a.y + dy },
        b: { x: p.b.x + dx, y: p.b.y + dy },
        thicknessMm: Math.max(1, p.espessuraMm),
        // O DXF é um desenho de PLANTA: ele não sabe altura nenhuma. O
        // pé-direito do nível é a única outra coisa que o desenho sabe.
        heightMm,
        uid,
      });
      const L = Math.round(Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y));
      for (const ab of p.aberturas) {
        if (ab.offsetMm < 0 || ab.offsetMm + ab.widthMm > L) continue;
        const sillMm = Math.max(0, Math.min(ab.sillMm, heightMm - 1));
        // PADRÃO ÒPURA (P2.35): porta de correr e o TIPO do bloco viram `sliding` e `esquadria.nome`.
        const opuraAb = ab as typeof ab & { correr?: boolean; tipo?: string };
        comandos.push({
          type: 'AddOpening',
          wallId: '',
          wallUid: uid,
          kind: opuraAb.correr ? 'sliding' : ab.kind,
          offsetMm: ab.offsetMm,
          widthMm: ab.widthMm,
          heightMm: Math.max(1, Math.min(ab.heightMm, heightMm - sillMm)),
          sillMm,
          ...(ab.hingeAtStart !== undefined ? { hingeAtStart: ab.hingeAtStart } : {}),
          ...(ab.swingReversed !== undefined ? { swingReversed: ab.swingReversed } : {}),
          ...(opuraAb.tipo && ab.kind !== 'passage' ? { esquadria: { nome: opuraAb.tipo, itemCode: '', descricao: '' } } : {}),
        });
      }
    }
    // PADRÃO ÒPURA (P2.35): o nome do ambiente nasce no ponto do texto, no mesmo lote das paredes.
    for (const amb of opura?.ambientes ?? []) {
      comandos.push({ type: 'PlaceSpaceLabel', levelId: levelIdAtivo, at: { x: amb.at.x + dx, y: amb.at.y + dy }, name: amb.nome });
    }
    onImportar(comandos);
    setPreparado(null);
    setErro(avisoDoFundo);
  }

  /** P2.38: abre o desenho guardado na prancha de fundo, com os parâmetros da importação que a criou. */
  function usarODaPrancha() {
    if (!temGuardado) return;
    setErro(null);
    try {
      const p = prepararDxf(temGuardado.texto);
      setPreparado({ nomeArquivo: temGuardado.nomeArquivo, texto: temGuardado.texto, ...p });
      setCamada(temGuardado.camada);
      setMmPorUnidade(temGuardado.mmPorUnidade);
      setModo(temGuardado.modo);
      setEspessuraMm(temGuardado.espessuraMm);
      setEspessurasFora(new Set());
      setUsarOpura(true);
      setDaPrancha({ dx: temGuardado.dx, dy: temGuardado.dy });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  /** P2.39: confere as portas do pavimento contra os arcos do desenho guardado. Só olha. */
  function conferirAsPortas() {
    if (!temGuardado || !levelIdAtivo) return;
    setErro(null);
    try {
      setConferencia(conferirPortas(model, levelIdAtivo, temGuardado));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  /** P2.39: aplica os giros — um passo de desfazer, nenhuma geometria muda. */
  function corrigirAsPortas() {
    if (!conferencia || conferencia.corrigir.length === 0) return;
    onImportar(comandosDaCorrecao(conferencia.corrigir));
    setConferencia({ ...conferencia, certas: conferencia.certas + conferencia.corrigir.length, corrigir: [] });
  }

  function baixarTemplate() {
    const blob = new Blob([gerarTemplateOpura()], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `padrao-opura-v${VERSAO_DO_PADRAO}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const campo = (rotulo: string, chave: keyof Omit<HipotesesDeEsquadrias, 'reconhecerSimbolos'>, min: number) => (
    <label key={chave} className="flex items-center justify-between gap-2 text-xs text-slate-600">
      {rotulo}
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={hipoteses[chave]}
          min={min}
          step={10}
          aria-label={rotulo}
          onChange={(e) => setHip({ ...hipoteses, [chave]: Math.max(min, Math.round(Number(e.target.value) || 0)) })}
          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-xs text-slate-800"
        />
        <span className="w-6 text-slate-400">mm</span>
      </span>
    </label>
  );

  return (
    <div className="px-4 py-3">
      {!preparado && (
        <>
          <p className="text-xs text-slate-500">
            Traz as paredes de um DXF ou DWG — e as portas (pelo arco da folha), janelas (pelo
            símbolo no vão) e vãos livres. O arquivo não sabe altura: a da parede vem do pé-direito
            do pavimento; a das esquadrias, das hipóteses abaixo. Parede curva não existe no
            desenho: arco só vale como símbolo.
          </p>
          <p className="mt-1 text-[11px] text-slate-400" data-testid="aviso-dwg">
            DWG é convertido para DXF no servidor (libredwg); a versão do arquivo aparece ao lado do nome.
            O caminho inverso não existe: para levar o desenho ao CAD, exporte DXF.
          </p>

          <label
            htmlFor="importar-dxf-arquivo"
            className="mt-2 flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border border-dashed border-slate-300 px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-800"
          >
            {lendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
            {lendo ? 'Lendo…' : 'Escolher arquivo DXF ou DWG'}
          </label>
          <input
            id="importar-dxf-arquivo"
            type="file"
            accept=".dxf,.dwg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void preparar(f);
              e.target.value = '';
            }}
          />

          {/* ── Gerar de novo, sem o arquivo (P2.38) ─────────────────────── */}
          {temGuardado && (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/70 px-2 py-1.5" data-testid="desenho-guardado">
              <p className="text-[11px] font-semibold text-emerald-900">O desenho desta planta de fundo está guardado</p>
              <p className="mt-0.5 text-[10px] text-emerald-900/80">
                {temGuardado.nomeArquivo} · camada {temGuardado.camada} · {temGuardado.mmPorUnidade === 1 ? 'milímetro' : temGuardado.mmPorUnidade === 1000 ? 'metro' : `${temGuardado.mmPorUnidade} mm por unidade`}. Gere de novo com outra
                camada, outras espessuras ou só de uma região — o que nascer cai em cima da planta de fundo.
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={usarODaPrancha}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-emerald-300 bg-white px-2 text-[12px] font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Gerar de novo com este desenho
                </button>
                <button
                  type="button"
                  onClick={conferirAsPortas}
                  disabled={!levelIdAtivo}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-emerald-300 bg-white px-2 text-[12px] font-medium text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-40"
                >
                  <DoorOpen className="h-3.5 w-3.5" />
                  Conferir o lado das portas
                </button>
              </div>
              {conferencia && (
                <div className="mt-1.5 rounded-md bg-white/70 px-2 py-1.5" data-testid="conferencia-portas">
                  <p className="text-[11px] text-emerald-900">
                    {conferencia.conferidas === 0
                      ? 'Nenhuma porta do pavimento casou com um arco deste desenho — nada a conferir.'
                      : `${conferencia.conferidas} porta(s) conferida(s) · ${conferencia.certas} com o arco em cima do desenho${conferencia.corrigir.length > 0 ? ` · ${conferencia.corrigir.length} do lado errado` : ''}`}
                    {conferencia.semArco > 0 ? ` · ${conferencia.semArco} sem arco no desenho` : ''}
                  </p>
                  {conferencia.corrigir.length > 0 && (
                    <button
                      type="button"
                      onClick={corrigirAsPortas}
                      className="mt-1 inline-flex h-7 items-center gap-1.5 rounded-[6px] bg-emerald-600 px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-emerald-700"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Corrigir {conferencia.corrigir.length} porta(s)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Padrão ÒPURA (P2.35) ─────────────────────────────────────── */}
          <div className="mt-3 rounded-md border border-blue-100 bg-blue-50/60 px-2 py-1.5" data-testid="padrao-opura">
            <p className="text-[11px] font-semibold text-blue-900">Padrão ÒPURA de desenho v{VERSAO_DO_PADRAO}</p>
            <p className="mt-0.5 text-[10px] text-blue-900/80">
              Desenhe no template e a leitura deixa de reconhecer para LER: eixo é parede (espessura pela camada), bloco com atributos é
              porta/janela com largura, altura e peitoril declarados, texto é nome de ambiente.
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={baixarTemplate}
                className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-blue-300 bg-white px-2 text-[12px] font-medium text-blue-800 transition-colors hover:bg-blue-100"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar template (.dxf)
              </button>
              <button type="button" onClick={() => setMostrarRegras((v) => !v)} className="text-[11px] font-medium text-blue-700 hover:underline" aria-expanded={mostrarRegras}>
                {mostrarRegras ? 'Ocultar regras' : 'Ver as regras'}
              </button>
            </div>
            {mostrarRegras && (
              <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-[10px] text-blue-900/80" data-testid="regras-opura">
                {REGRAS_DO_PADRAO.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}

      {erro && <p className="mt-2 text-[11px] text-red-700">{erro}</p>}

      {preparado && (
        <>
          <h4 className="truncate text-xs font-semibold text-slate-700" title={preparado.nomeArquivo}>
            {preparado.nomeArquivo}
          </h4>
          {preparado.dwg && (
            <p className="text-[11px] text-slate-500" data-testid="versao-do-dwg">
              DWG {preparado.dwg.versao} · {preparado.dwg.release} · {(preparado.dwg.bytes / 1024).toFixed(0)} KB, convertido para DXF no servidor
              {preparado.dwg.codigoLibredwg > 0 ? ` (libredwg avisou: código ${preparado.dwg.codigoLibredwg}; entidades desconhecidas foram ignoradas)` : ''}
            </p>
          )}

          {/* ── Padrão ÒPURA detectado (P2.35) ────────────────────────────── */}
          {temOpura && (
            <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5" data-testid="aviso-opura">
              <label className="flex items-center gap-2 text-[11px] font-semibold text-blue-900">
                <input type="checkbox" checked={usarOpura} onChange={(e) => setUsarOpura(e.target.checked)} aria-label="Ler pelo Padrão ÒPURA" className="h-3.5 w-3.5" />
                Arquivo no Padrão ÒPURA — lido, não reconhecido
              </label>
              {opura && (
                <p className="mt-0.5 text-[10px] text-blue-900/80" data-testid="resumo-opura">
                  {opura.resumo.camadas.map((c) => `${c.paredes} parede(s) de ${c.espessuraMm} mm`).join(' · ') || 'nenhuma camada OPURA-PAREDE-*'}
                  {` · ${opura.resumo.portas} porta(s) · ${opura.resumo.janelas} janela(s) · ${opura.resumo.correr} de correr · ${opura.resumo.vaos} vão(s) · ${opura.resumo.ambientes} ambiente(s)`}
                  {opura.resumo.esquadriasSemParede > 0 ? ` · ${opura.resumo.esquadriasSemParede} bloco(s) longe de parede` : ''}
                  {opura.resumo.esquadriasForaDaParede > 0 ? ` · ${opura.resumo.esquadriasForaDaParede} bloco(s) que não coube(ram) na parede` : ''}
                </p>
              )}
            </div>
          )}

          {!pelaOpura && (
            <>
          {/* ── A camada ─────────────────────────────────────────────────── */}
          <label className="mt-2 block text-[11px] font-semibold text-slate-600">
            Camada de parede
            <select
              value={camada}
              onChange={(e) => setCamada(e.target.value)}
              aria-label="Camada que contém as paredes"
              className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
            >
              {preparado.porCamada.map((c) => (
                <option key={c.camada} value={c.camada}>
                  {c.camada} — {c.segmentos} traços{c.arcos > 0 ? ` · ${c.arcos} arcos` : ''}
                </option>
              ))}
            </select>
          </label>

          {/* ── A escala ─────────────────────────────────────────────────── */}
          <label className="mt-2 block text-[11px] font-semibold text-slate-600">
            Unidade do arquivo
            <select
              value={mmPorUnidade}
              onChange={(e) => setMmPorUnidade(Number(e.target.value))}
              aria-label="Unidade em que o arquivo foi desenhado"
              className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
            >
              {preparado.escalas.map((e) => (
                <option key={e.mmPorUnidade} value={e.mmPorUnidade}>
                  {e.rotulo}
                  {e.paredesPlausiveis > 0
                    ? ` — ${e.paredesPlausiveis} paredes plausíveis`
                    : ' — nenhuma parede plausível'}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-0.5 text-[10px] text-slate-400">
            Medida pelas espessuras que cada unidade produz, e não pelo cabeçalho do
            arquivo: no projeto real da empresa ele declara milímetro e está em metro.
          </p>

          {/* ── O caminho ────────────────────────────────────────────────── */}
          <div className="mt-2 flex gap-1.5">
            {(
              [
                ['FACES', 'Duas faces', 'A parede é o par de traços paralelos — o caso comum.'],
                ['EIXOS', 'Camada de eixo', 'Cada traço já é o eixo de uma parede.'],
              ] as const
            ).map(([valor, rotulo, dica]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setModo(valor)}
                title={dica}
                className={`h-7 flex-1 rounded-[6px] px-2 text-[12px] font-medium transition-colors ${
                  modo === valor
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-300 text-slate-600 hover:text-slate-800'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {modo === 'EIXOS' && (
            <label className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-600">
              Espessura
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  value={espessuraMm}
                  min={1}
                  aria-label="Espessura das paredes da camada de eixo"
                  onChange={(e) => setEspessuraMm(Math.max(1, Number(e.target.value) || 0))}
                  className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-xs text-slate-800"
                />
                <span className="w-6 text-slate-400">mm</span>
              </span>
            </label>
          )}
          {modo === 'EIXOS' && (
            <p className="mt-0.5 text-[10px] text-slate-400">
              O traço do eixo não carrega espessura — ela não está no arquivo, e por isso é
              perguntada em vez de arbitrada.
            </p>
          )}

            </>
          )}

          {/* ── Esquadrias (P2.33) ───────────────────────────────────────── */}
          <div className="mt-2 rounded-md border border-slate-200 px-2 py-1.5" data-testid="esquadrias-dxf">
            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={hipoteses.reconhecerSimbolos}
                onChange={(e) => setHip({ ...hipoteses, reconhecerSimbolos: e.target.checked })}
                aria-label="Reconhecer portas e janelas pelos símbolos"
                className="h-3.5 w-3.5"
              />
              Reconhecer portas (arco) e janelas (símbolo) em todas as camadas
            </label>
            <div className="mt-1.5 space-y-1">
              {campo('Altura da porta', 'portaAlturaMm', 1)}
              {campo('Peitoril da janela', 'janelaPeitorilMm', 0)}
              {campo('Altura da janela', 'janelaAlturaMm', 1)}
              {campo('Vão livre até', 'vaoLivreMaxMm', 0)}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              O DXF é planta: estas alturas são hipóteses, editáveis peça a peça depois. Buraco na parede sem
              símbolo vira vão livre até este tamanho (0 = não emendar); acima, ficam duas paredes.
            </p>
          </div>

          {/* ── Região (P2.38): gerar só um pedaço ───────────────────────── */}
          {daPrancha && onArmarRegiao && (
            <div className="mt-2 rounded-md border border-violet-200 bg-violet-50/60 px-2 py-1.5" data-testid="regiao-dxf">
              <p className="text-[11px] font-semibold text-violet-900">Onde gerar</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onArmarRegiao}
                  aria-pressed={regiaoArmada}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium ${regiaoArmada ? 'border-violet-500 bg-violet-100 text-violet-900' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  <SquareDashedMousePointer className="h-3.5 w-3.5" />
                  {regiaoArmada ? 'Arraste no desenho…' : regiao ? 'Marcar outra região' : 'Marcar região'}
                </button>
                {regiao && onLimparRegiao && (
                  <button type="button" onClick={onLimparRegiao} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                    <X className="h-3 w-3" />
                    Limpar
                  </button>
                )}
              </div>
              <p className="mt-1 text-[10px] text-violet-900/80">
                {regiao
                  ? `Só as paredes com o meio dentro do retângulo entram${foraDaRegiao > 0 ? ` — ${foraDaRegiao} fora dele` : ''}.`
                  : 'Sem região, o desenho inteiro entra de novo. Marcar um retângulo é o jeito de corrigir um cômodo sem mexer no resto.'}
              </p>
            </div>
          )}

          {/* ── Onde cai ─────────────────────────────────────────────────── */}
          {daPrancha && (
            <p className="mt-2 text-[11px] text-slate-500" data-testid="alinhado-ao-fundo">
              Posição: alinhada à planta de fundo (o deslocamento da importação que a criou).
            </p>
          )}
          {!daPrancha && (
          <label className="mt-2 block text-[11px] font-semibold text-slate-600">
            Posição
            <select
              value={ancoragem}
              onChange={(e) => setAncoragem(e.target.value as AncoragemIfc)}
              aria-label="Onde ancorar o desenho importado"
              className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
            >
              <option value="ORIGEM">Encostar na origem</option>
              <option value="DESENHO">Centralizar no desenho</option>
              <option value="ARQUIVO">Manter as coordenadas do arquivo</option>
            </select>
          </label>
          )}
          {!daPrancha && ancoragem === 'ARQUIVO' && pegada && (
            <p className={`mt-0.5 text-[10px] ${longe ? 'font-medium text-red-700' : 'text-amber-700'}`} data-testid="aviso-longe">
              O desenho está a {m2(Math.max(Math.abs(pegada.maxX), Math.abs(pegada.maxY)))} m da
              origem do arquivo. Acima de 1.000 m o desenho recusa a importação
              {longe ? ' — escolha outra posição.' : '.'}
            </p>
          )}

          {/* ── Espessuras (P2.34) ───────────────────────────────────────── */}
          {!pelaOpura && porEspessura.length > 1 && (
            <div className="mt-2" data-testid="espessuras-dxf">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600">Espessuras que são parede</span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      // "Principais": as que somam pelo menos 4% do comprimento. Medido no projeto real: 400 mm (muro) tem 4,4%; grade e telhado (70-90 mm) ficam abaixo de 2,5%.
                      setEspessurasFora(new Set(porEspessura.filter((e) => e.comprimentoMm < 0.04 * comprimentoBruto).map((e) => e.espessuraMm)));
                    }}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-50"
                  >
                    Só as principais
                  </button>
                  <button type="button" onClick={() => setEspessurasFora(new Set())} className="rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100">
                    Todas
                  </button>
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {porEspessura.map((e) => {
                  const ligada = !espessurasFora.has(e.espessuraMm);
                  return (
                    <button
                      key={e.espessuraMm}
                      type="button"
                      aria-pressed={ligada}
                      aria-label={`Espessura ${e.espessuraMm} mm`}
                      title={`${e.paredes} parede(s) · ${m2(e.comprimentoMm)} m`}
                      onClick={() => {
                        const fora = new Set(espessurasFora);
                        if (ligada) fora.add(e.espessuraMm);
                        else fora.delete(e.espessuraMm);
                        setEspessurasFora(fora);
                      }}
                      className={`rounded-[6px] border px-1.5 py-0.5 text-[10px] tabular-nums transition-colors ${ligada ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-400 line-through'}`}
                    >
                      {e.espessuraMm} · {e.paredes} · {m2(e.comprimentoMm)} m
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── O desenho original por baixo (P2.36) ─────────────────────── */}
          {onFundo && !daPrancha && (
            <div className="mt-2 rounded-md border border-slate-200 px-2 py-1.5" data-testid="fundo-dxf">
              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                <input type="checkbox" checked={guardarFundo} onChange={(e) => setGuardarFundo(e.target.checked)} aria-label="Guardar o desenho original como planta de fundo" className="h-3.5 w-3.5" />
                Guardar o desenho original como planta de fundo, para comparar
              </label>
              <p className="mt-0.5 text-[10px] text-slate-400" data-testid="plano-do-fundo">
                {!guardarFundo
                  ? 'Só as paredes entram; o desenho de origem não fica na tela.'
                  : planoDoFundo
                    ? `Todas as camadas, já aferido: ${planoDoFundo.larguraPx} × ${planoDoFundo.alturaPx} px · ${(planoDoFundo.mmPorPixel >= 10 ? planoDoFundo.mmPorPixel.toFixed(0) : planoDoFundo.mmPorPixel.toFixed(1)).replace('.', ',')} mm/px${!pelaOpura ? ` · camada ${camada} em destaque` : ''}${fundoAtivo ? ' · entra como mais uma prancha de fundo' : ''}. Onde a parede gerada não cobrir o traço, foi o reconhecimento que errou.`
                    : 'Nada para rasterizar.'}
              </p>
            </div>
          )}

          {/* ── Relatório de leitura (P2.34) ─────────────────────────────── */}
          <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5" data-testid="relatorio-dxf">
            <p className="text-[11px] font-semibold text-slate-600">Relatório de leitura</p>
            <p className="mt-0.5 text-[11px] text-slate-500" data-testid="resumo-dxf">
              {paredes.length === 0
                ? 'Nenhuma parede reconhecida nesta camada com esta unidade.'
                : `${paredes.length} parede${paredes.length > 1 ? 's' : ''} · ${m2(comprimentoTotal)} m no total · espessuras ${espessuras.join(', ')} mm`}
            </p>
            {paredes.length > 0 && (
              <p className="mt-0.5 text-[11px] text-slate-500" data-testid="resumo-esquadrias">
                {totalDeAberturas === 0
                  ? (pelaOpura ? 'Nenhum bloco de esquadria no arquivo.' : 'Nenhuma porta, janela ou vão reconhecido.')
                  : `${contagem.portas} porta(s) · ${contagem.janelas} janela(s) · ${contagem.vaos} vão(s) livre(s)`}
                {contagem.correr > 0 ? ` · ${contagem.correr} de correr` : ''}
                {opura && opura.resumo.ambientes > 0 ? ` · ${opura.resumo.ambientes} nome(s) de ambiente` : ''}
              </p>
            )}
            {paredes.length > 0 && (
              <p className="mt-0.5 text-[11px] text-slate-500" data-testid="resumo-juncoes">
                {esquadrias.resumo.pontasSoltas === 0
                  ? 'Todas as pontas de parede encostam em outra.'
                  : `${esquadrias.resumo.pontasSoltas} ponta(s) de parede vão ficar soltas`}
                {esquadrias.resumo.encostadas > 0 ? ` · ${esquadrias.resumo.encostadas} encostada(s) no eixo da parede que cruza` : ''}
                {esquadrias.resumo.cantosFechados > 0 ? ` · ${esquadrias.resumo.cantosFechados} canto(s) fechado(s)` : ''}
              </p>
            )}
            {(esquadrias.resumo.arcosSemParede > 0 || esquadrias.resumo.tocosDeBatente > 0 || preparado.blocosExpandidos > 0 || limpo.removidas > 0 || espessurasFora.size > 0) && (
              <p className="mt-0.5 text-[10px] text-slate-400" data-testid="resumo-ignorados">
                {[
                  espessurasFora.size > 0 ? `${limpo.paredes.length - filtradas.length} parede(s) fora pelo filtro de espessura` : '',
                  limpo.removidas > 0 ? `${limpo.removidas} sobreposta(s) descartada(s)` : '',
                  esquadrias.resumo.tocosDeBatente > 0 ? `${esquadrias.resumo.tocosDeBatente} toco(s) de batente descartado(s)` : '',
                  esquadrias.resumo.arcosSemParede > 0 ? `${esquadrias.resumo.arcosSemParede} arco(s) de porta longe de parede, ignorado(s)` : '',
                  preparado.blocosExpandidos > 0 ? `${preparado.blocosExpandidos} bloco(s) expandido(s)` : '',
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {preparado.recusas.length > 0 && (
            <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5">
              <p className="flex items-center gap-1 text-[11px] font-medium text-amber-800">
                <AlertTriangle className="h-3 w-3" />
                Não convertido
              </p>
              <ul className="mt-0.5 space-y-0.5 text-[10px] text-amber-700">
                {preparado.recusas.slice(0, 5).map((r) => (
                  <li key={`${r.camada}-${r.tipo}`}>
                    {r.quantas} {r.tipo} em {r.camada}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={() => void importar()}
              disabled={paredes.length === 0 || !levelIdAtivo || importando || (!daPrancha && ancoragem === 'ARQUIVO' && longe)}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[6px] bg-blue-600 px-2.5 text-[13px] font-medium text-white transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-40"
            >
              {importando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Importar {paredes.length}{totalDeAberturas + (opura?.resumo.ambientes ?? 0) > 0 ? ` + ${totalDeAberturas + (opura?.resumo.ambientes ?? 0)}` : ''}
            </button>
            <button
              type="button"
              onClick={() => setPreparado(null)}
              className="h-8 rounded-[6px] px-2.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
