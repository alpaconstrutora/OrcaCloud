import { ifcGuidDeUid } from './blueprintIfc';
import type { BlueprintModel, Conflito } from './blueprintKernel';
import { rotuloCurto } from './blueprintKernel';

/**
 * BCF 2.1 — levar a pendência para FORA do OrçaCloud.
 *
 * ─── O QUE ISTO RESOLVE ─────────────────────────────────────────────────────
 *
 * Nós produzimos duas espécies de pendência: o COMENTÁRIO ancorado num elemento
 * e o CONFLITO entre instalação e estrutura. As duas morriam aqui dentro — e
 * quem precisa desviar o cano é o projetista, que trabalha no Revit, no
 * Navisworks ou no Solibri. BCF é o formato que os três leem.
 *
 * Sem ele, a lista de conflitos é um relatório interno: correto, completo, e
 * invisível para quem tem de agir.
 *
 * ─── ⚠️ O GUID É A COISA MAIS IMPORTANTE DESTE ARQUIVO ──────────────────────
 *
 * O BCF não descreve o elemento: ele o APONTA, por `IfcGuid`. Se o guid do
 * tópico não for byte a byte o mesmo que o do IFC que acompanha, o receptor
 * abre a pendência e não seleciona nada — e o efeito é pior que não exportar,
 * porque o arquivo parece funcionar.
 *
 * Por isso o guid sai de `ifcGuidDeUid`, a MESMA função que o exportador de IFC
 * usa, e não de uma reimplementação. E isso só é possível por causa da Etapa 1:
 * antes do `uid` estável, o guid mudava a cada publicação e a pendência de hoje
 * apontaria para outra parede amanhã.
 *
 * ─── ⚠️ A CÂMERA, QUE ERA A DÚVIDA DO PLANO ─────────────────────────────────
 *
 * BCF quer uma câmera por tópico, e o nosso editor é 2D: não há estado de
 * navegação 3D para capturar. Em vez de inventar um enquadramento que
 * afirmaria um ponto de vista que ninguém escolheu, sai uma câmera
 * ORTOGONAL olhando de cima, centrada na pendência — que é exatamente a vista
 * em que ela foi criada.
 *
 * Isso está declarado no tópico. O que de fato faz o trabalho do outro lado é o
 * `Components`: o receptor seleciona os elementos, e a câmera é conveniência.
 */

/** Um arquivo dentro do `.bcfzip`. */
export interface ArquivoBcf {
  caminho: string;
  conteudo: string;
}

export interface TopicoBcf {
  /** GUID do TÓPICO (não do elemento) — identidade da pendência. */
  guid: string;
  titulo: string;
  tipo: 'Issue' | 'Clash';
  status: 'Open' | 'Closed';
  autor: string;
  criadoEm: Date;
  descricao: string;
  /** Os elementos apontados, já em `IfcGuid`. */
  componentes: string[];
  /** Onde olhar, em MILÍMETRO no mundo. */
  alvo: { x: number; y: number; z: number };
}

const escapar = (t: string): string =>
  t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const iso = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * O GUID do tópico, DERIVADO do que ele aponta.
 *
 * ⚠️ Derivado, e não aleatório, e a razão é o segundo envio: exportar o mesmo
 * conflito duas vezes tem de dar o mesmo tópico, senão a caixa de entrada de
 * quem recebe enche de duplicatas a cada rodada de coordenação — e ninguém
 * consegue dizer o que é novo.
 *
 * O formato é o do UUID canônico, que é o que o BCF 2.1 espera (32 hexadecimais
 * em 8-4-4-4-12), e sai de um hash simples e estável da semente.
 */
