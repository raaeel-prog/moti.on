# Moti.on — revisão de produto e interface

## Auditoria e decisão

Baseline: `npm run check` PASS, 1.665 testes. Snapshot reversível em
`artifacts/product-ui-20260927/source-before`; esta pasta não possui Git.

O pedido de 27/09 substitui a base anterior #1D1D1D por #212529. Mantêm-se a
navegação Ferramentas/Presets, Navegar/Editar, as ferramentas e os contratos de
host. O site, novas operações Adobe e distribuição comercial não fazem parte
deste redesign dos painéis existentes.

Problemas encontrados: tokens de geometria duplicados; cores literais nas
folhas de refinamento que não acompanham o tema claro; foco de campos removido
por `!important`; opções com alvo de 16px; checkboxes desenhados como switches;
cor inválida descartada silenciosamente; estados vazios sem recuperação;
motivo de indisponibilidade ausente na dica de ferramenta; várias camadas de
estilo conflitantes e documentação histórica apresentada como atual.

## Execução

1. Consolidar tokens semânticos, cores, tipografia, geometria e foco. Manter
   aliases públicos, tema claro, densidade, preferências e motion reduzido.
2. Padronizar controles e variantes, separar layouts de refinamentos visuais,
   eliminar cores fixas dos componentes e manter feedback próximo à ação.
3. Corrigir validação, teclado, dicas, estados vazios e recuperação nas
   bibliotecas, sem alterar dispatcher, transações, rigs ou seleção.
4. Validar componentes e fluxos com testes de comportamento, capturas nas
   quatro larguras, altura reduzida, idiomas e temas; executar check completo.
5. Registrar evidência real Adobe separada da prévia. Não reiniciar sessão com
   projeto aberto para atualizar painel. Não alegar prova de host com mocks.

Critérios: texto AA, foco visível, controles acessíveis por teclado, alvos
mínimos de 24px (controles usuais 28px), sem overflow horizontal em 280px,
mensagens localizadas e correção de erro sem perder rascunho.

Referências: [WCAG — foco visível](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
e [tamanho mínimo dos alvos](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## Implementação concluída

- Base escura `#212529`, cinzas e ação principal branca; tokens semânticos,
  tema claro, densidade compacta, raios, foco e movimento centralizados, com
  aliases dos componentes mantidos. Variantes de botão e controles unificados
  sem trocar o framework.
- Entradas numéricas e cor inválidas retêm o rascunho, mostram erro junto do
  campo e não disparam alteração no host. Foco visível, alvos de controle,
  checkbox reconhecível e motivo de indisponibilidade foram ajustados.
- Ferramentas e Presets agora oferecem recuperação em estados vazios. Busca,
  filtros, favoritos, foco, rascunhos e a navegação Navegar/Editar permanecem
  estáveis; seleção desatualizada bloqueia aplicação até nova leitura, e
  respostas antigas não substituem o resultado atual. A ação destrutiva foi
  diferenciada da aplicação principal.
- A versão Premiere retira ferramentas e catálogo simulados que sugeriam
  disponibilidade inexistente; apresenta estado indisponível e acesso ao
  Contexto. O seletor de idioma respeita host, português e inglês.
- Chaves de tradução, documentação de interface e skills de design foram
  atualizadas. Dispatcher, transações, rigs e contratos de comandos Adobe não
  foram alterados por esta revisão.

## Resultado de validação

`npm run check` passou: lint, typecheck, build, validação, 88 pares de
contraste, **1.695/1.695 testes** e validação de 14 skills/31 arquivos/42
avaliações de roteamento. O log é
[`check-implementation-final.log`](../../artifacts/product-ui-20260927/check-implementation-final.log).

No navegador, os componentes de apresentação reais com dados de fixture
passaram em **24/24 verificações** e **103 layouts/escalas**. Foram cobertas
Ferramentas, Presets Navegar/Editar, Configurações e editor de fases em
280/360/480/720 px, incluindo 280 × 320 px; temas claro/escuro,
pt-BR/en-US, escalas 125/150/200% e movimento reduzido. Não houve
transbordamento horizontal nem erro de página registrado. Evidências:
[`ui-results.json`](../../artifacts/product-ui-20260927/ui-results.json),
[`browser-verify-final.log`](../../artifacts/product-ui-20260927/browser-verify-final.log)
e capturas no mesmo diretório. Essas medições são de navegador, não de Adobe.

O painel instalado carregou no **After Effects 2026 26.5.0.89/macOS**. Foram
observados Ferramentas, Presets Navegar/Editar sem composição, Configurações,
claro/escuro e pt-BR/en-US. Depois de reabrir o AE com a correção de tradução,
Editar em inglês mostrou “Open a composition.” no host. Idioma “Seguir o
After Effects” e tema Escuro foram restaurados ao fim da checagem. A execução
de Aplicar/Ajustar/Remover e Undo no build do redesign permanece `NOT RUN`
porque não havia composição ou seleção.
O build final foi reinstalado e o AE reiniciado; o painel voltou conectado em
português e tema Escuro. A tentativa posterior de criar uma composição
temporária encontrou timeouts no controle do aplicativo; nada foi salvo.

No Premiere Pro 2026 v26.5.1 (build 26.5.1.1), o UPIA instalou Moti.on 0.1.0
com `Installation Successful`; a extensão ficou `Enabled` e os UXPLogs
confirmaram esse status. Não houve `panel.started` ou `panel.shown`. Um diálogo
Adobe de erro de cobrança/atualização de pagamento bloqueou a inicialização,
e a automação de interface não recuperou o estado antes de expirar. Instalação
`PASS`; painel e comandos `NOT RUN` no host, sem inferir falha do plugin.
Nenhum projeto ou pagamento foi alterado. Veja [entrega e limites](../../artifacts/product-ui-20260927/ENTREGA.md)
e [matriz de QA](../QA_MATRIX.md).
