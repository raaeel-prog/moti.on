# Glow nativo e stroke de texto para `ae.style.neon`

**Question:** Como aplicar o neon do §13 (`ae.style.neon`) com efeitos nativos e
stroke editável — quais são os símbolos exatos, e quais deles têm fonte
primária?

**Decision date:** 2026-09-04

**Target host/version:** After Effects, CEP/ExtendScript. Nenhuma das APIs abaixo
aparece com versão mínima anotada na referência; todas são anteriores às versões
que este produto suporta.

**Status:** `partial` — o stroke de texto está documentado e é seguro; o efeito
Glow está documentado só no nível do efeito, e **os parâmetros dele não têm
documentação primária nenhuma**.

## Evidence table

| Claim | Símbolo exato | Fonte | Notas |
|---|---|---|---|
| Texto ganha stroke sem rasterizar | `TextDocument.applyStroke` (Boolean, r/w) | After Effects Scripting Guide — TextDocument | Atende ao "não rasterizar texto sem opção explícita" do §13. |
| Cor do stroke | `TextDocument.strokeColor` (`[r,g,b]` float, r/w) | idem | **Escrever aqui já liga `applyStroke`** nos caracteres afetados. |
| Espessura do stroke | `TextDocument.strokeWidth` (float, 0–1000, r/w) | idem | A faixa 0–1000 é o limite documentado e vira a validação do comando. |
| Stroke por cima do fill | `TextDocument.strokeOverFill` (Boolean, r/w) | idem | Neon quer o núcleo visível: `false` mantém o fill por cima. |
| Cor do núcleo | `TextDocument.fillColor` (`[r,g,b]` float, r/w) | idem | Escrever aqui liga `applyFill`, mesma regra do stroke. |
| Efeito Glow | `ADBE Glo2` | After Effects Scripting Guide — First-Party Effect Match Names | Nome de exibição "Glow". |
| **Parâmetros do Glow** | — | **nenhuma** | Ver abaixo. |

### O buraco: parâmetros de efeito não são documentados

A página de match names de efeitos da referência lista **apenas o matchName do
efeito e o nome de exibição**. Nenhum parâmetro — nem Glow Radius, nem Glow
Intensity, nem Color A — aparece em documentação primária. Uma busca pelas
strings literais `"ADBE Glo2-0002"` e `"ADBE Glo2-0003"` não retorna nenhuma
fonte: a convenção `ADBE <efeito>-000N` é folclore de comunidade que costuma
valer na prática, e não um contrato publicado pela Adobe.

Isso não é um detalhe acadêmico. O §11 desta spec proíbe depender de nome de
exibição, porque ele muda com o idioma do aplicativo — então "achar pelo nome
Glow Radius" também está fora. Sobra escrever num matchName adivinhado.

**Consequência de projeto:** o comando **não escreve em parâmetro adivinhado sem
conferir**. Ele resolve cada parâmetro varrendo os filhos do efeito e comparando
`matchName`, e quando não acha, recusa com `CAPABILITY_UNAVAILABLE` dizendo qual
parâmetro faltou. O modo de falha vira "esta instalação não expõe o parâmetro X"
— visível e diagnosticável — em vez de "o neon saiu sem brilho e ninguém sabe
por quê".

Vale registrar que `effect-echo.jsx`, `effect-wave.jsx`, `effect-tile.jsx` e
`effect-glitch.jsx` já hardcodam parâmetros nesse mesmo padrão sem essa guarda.
Eles funcionam nas instalações testadas; a dívida fica anotada aqui e não foi
mexida junto, para a mudança do neon não arrastar quatro comandos já validados.

## Implementation decision

1. **Stroke e núcleo pelo `TextDocument`** em camada de texto: `fillColor` =
   cor do núcleo, `strokeColor` = cor do stroke, `strokeWidth`, e
   `strokeOverFill = false`. O texto continua editável, que é o critério de
   aceite do §13 ("alterar o texto original atualiza o neon").
2. **`sourceText` é reatribuído**, e não mutado no lugar: a referência não
   promete que mutar o `TextDocument` devolvido propague, e os exemplos dela
   reatribuem. Ler, alterar, escrever de volta.
3. **Glow por `ADBE Glo2`**, adicionado como efeito gerenciado via
   `MotionEffects` (prefixo de rig, snapshot/restore, recusa quando já existe um
   Glow do usuário).
4. **Parâmetros do Glow resolvidos por varredura com guarda**, nunca por escrita
   cega.

## Fallback

- Camada sem texto (shape, footage com alpha): o stroke por `TextDocument` não
  existe. O comando aplica só o Glow e devolve `warning` dizendo que o núcleo e
  o stroke não foram aplicados naquela camada — em vez de recusar a operação
  inteira ou fingir que aplicou.
- Glow ausente da instalação: `CAPABILITY_UNAVAILABLE`, como `effect-wave` faz
  com o Wave Warp.

## Capability flag

```json
{
  "ae.effect.glow": {
    "status": "supported",
    "probe": "parade.canAddProperty('ADBE Glo2')",
    "fallback": "recusar com CAPABILITY_UNAVAILABLE"
  },
  "ae.effect.glow.params": {
    "status": "unproven",
    "probe": "varredura dos filhos do efeito por matchName, com recusa quando ausente",
    "fallback": "CAPABILITY_UNAVAILABLE nomeando o parametro que faltou"
  }
}
```

## Tests needed

- stroke e fill escritos via reatribuição de `sourceText`, e não por mutação;
- `strokeWidth` fora de 0–1000 recusado no preflight;
- camada sem texto recebe Glow e o aviso, sem falhar;
- parâmetro de Glow ausente vira `CAPABILITY_UNAVAILABLE` nomeando o parâmetro;
- Glow de usuário já presente na camada vira `TRACK_CONFLICT`.

## Open uncertainty

- Os matchNames de parâmetro do Glow **não foram verificados em After Effects
  real** por este agente. A guarda de varredura existe exatamente porque eles são
  um palpite; o comando está marcado `IMPLEMENTED_NOT_HOST_VERIFIED` até alguém
  rodar `/testing-adobe-hosts`.
- `strokeWidth` é documentado como 0–1000, mas a unidade (pixels da camada) não é
  afirmada pela referência.

## Fontes

- [TextDocument — After Effects Scripting Guide](https://ae-scripting.docsforadobe.dev/text/textdocument/)
- [First-Party Effect Match Names — After Effects Scripting Guide](https://ae-scripting.docsforadobe.dev/matchnames/effects/firstparty/)
