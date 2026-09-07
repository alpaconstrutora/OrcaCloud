/**
 * O `GlobalId` de um arquivo de terceiro virando `uid` do kernel — e voltando.
 *
 * ─── O QUE ESTÁ EM JOGO ─────────────────────────────────────────────────────
 *
 * O objetivo da importação é ida e volta: importa do Revit, mexe aqui, exporta
 * de volta, e o Revit reconhece a MESMA parede. Isso só acontece se o
 * `GlobalId` sair caractere por caractere igual ao que entrou.
 *
 * Parecia exigir um campo novo no kernel para guardar a origem. Não exige:
 * `IfcGloballyUniqueId` É um UUID de 128 bits comprimido, e `ifcGuidDeUid` já
 * implementa essa compressão. O caminho de volta é o inverso dela.
 *
 * ─── POR QUE OS GUIDs SÃO REAIS ─────────────────────────────────────────────
 *
 * ⚠️ Todos os valores abaixo foram LIDOS dos arquivos, não inventados. Um GUID
 * que eu escrevesse à mão passaria por qualquer implementação — inclusive uma
 * errada em alfabeto ou em ordem de bits. Os de verdade têm `$` e `_` (que a
 * base64 comum não tem), primeiro caractere variando de `0` a `3`, e sequências
 * quase idênticas que um deslocamento de bits confundiria.
 */
import { describe, expect, it } from 'vitest';
import { ifcGuidDeUid, uidDeIfcGuid } from '../utils/blueprintIfc';
import { EH_UID } from '../utils/blueprintKernel/identity';

/** `IFCWALLSTANDARDCASE` do AC20-FZK-Haus.ifc. */
const PAREDES_FZK = [
  '2XPyKWY018sA1ygZKgQPtU',
  '3PfS__Y_DBAfq5naM6zD2Z',
  '2ptk1k7qn8_Qk22vjh$0DE',
  '3jjW3rL656ex34Gws22EfM',
];

/** `IFCWALL` do DigitalHub.ifc — três consecutivos, quase iguais. */
const PAREDES_HUB = ['23Np8uMAvEN9H6Ds49debS', '23Np8uMAvEN9H6Ds49dea4', '23Np8uMAvEN9H6Ds49deZx'];

/** Esquadrias dos dois arquivos. */
const ESQUADRIAS = [
  '0YVU7tDBX86u6UVVsSmdwk',
  '0YVU7tDBX86u6UVVsSmdwl',
  '1srAI$R4T8ihLXSNHmUSET',
  '0B1RwEzzP3CfME5NR$Vqh5',
];

const TODOS = [...PAREDES_FZK, ...PAREDES_HUB, ...ESQUADRIAS];

describe('GlobalId do IFC ↔ uid do kernel', () => {
  it('a ida e volta devolve o MESMO GUID, caractere por caractere', () => {
    // É esta igualdade que faz o Revit reconhecer a parede em vez de criar
    // outra. Qualquer perda aqui só apareceria no arquivo do cliente.
    for (const guid of TODOS) {
      const uid = uidDeIfcGuid(guid);
      expect(uid, guid).not.toBeNull();
      expect(ifcGuidDeUid(uid!), guid).toBe(guid);
    }
  });

  it('o uid gerado passa na guarda de formato do kernel', () => {
    // Sem isto, `assertModelInvariants` recusaria a parede importada com
    // `BAD_UID` — e só na hora de aplicar o comando, longe da leitura.
    for (const guid of TODOS) {
      expect(EH_UID.test(uidDeIfcGuid(guid)!), guid).toBe(true);
    }
  });

  it('GUIDs vizinhos dão uids DISTINTOS', () => {
    // Os três do DigitalHub diferem só nos dois últimos caracteres. Um erro de
    // deslocamento de bits os colapsaria, e duas paredes com o mesmo uid
    // disparam `DUPLICATE_UID` — ou pior, uma sobrescreve a outra.
    const uids = new Set(TODOS.map((g) => uidDeIfcGuid(g)));
    expect(uids.size).toBe(TODOS.length);
  });

  it('o alfabeto do IFC não é o da base64 comum', () => {
    // `$` e `_` são do IFC; `+` e `/` não existem lá. Aceitá-los produziria um
    // uid plausível para um GUID que o arquivo nunca escreveu.
    expect(uidDeIfcGuid('2XPyKWY018sA1ygZKgQPt+')).toBeNull();
    expect(uidDeIfcGuid('2XPyKWY018sA1ygZKgQPt/')).toBeNull();
    expect(uidDeIfcGuid('2ptk1k7qn8_Qk22vjh$0DE')).not.toBeNull();
  });

  it('recusa em vez de adivinhar: tamanho errado e primeiro caractere fora de 0–3', () => {
    expect(uidDeIfcGuid('')).toBeNull();
    expect(uidDeIfcGuid('2XPyKWY018sA1ygZKgQPt')).toBeNull();
    expect(uidDeIfcGuid('2XPyKWY018sA1ygZKgQPtUU')).toBeNull();
    // O primeiro caractere carrega só 2 bits. `4` significaria 129 bits, e
    // truncar em silêncio daria um uid que colide com outro elemento.
    expect(uidDeIfcGuid('4XPyKWY018sA1ygZKgQPtU')).toBeNull();
  });

  it('cobre as bordas do intervalo de 128 bits', () => {
    // Tudo zero e tudo um: os dois extremos que um `padStart` ou um `>>` errado
    // quebraria sem afetar nenhum valor do meio.
    expect(uidDeIfcGuid('0000000000000000000000')).toBe('00000000-0000-0000-0000-000000000000');
    const cheio = `3${'$'.repeat(21)}`;
    expect(ifcGuidDeUid(uidDeIfcGuid(cheio)!)).toBe(cheio);
  });
});
