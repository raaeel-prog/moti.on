# ADR 0002 — Versionamento do protocolo de comandos

- **Status:** aceito
- **Data:** 2026-08-24
- **Issue:** CHMS-003

## Contexto

`packages/contracts` define o formato que o painel e as duas camadas de host usam para conversar. Esse formato atravessa três fronteiras que não atualizam juntas:

1. **Painel ↔ host.** No After Effects, painel e host são carregados pelo mesmo pacote, então em geral estão sincronizados — mas não durante uma atualização parcial, nem quando o usuário tem duas versões instaladas.
2. **Plugin ↔ dados gravados no projeto do usuário.** A partir do CHMS-009 o plugin escreve metadata em comentário de layer. Um `.aep` salvo hoje é aberto daqui a dois anos por uma versão que não existe ainda.
3. **Plugin ↔ arquivos temporários.** O CHMS-004 vai passar payloads grandes por arquivo temporário com checksum. Um arquivo órfão de uma sessão anterior pode ser lido por uma versão diferente.

Sem uma regra escrita, cada uma dessas fronteiras vira uma decisão improvisada no momento em que quebra.

## Decisão

`PROTOCOL_VERSION` é o único número que governa o envelope de comandos. Hoje vale `1`.

### O que **não** faz a versão subir

Acréscimo de campo **opcional**, em qualquer ponto do envelope. Um consumidor antigo simplesmente não lê o campo novo, e um consumidor novo trata a ausência como `undefined`, que é exatamente o que o tipo já diz.

Acréscimo de **código de erro** novo em `ERROR_CODES`. Consumidores antigos caem no tratamento genérico, que já existe e já é obrigatório: nenhum consumidor pode assumir que conhece todos os códigos.

Acréscimo de **aviso** (`CommandWarning`) novo. `warnings` já é sempre um array, e código que itera sobre ele não quebra com um item desconhecido.

### O que faz a versão subir

Remoção de campo. Mudança de tipo de campo existente. Mudança de significado de um campo mantendo o nome — este é o pior caso, porque não quebra nada visivelmente e produz comportamento errado em silêncio.

Uma subida de versão exige, no mesmo pull request: a entrada correspondente em `packages/contracts/CHANGELOG.md`, o caminho de migração, e o teste que prova que um pedido da versão antiga é **recusado** e não interpretado errado.

### Recusa, e não tentativa de adivinhação

Um `CommandRequest` cuja `protocolVersion` não é a esperada é recusado com `INTERNAL_ERROR`, trazendo em `details` o que era esperado e o que chegou. **O handler não é invocado.**

A alternativa — tentar interpretar da melhor forma possível — é o que produz corrupção silenciosa de projeto. Um envelope de outra versão que "quase" encaixa é o pior resultado possível: parece ter funcionado, e o dano só aparece depois.

`isCommandResponse()` implementa essa regra do lado do painel, e o teste `isCommandResponse recusa envelope de outra versão de protocolo` a fixa.

## Consequências

`ERROR_CODES` é lista fechada em nível de tipo, e `CommandFailure.code` é `ErrorCode` e não `string`. Isso é mais apertado do que o texto da §8. O ganho: um comando não consegue mais inventar um código no momento em que falha — que é justamente quando a pressa costuma vencer a disciplina — e acrescentar um código passa a arrastar, por construção, o `ERROR_META` (`Record<ErrorCode, …>` não compila incompleto), o módulo ES5 gerado, e as duas traduções.

`CommandFailure.action` é chave i18n, não frase. A §8 exige ação corretiva no erro e a §22.3 exige pt-BR e en-US desde o início; guardar a frase pronta no envelope tornaria todo erro monolíngue e amarraria texto de interface a uma constante de protocolo.

O contrato existe **duas vezes**: em TypeScript, para o painel, e num módulo ES5 gerado, para o ExtendScript — que não importa TypeScript e não tem sistema de módulos. Duas cópias de uma lista de 22 itens divergem; não "podem divergir". Por isso a segunda cópia é **gerada**, nunca escrita à mão, e `packages/contracts/tests/generated-drift.test.mjs` falha se o arquivo gerado sair de sincronia com o fonte.

### Validação por JSON Schema fica para o CHMS-004

A §7 prevê JSON Schema com Ajv para os contratos. Não entrou aqui porque **nada valida pedido ainda**: o validador só passa a ter consumidor quando o dispatcher existir. Schema e validador gerados sem nenhum ponto de chamada seriam código que o `npm run check` carrega mas não exercita.

Quando entrar, há uma restrição já conhecida: a §24 proíbe `allowCodeGenerationFromStrings`, e o compilador padrão do Ajv usa `new Function`. O UXP e uma CSP estrita no CEP rejeitariam isso. A única forma compatível é **codegen standalone em tempo de build**, emitindo funções puras que o runtime apenas importa.

## Alternativas descartadas

**Versionar por comando, e não por envelope.** Daria granularidade fina, ao custo de 50+ números de versão para manter coerentes entre si. O envelope é o que atravessa a fronteira; os comandos evoluem por schema de argumentos, que é assunto do descriptor.

**Negociar versão no handshake.** Faz sentido quando cliente e servidor são distribuídos separadamente. Aqui painel e host vêm no mesmo pacote instalado; a divergência é a exceção, e recusar com erro claro é melhor do que manter dois caminhos de código vivos para uma situação que quase nunca ocorre.
