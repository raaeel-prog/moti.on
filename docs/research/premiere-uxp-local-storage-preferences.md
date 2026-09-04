# Premiere UXP — armazenamento da preferência de movimento

Verificado em: 2026-09-02

## Pergunta

O painel Premiere UXP pode persistir uma preferência simples de interface sem
inventar uma API Adobe?

## Evidência oficial

A referência JavaScript do Premiere UXP documenta `window.localStorage` como
armazenamento persistente, apropriado para preferências. Ela também alerta que
o conteúdo é reconstruível e não deve guardar segredos:

- https://developer.adobe.com/premiere-pro/uxp/uxp-api/reference-js/global-members/data-storage/local-storage

## Decisão

`@motion/ui-motion` usa `localStorage` apenas para o booleano
`motion.ui.reduceMotion.v1`. O acesso é feature-detected e protegido por
`try/catch`; ausência ou bloqueio rebaixa a persistência para indisponível, mas
não impede o painel nem altera a preferência durante a sessão. `matchMedia`
também é opcional, e a preferência efetiva permanece `interno OR sistema`.

## Verificação pendente

A documentação confirma a superfície da API, não seu comportamento neste
bundle. Persistência após fechar/reabrir Premiere e propagação da media query
permanecem `NOT RUN` em host real.