export function guidDoTopico(semente: string): string {
  // FNV-1a de 32 bits, repetido com temperos diferentes para encher 128 bits.
  const h = (sufixo: string): string => {
    let x = 0x811c9dc5;
    for (const c of `${semente}#${sufixo}`) {
      x ^= c.charCodeAt(0);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return x.toString(16).padStart(8, '0');
  };
  const b = `${h('a')}${h('b')}${h('c')}${h('d')}`;
  return `${b.slice(0, 8)}-${b.slice(8, 12)}-${b.slice(12, 16)}-${b.slice(16, 20)}-${b.slice(20, 32)}`;
}

/** `bcf.version` — o cartão de visita do zip. */
export function versaoBcf(): ArquivoBcf {
  return {
    caminho: 'bcf.version',
    conteudo:
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Version VersionId="2.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
      '  <DetailedVersion>2.1</DetailedVersion>\n' +
      '</Version>\n',
  };
}

/** `markup.bcf` de um tópico: o que é a pendência, e quem a levantou. */
export function markupDoTopico(t: TopicoBcf): ArquivoBcf {
  return {
    caminho: `${t.guid}/markup.bcf`,
    conteudo:
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
      `  <Topic Guid="${t.guid}" TopicType="${t.tipo}" TopicStatus="${t.status}">\n` +
      `    <Title>${escapar(t.titulo)}</Title>\n` +
      `    <CreationDate>${iso(t.criadoEm)}</CreationDate>\n` +
      `    <CreationAuthor>${escapar(t.autor)}</CreationAuthor>\n` +
      `    <Description>${escapar(t.descricao)}</Description>\n` +
      '  </Topic>\n' +
      '  <Viewpoints Guid="' +
      t.guid +
      '">\n' +
      '    <Viewpoint>viewpoint.bcfv</Viewpoint>\n' +
      '  </Viewpoints>\n' +
      '</Markup>\n',
  };
}

/**
 * `viewpoint.bcfv` — a câmera e, sobretudo, os COMPONENTES.
 *
 * ⚠️ `Selection` é o que faz o receptor destacar as peças. A câmera sem ele
 * levaria quem abre até o lugar certo sem dizer o que olhar, num modelo em que
 * há dezenas de peças naquele lugar.
 */
export function viewpointDoTopico(t: TopicoBcf): ArquivoBcf {
  const M = 0.001; // O BCF trabalha em METRO; o kernel, em milímetro.
  const componentes = t.componentes
    .map((g) => `      <Component IfcGuid="${g}" />\n`)
    .join('');
  return {
    caminho: `${t.guid}/viewpoint.bcfv`,
    conteudo:
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<VisualizationInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Guid="' +
      t.guid +
      '">\n' +
      '  <Components>\n' +
      '    <Selection>\n' +
      componentes +
      '    </Selection>\n' +
      '    <Visibility DefaultVisibility="true" />\n' +
      '  </Components>\n' +
      // Ortogonal e de cima: é a vista em que a pendência foi criada, e não um
      // enquadramento 3D que ninguém escolheu. Ver o cabeçalho.
      '  <OrthogonalCamera>\n' +
      '    <CameraViewPoint>\n' +
      `      <X>${(t.alvo.x * M).toFixed(6)}</X>\n` +
      `      <Y>${(t.alvo.y * M).toFixed(6)}</Y>\n` +
      `      <Z>${(t.alvo.z * M + 20).toFixed(6)}</Z>\n` +
      '    </CameraViewPoint>\n' +
      '    <CameraDirection><X>0</X><Y>0</Y><Z>-1</Z></CameraDirection>\n' +
      '    <CameraUpVector><X>0</X><Y>1</Y><Z>0</Z></CameraUpVector>\n' +
      // ⚠️ `ViewToWorldScale` é o TAMANHO VISÍVEL DA VISTA EM METROS — foi o que
      // o XSD do buildingSMART esclareceu —, e não um fator de zoom. 10 m
      // enquadra um cômodo com folga. Lido como fator, o número seria absurdo e
      // o receptor abriria numa escala sem sentido.
      '    <ViewToWorldScale>10</ViewToWorldScale>\n' +
      '  </OrthogonalCamera>\n' +
      '</VisualizationInfo>\n',
  };
}

/**
 * Os conflitos de instalação virados tópicos BCF.
 *
 * ⚠️ O tipo é `Clash`, e não `Issue`: é o que faz Solibri e Navisworks
 * separarem interferência geométrica de comentário de projeto nas listas deles.
 */
export function topicosDeConflitos(
  model: BlueprintModel,
  conflitos: Conflito[],
  autor: string,
  agora: Date,
): TopicoBcf[] {
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const porId = new Map((model.trechos ?? []).map((t) => [t.id, t]));

  return conflitos.map((c) => {
    const t = porId.get(c.trechoId);
    const ez = t ? (elevacao.get(t.levelId) ?? 0) : 0;
    const alvo = t
      ? {
          x: (t.a.x + t.b.x) / 2,
          y: (t.a.y + t.b.y) / 2,
          z: ez + (t.cotaAMm + t.cotaBMm) / 2,
        }
      : { x: 0, y: 0, z: 0 };

    const como =
      c.comprimentoDentroMm > 0
        ? `${(c.comprimentoDentroMm / 1000).toFixed(3)} m por dentro`
        : `de raspão, ${Math.round(c.folgaEntreEixosMm)} mm entre os eixos`;

    return {
      // ⚠️ A semente é o PAR de uids, e não os ids: o id muda a cada
      // publicação. Ver `guidDoTopico`.
      guid: guidDoTopico(`clash:${c.trechoUid}:${c.outroUid}`),
      titulo: `${rotuloCurto(c.trechoUid, 'trecho')} encontra ${
        c.classe === 'REDE'
          ? rotuloCurto(c.outroUid, 'trecho')
          : rotuloCurto(c.outroUid, 'structural')
      }`,
      tipo: 'Clash' as const,
      status: 'Open' as const,
      autor,
      criadoEm: agora,
      descricao:
        `Interferência entre instalação e ${
          c.classe === 'REDE' ? 'outra disciplina' : 'estrutura'
        }: ${como}. ` +
        'Detectado pela Planta Inteligente do ÒPURA. A geometria do trecho é o ' +
        'eixo declarado com a bitola declarada — não há detalhamento de conexão.',
      componentes: [ifcGuidDeUid(c.trechoUid), ifcGuidDeUid(c.outroUid)],
      alvo,
    };
  });
}

/** Um comentário ancorado virado tópico. */
export interface ComentarioParaBcf {
  id: string;
  elementUid: string | null;
  texto: string;
  autorEmail: string | null;
  criadoEm: string;
  resolvidoEm: string | null;
  ponto: { x: number; y: number; z: number } | null;
}

export function topicosDeComentarios(comentarios: ComentarioParaBcf[]): TopicoBcf[] {
  return comentarios.map((c) => ({
    guid: guidDoTopico(`comentario:${c.id}`),
    // A primeira linha vira o título; o texto inteiro fica na descrição. Um
    // título de 400 caracteres inutiliza a lista de quem recebe.
    titulo: c.texto.split('\n')[0].slice(0, 120) || 'Comentário',
    tipo: 'Issue' as const,
    // ⚠️ Comentário RESOLVIDO viaja como `Closed`, e não é omitido: quem recebe
    // precisa saber que aquilo já foi decidido, senão reabre a discussão.
    status: c.resolvidoEm ? ('Closed' as const) : ('Open' as const),
    autor: c.autorEmail ?? 'ÒPURA',
    criadoEm: new Date(c.criadoEm),
    descricao: c.texto,
    componentes: c.elementUid ? [ifcGuidDeUid(c.elementUid)] : [],
    alvo: c.ponto ?? { x: 0, y: 0, z: 0 },
  }));
}

/** Todos os arquivos do `.bcfzip`, prontos para zipar. */
export function arquivosDoBcf(topicos: TopicoBcf[]): ArquivoBcf[] {
  return [
    versaoBcf(),
    ...topicos.flatMap((t) => [markupDoTopico(t), viewpointDoTopico(t)]),
  ];
}
