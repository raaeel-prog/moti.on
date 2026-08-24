# Guia de Skills dos Agentes — CrossHost

## Propósito

`docs/MASTER_BUILD_SPEC.md` define **o produto**. As skills definem **como os agentes devem trabalhar** para implementá-lo com consistência, design controlado, segurança e evidência.

A cópia canônica fica em `.agents/skills/`. A pasta `.claude/skills/` é um espelho. Não edite as duas manualmente.

```bash
npm run skills:sync
npm run check
```

## Matriz de ativação

| Trabalho solicitado | Skills obrigatórias | Skills condicionais |
|---|---|---|
| Planejamento end-to-end ou mudança multi-pacote | `orchestrating-crosshost-work` | todas as especializadas necessárias |
| API, versão, método, permission ou provider incerto | `researching-adobe-capabilities` | skill do host/domínio |
| Layout, UI, visual ou componente | `designing-adobe-workstation-ui`, `building-crosshost-panel-ui` | `testing-adobe-hosts` |
| Feature After Effects | `developing-after-effects-cep`, `testing-adobe-hosts` | `engineering-motion-rigs`, segurança/performance |
| Feature Premiere | `developing-premiere-uxp`, `testing-adobe-hosts` | pesquisa, segurança/performance |
| Anchor, easing, keyframes, parallax, cameras, shapes | `engineering-motion-rigs`, skill do host | UI, performance |
| Assets, busca, backend, banco, providers | `integrating-asset-services`, `securing-crosshost-plugins` | host, performance, pesquisa |
| Captions, transcrição, estilos, auto-SFX | `building-ai-captions-sfx`, skill do host | native, segurança, performance |
| whisper.cpp, C++, `.uxpaddon`, áudio/ML | `engineering-native-media-core` | Premiere/AE, segurança, performance, release |
| Auditoria antes de concluir | `testing-adobe-hosts` | segurança/performance |
| Empacotamento/publicação | `releasing-adobe-extensions`, `testing-adobe-hosts` | segurança, native |

Carregue o menor conjunto que cobre completamente a tarefa. Muitas skills simultâneas diluem prioridade e aumentam conflitos.

## Sequência operacional

1. Ler `AGENTS.md`, a seção relevante da especificação e o código atual.
2. Ativar `orchestrating-crosshost-work` para tarefas não triviais.
3. Ativar as skills específicas da matriz.
4. Pesquisar qualquer capacidade instável antes de escrever o caminho de host.
5. Definir uma fatia vertical: schema → UI → adapter → host → testes → docs.
6. Fazer preflight antes de qualquer mutação.
7. Preservar Undo/transaction, seleção, tempo e editabilidade conforme contrato.
8. Executar checks automáticos.
9. Obter evidência no host real quando necessário.
10. Entregar relatório com implementado, arquivos, comandos, resultados, limitações e compatibilidade.

## Prompts recomendados

### Interface minimalista

```text
Use $orchestrating-crosshost-work, $designing-adobe-workstation-ui,
$building-crosshost-panel-ui e $testing-adobe-hosts.
Implemente a tela [FEATURE] com base #1D1D1D, uma tarefa dominante,
property rows compactas e progressive disclosure. Não crie dashboard geral.
Entregue screenshots em 280, 360, 480 e 720 px e registre a auditoria visual.
```

### Feature do After Effects

```text
Use $orchestrating-crosshost-work, $researching-adobe-capabilities,
$developing-after-effects-cep, $engineering-motion-rigs e
$testing-adobe-hosts. Implemente [COMMAND_ID] com schema, UI, dispatcher,
ExtendScript compatível, preflight, Undo único, metadata idempotente,
Apply/Adjust/Bake/Remove quando aplicável, testes e fixture real.
```

### Feature do Premiere

```text
Use $orchestrating-crosshost-work, $researching-adobe-capabilities,
$developing-premiere-uxp e $testing-adobe-hosts. Verifique a API oficial
da versão alvo, implemente capability detection, operações async,
locked access/transaction documentada, erros estruturados e teste real.
Não use QE nem automação privada de interface.
```

### Legendas offline e SFX

```text
Use $building-ai-captions-sfx, $engineering-native-media-core,
$developing-premiere-uxp, $developing-after-effects-cep,
$securing-crosshost-plugins, $optimizing-crosshost-performance e
$testing-adobe-hosts. Implemente somente a etapa [ETAPA], mantendo mídia
local por padrão, modelo verificado por hash, progresso, cancelamento,
timing por frame, saída editável e SFX com licença/proveniência.
```

### Verificação final

```text
Use $testing-adobe-hosts e $releasing-adobe-extensions.
Execute todos os gates aplicáveis. Registre host, versão, OS, fixture,
Undo/transaction, performance, instalação e package. Marque como NOT RUN
tudo que não foi executado; não substitua evidência real por mocks.
```

## Status permitido

Use somente:

- `IMPLEMENTED_AND_VERIFIED`
- `IMPLEMENTED_NOT_HOST_VERIFIED`
- `PARTIAL`
- `BLOCKED_BY_CAPABILITY`
- `BLOCKED_BY_PRODUCT_DECISION`
- `NOT_IMPLEMENTED`

Nunca usar “100% funcional” sem a matriz real e o gate de release aprovados.
