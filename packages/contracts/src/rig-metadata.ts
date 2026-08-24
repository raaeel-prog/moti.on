/**
 * Identificação e metadata de rigs, conforme §11 do master spec.
 *
 * O tipo mora aqui porque o CHMS-003 precisa dele no contrato; o *comportamento*
 * — ler, gravar, migrar e remover o bloco de metadata sem apagar o comentário
 * que o usuário escreveu — chega no CHMS-009, em `packages/rig-metadata`.
 *
 * Os marcadores são `MOTION_*` e não `CHMS_*`. A troca está registrada em
 * `docs/adr/0001-marca-e-namespace.md`: não existe migração do formato antigo, e
 * não se deve uma, porque nada foi publicado e portanto nenhum projeto no mundo
 * contém metadata deste plugin.
 */

/**
 * Delimitadores do bloco de metadata dentro do comentário de uma layer.
 *
 * O plugin escreve **apenas** entre os dois marcadores e preserva integralmente
 * o que o usuário tiver escrito antes ou depois. O comentário de layer é campo
 * do usuário; o plugin é hóspede nele.
 */
export const META_OPEN = "[MOTION_META_V1]";
export const META_CLOSE = "[/MOTION_META_V1]";

/**
 * Prefixo dos nomes de layer criadas por rigs, por exemplo
 * `MOTION | PARALLAX | CAMERA`.
 *
 * Serve para o usuário reconhecer o que é do plugin na timeline. **Não** serve
 * como identificador: a §11 é explícita — *"Nunca usar somente o nome da layer
 * como identificador"*. Nome de layer é editável, duplicável e não é único. A
 * identidade é o `rigId` no bloco de metadata.
 */
export const RIG_PREFIX = "MOTION | ";

/**
 * Cabeçalho que toda expressão gerada carrega, seguido do id do comando:
 * `// MOTION_EXPRESSION v1 | ae.animate.wiggle`.
 *
 * Permite reconhecer uma expressão do plugin para poder oferecer ajuste ou
 * remoção, e distinguir da expressão que o usuário escreveu à mão — que nunca
 * pode ser sobrescrita sem consentimento.
 */
export const EXPRESSION_HEADER = "// MOTION_EXPRESSION v1 | ";

export interface RigMetadata {
  schemaVersion: 1;
  /** Identidade real do rig. Estável através de renomeações e duplicações. */
  rigId: string;
  rigType: string;
  pluginVersion: string;
  createdAt: string;
  controllerLayerUuid?: string;
  memberLayerUuids: string[];
  presetId?: string;
  /**
   * Ajustes que o usuário fez por cima do preset. Preservados quando o rig é
   * reajustado: reaplicar o preset e descartar isto silenciosamente seria
   * sobrescrever trabalho.
   */
  userOverrides?: Record<string, unknown>;
}
