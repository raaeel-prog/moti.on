# Convert Audio to Keyframes por script

**Question:** o plugin pode disparar `Keyframe Assistant → Convert Audio to Keyframes` sozinho, em vez de pedir que o usuário o rode à mão?

**Decision date:** 2026-09-05

**Target host/version:** After Effects, CEP/ExtendScript. Sem piso de versão: `findMenuCommandId` e `executeCommand` existem desde o CS6.

**Status:** `partial` — o mecanismo é documentado e funciona, mas depende do idioma da interface e não tem confirmação da própria Adobe sobre o nome do item de menu em cada tradução.

---

## Evidence table

| Claim | Exact symbol or policy | Minimum version | Primary source | Notes |
|---|---|---|---|---|
| Um item de menu pode ser disparado por script | `app.executeCommand(id)` | CS6 | [AE Scripting Guide — Application](https://ae-scripting.docsforadobe.dev/general/application/) | Não devolve nada. Não há como perguntar se funcionou. |
| O id vem do nome do menu | `app.findMenuCommandId(command)` | CS6 | mesma | O parâmetro é *"The text of the menu command, exactly as it is shown in the UI."* |
| O método depende do idioma | — | — | mesma | Texto literal da referência: *"this method is not reliable across different language packages of AE, so you'll likely want to find the command ID number during development and then call it directly using the number in production."* |
| **Devolve `0` quando não encontra** | — | — | [Hyper Brew — After Effects Command IDs](https://hyperbrew.co/blog/after-effects-command-ids/) | É o único sinal confiável disponível, e por isso é o guarda deste projeto. |
| Ids numéricos **não** são estáveis | — | — | [Adobe Community](https://community.adobe.com/t5/after-effects-discussions/i-need-your-help-to-get-a-specific-menu-command-id-in-various-ae-versions/td-p/8702554) | Relatos de que o id de *Convert Audio to Keyframes* muda inclusive entre versões menores. |
| Nome do menu em pt-BR | Assistente de quadro-chave → *Converter Áudio em Quadros-chave* | — | [Adobe Help pt-BR](https://helpx.adobe.com/br/after-effects/using/setting-selecting-deleting-keyframes.html) | Fonte da Adobe, mas de página de ajuda, não da referência de scripting. |
| O assistente exige a camada de áudio selecionada | — | — | comunidade | Requisito operacional; nenhuma fonte da Adobe o formaliza. |
| A saída é uma camada nula com Slider Controls | "Audio Amplitude" / "Amplitude de Áudio" | — | ver `after-effects-audio-amplitude.md` | Detecção estrutural já existente no projeto. |

---

## Implementation decision

`apps/after-effects-cep/host/src/menu-command.jsx`:

1. `resolver(candidatos)` tenta os nomes na ordem (pt-BR primeiro, depois en-US) e devolve o **primeiro id não-zero**. Se nenhum resolver, devolve `null`.
2. **Nenhum id numérico é cravado, em nenhuma circunstância.** É a decisão central, e o motivo é de segurança e não de estilo: um id que mudou de versão *não falha* — ele executa **outro comando de menu qualquer**, seja qual for o que ficou naquele número, dentro do projeto do usuário. Nenhuma conveniência paga esse risco.
3. `executarComSelecao` guarda a seleção, isola a camada alvo, executa, e **restaura a seleção num `finally`**. Não é cortesia: o Beat escreve nas propriedades que o usuário selecionou, e sem a restauração o comando destruiria a própria entrada.
4. Quem chama **verifica por observação** se o comando produziu o efeito esperado, em vez de assumir que sim.

Isto cumpre as quatro exigências que o `MASTER_BUILD_SPEC.md:872` já impõe à conversão vetorial: id validado por versão/idioma, seleção restaurada, e bloqueio antes de alterar o projeto quando o comando não puder ser resolvido com segurança.

## Fallback

Recusa com frase acionável, ensinando o caminho manual — que é exatamente o comportamento que `ae.audio.beat` tinha antes. Nada se perde num After Effects cujo idioma a lista não cobre.

## Capability flag

```json
{
  "ae.menu.convertAudioToKeyframes": {
    "status": "partial",
    "probe": "MotionMenuCommand.resolver(['Converter Áudio em Quadros-chave', 'Convert Audio to Keyframes']) !== null",
    "fallback": "recusar com instrução manual"
  }
}
```

A sonda é executada em tempo real, no preflight — e não derivada da versão do host, porque a versão não diz nada sobre o idioma instalado.

## Tests needed

Cobertos em `apps/after-effects-cep/tests/audio-beat.test.mjs`:

- nenhum nome resolve → bloqueia sem disparar id nenhum e sem tocar no projeto;
- nome em português resolve num AE traduzido;
- o assistente é disparado com a camada de áudio **sozinha** na seleção;
- a seleção original volta depois;
- o assistente roda e **não produz nada** → não vira sucesso;
- amplitude já existente → o assistente não roda de novo;
- várias camadas de áudio sem seleção → recusa em vez de adivinhar;
- falha depois de converter → remove a camada criada, e **só** a criada.

Oito mutações foram injetadas nessas guardas e todas foram detectadas.

## Open uncertainty

- **Os nomes localizados não têm fonte na referência de scripting da Adobe.** O de pt-BR vem da página de ajuda em português; a lista não cobre nenhum outro idioma. Um AE em espanhol ou japonês cai no fallback — que é seguro, mas é uma limitação real.
- **Grupo de Undo:** não se sabe se `executeCommand` abre um grupo próprio dentro do grupo que o dispatcher já abriu. `ai-to-vector.jsx:43-45` afirma que o After Effects não aninha; `docs/research/ai-to-vector.md:28` afirma que `executeCommand` frequentemente cria o próprio grupo. **Ninguém mediu.** Se abrir, um Ctrl+Z pode desfazer só metade da operação. Registrado em `HOST_LIMITATIONS.md`.
- **Nada disto foi executado em After Effects real.** Todos os testes usam doubles; o `findMenuCommandId` do teste é uma função que este repositório escreveu.

## Fontes

- Adobe — After Effects Scripting Guide, Application: <https://ae-scripting.docsforadobe.dev/general/application/>
- Adobe Help (pt-BR) — Definir, selecionar e excluir quadros-chave: <https://helpx.adobe.com/br/after-effects/using/setting-selecting-deleting-keyframes.html>
- Adobe Community — menu command IDs entre versões: <https://community.adobe.com/t5/after-effects-discussions/i-need-your-help-to-get-a-specific-menu-command-id-in-various-ae-versions/td-p/8702554>
- Hyper Brew — After Effects Command IDs: <https://hyperbrew.co/blog/after-effects-command-ids/>
