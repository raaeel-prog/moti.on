# Premiere UXP — sondas de MOGRT, transcript e caption tracks

- **Pergunta:** quais símbolos documentados podem sustentar as capabilities de
  inserção de MOGRT, transcript e leitura de caption tracks sem inferir suporte
  apenas pela versão do Premiere Pro?
- **Data da verificação:** 2026-08-25.
- **Escopo:** API UXP pública do Premiere Pro; nenhuma QE DOM ou automação de UI.

## Evidência oficial

- [`SequenceEditor`](https://developer.adobe.com/premiere-pro/uxp/ppro_reference/classes/sequenceeditor/)
  documenta `SequenceEditor.getEditor(sequenceObject)` e, na instância,
  `insertMogrtFromPath(...)` e `insertMogrtFromLibrary(...)`, desde 25.6.
- [`Transcript`](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/transcript)
  documenta os métodos estáticos `exportToJSON`, `importFromJSON`,
  `createImportTextSegmentsAction` e `querySupportedLanguages`; os três primeiros
  existem desde 25.6 e a consulta de idiomas desde 26.3.
- [`Sequence`](https://developer.adobe.com/premiere-pro/uxp/ppro_reference/classes/sequence)
  documenta `getCaptionTrackCount()` e `getCaptionTrack(index)` desde 25.6.

## Decisão

- `canInsertMogrt` exige a factory `SequenceEditor.getEditor` e ao menos um dos
  métodos de inserção na instância obtida para a sequência ativa.
- Sem sequência ativa, a presença da factory não basta para afirmar suporte na
  instância: o resultado é `unknown`.
- `canReadTranscript` sonda `Transcript.exportToJSON`.
- `canImportTranscript` exige `Transcript.importFromJSON` e
  `Transcript.createImportTextSegmentsAction`.
- `canQueryTranscriptLanguages` sonda `Transcript.querySupportedLanguages`.
- `canReadCaptionTracks` exige os dois métodos documentados na sequência ativa;
  sem sequência, o resultado é `unknown`.
- A versão apenas rotula o tier. Cada capability continua liberada ou bloqueada
  pela presença real do símbolo correspondente.

## Fallback seguro

Getter ou factory que lança resulta em `unknown`. Símbolo medido e ausente
resulta em `false`. O código não tenta QE DOM, menu command nem um nome de classe
presumido para converter ausência de evidência em suporte.

## Evidência exigida

- Teste do adapter com todos os símbolos presentes.
- Testes de ausência de sequência, ausência de símbolos e getter que lança.
- System Check dentro de uma instalação real do Premiere Pro para confirmar os
  objetos expostos naquele runtime.

## Incerteza restante

Os símbolos e suas versões estão confirmados na referência oficial. O build
atual ainda precisa ser carregado no host real; até isso ocorrer, o status é
`IMPLEMENTED_NOT_HOST_VERIFIED`.
