# Instalação e verificação nos hosts

> Este documento é o **entregável 9 da §39** do master spec. Ele existe para uma finalidade específica: fechar os itens de [`HOST_LIMITATIONS.md`](HOST_LIMITATIONS.md) que nenhum teste automatizado consegue responder.
>
> `npm run check` com `PASS` comprova somente os checks automatizados daquele worktree. **Não prova que o painel carrega, que o Undo agrupa, que o picker grava, nem que os bytes atravessam o `evalScript` intactos.** Só o aplicativo real responde isso.

Registre cada passo com um destes resultados, sem sinônimos ambíguos:

- `PASS`: o passo foi executado neste build, na plataforma/versão anotada, e produziu o resultado esperado;
- `FAIL`: o passo foi executado e divergiu do resultado esperado;
- `NOT RUN`: o passo não foi executado neste build. Pesquisa oficial, typecheck e teste com double continuam sendo `NOT RUN` para o gate de host.

Em **2026-08-25**, o gate final integrado concluiu `npm.cmd run check` com `PASS`: lint, typecheck, build, validate, **326/326 testes** e skills validate. O roteiro do After Effects foi executado parcialmente neste build e seus resultados aparecem abaixo. Premiere Pro e revisão visual no browser continuam `NOT RUN`.

## 1. Gerar os artefatos

Na raiz do projeto:

```bash
npm ci
```

```bash
npm run check
```

A saída fica em `dist/`. `npm run check` roda lint, typecheck, build, validação, testes e a validação do pacote de skills, nessa ordem.

O `PASS` automatizado registrado acima pode ser reproduzido antes da instalação, mas não fecha nenhum passo de host deste roteiro.

---

## 2. Premiere Pro — UXP

**Pré-requisitos:** Premiere Pro 25.6+, UXP Developer Tool 2.2+, Developer Mode ligado nas preferências de Plugins do Premiere.

1. Abra o Premiere Pro.
2. Abra o UXP Developer Tool.
3. **Add Plugin** → selecione `dist/premiere-uxp/manifest.json`.
4. **Load & Watch**.
5. No Premiere: `Window > UXP Plugins > Moti.on`.

### O que verificar

| Ação | Resultado esperado | Fecha |
|---|---|---|
| O painel abre | Versão real do host (ou `unknown`/`Não verificado` se ausente), nome do projeto, sequência ativa, contagem de sequências e de trilhas | Carregamento e `require("uxp").host.version`/`.uiLocale` |
| **Atualizar contexto** | Os campos recarregam; o log mostra a duração em ms | Ponte painel↔adapter |
| **Executar autoteste** | Quatro linhas aprovadas com projeto aberto: `module.premierepro`, `host.version`, `project.active`, `project.transactionApi` | Ambiente do host e API de transação por símbolo |
| **Verificar sistema** | Tier de suporte e uma linha por capacidade, cada ausência com motivo | Sonda de capacidades |
| **Exportar diagnóstico** e escolher um arquivo | Um JSON redigido é gravado uma vez no local escolhido | Picker e `File.write` documentados do UXP |
| **Exportar diagnóstico** e cancelar o picker | A interface informa cancelamento; nenhum arquivo é gravado e não aparece erro | Cancelamento sem efeito colateral |

Se `project.transactionApi` aparecer como indisponível com um projeto aberto, os símbolos `lockedAccess`/`executeTransaction` não foram encontrados naquele objeto. Não conclua a causa só pela versão; registre versão e mensagem. Sem projeto, o resultado correto é **Não verificado** e o passo deve ser repetido depois de abrir um `.prproj`.

### O que anotar para fechar `HOST_LIMITATIONS.md`

- O painel **carregou** sem erro? (item 8 — aceitação de `requiredPermissions`)
- O UXP reclamou de alguma permissão ao carregar?
- A versão exibida coincide com `Help > About Premiere Pro`? Se vier `unknown`/`Não verificado`, registre como `FAIL` para a leitura naquele runtime; não reclassifique o host como não suportado sem evidência.
- O locale escolhido pelo shell coincide com `require("uxp").host.uiLocale`?
- O JSON exportado abre, contém `pluginVersion`, `host`, `hostVersion`, contagens e entradas redigidas, e **não** contém caminho nativo, nome de projeto, sequência, arquivo escolhido, credenciais ou payload criativo?
- Cancelar o picker deixa a sessão utilizável e não cria arquivo parcial?

As APIs e a permissão mínima foram verificadas na documentação oficial e registradas em [`research/premiere-uxp-host-environment-and-diagnostics-export.md`](research/premiere-uxp-host-environment-and-diagnostics-export.md). Isso sustenta a implementação; o resultado desta tabela continua `NOT RUN` até alguém executá-la no Premiere.

As sondas de MOGRT, transcript e caption tracks e seus fallbacks `unknown` estão em [`research/premiere-uxp-capability-probes.md`](research/premiere-uxp-capability-probes.md). No System Check, confirme os estados com e sem sequência ativa; ausência de sequência não autoriza mostrar `unsupported`.

O P0 não expõe comando mutante no Premiere. Portanto, esta sessão confirma a **presença** dos símbolos de transação, mas não consegue provar execução, entrada única de Undo ou comportamento de exceção. Esses itens permanecem `NOT RUN` até existir um comando/fixture de host que use `withTransaction`; não marque `PASS` a partir do autoteste.

### UI no host

Repita nos painéis acoplados em aproximadamente 280, 360, 480 e 720 px e com escala do sistema em 100%, 125%, 150% e 200%:

1. navegue pelas abas com mouse e teclado;
2. confirme foco visível, ordem coerente e nomes acessíveis;
3. provoque loading, empty, disabled, success e error;
4. confirme que só a região de conteúdo rola e que não há overflow horizontal;
5. capture screenshot **dentro do Premiere**, anotando largura, escala, sistema e versão.

Cada combinação não executada permanece `NOT RUN`; aprovação em Windows não aprova macOS.

---

## 3. After Effects — CEP

### Windows

```powershell
npm run build
```

```powershell
.\scripts\install-ae-dev.ps1 -EnableDebugMode
```

### macOS

```bash
npm run build
```

```bash
./scripts/install-ae-dev.sh --enable-debug
```

Reinicie o After Effects e abra o painel **Moti.on** no menu de extensões.

### O que verificar, na ordem

Esta ordem importa: cada passo depende do anterior ter funcionado.

**1. O painel abre e mostra o contexto.**
Versão do host, projeto, item ativo e composição. Fecha o item 1 de `HOST_LIMITATIONS.md`, ou revela um problema de carregamento.

**2. Clique em "Verificar ponte com o host".**

Este é o passo mais importante do documento, e o menos óbvio.

O botão envia uma string contendo acento, japonês, emoji, aspas duplas e barras invertidas, e compara o que volta com o que foi enviado. Ele responde uma pergunta que nenhum teste automatizado alcança: **o canal do `evalScript` preserva os bytes nesta máquina, com esta codepage, nesta versão do After Effects?**

- *"Ponte com o host íntegra"* → fecha o item 2.
- *"O payload voltou diferente do enviado"* → existe corrupção real de transporte. **Não continue usando o plugin** e registre o resultado: significa que dados do usuário seriam corrompidos em silêncio.

Este botão exercita um payload Unicode pequeno. Ele **não** comprova pedidos acima de 60.000 caracteres. O build atual recusa esses pedidos antes do `evalScript` com `INLINE_PAYLOAD_TOO_LARGE`; transporte por arquivo temporário ainda não está implementado. Portanto, a implementação do gate de payload grande permanece `PARTIAL` e sua execução no host `NOT RUN`; não marque `PASS` por causa deste botão.

**3. Clique em "Verificar sistema".**

Mostra o tier de suporte, o motor de expressões e uma linha por capacidade.

Anote o valor de **motor de expressões**. Se aparecer `unknown`, a string que o After Effects devolve não é nenhuma das reconhecidas, e o valor real precisa ser registrado (item 6).

Se `canWriteFiles` aparecer como `?` com o motivo `couldNotReadHostPreference`, a chave de preferência que o código tenta ler não pôde ser confirmada naquele runtime. Anote o resultado; o nome usado vem de material comunitário e ainda não tem confirmação oficial.

**4. Clique em "Criar composição de teste".**

Deve criar uma composição `Moti.on Demo`, 1920 × 1080, 5 segundos, 30 fps, com um texto centralizado.

**5. Confira o menu `Edit > Undo` antes de desfazer.**

O rótulo deve estar no idioma da sua instalação: *"Moti.on: criar composição de teste"* em português, *"Moti.on: create test composition"* em inglês. Se aparecer em inglês numa instalação em português, o `appUILocale` do CEP veio num formato que o código não reconhece — anote o comportamento (item 9).

**6. Aperte Ctrl+Z (Cmd+Z) uma única vez.**

A composição inteira — comp, camada de texto, posição e formatação — deve desaparecer de uma vez. Se forem necessários dois ou mais Ctrl+Z, o agrupamento de Undo não está funcionando e o item 4 **não** fecha.

**7. Abra Diagnóstico e clique em "Exportar diagnóstico".**

No CEP, a ação copia o bundle redigido para a área de transferência. Cole num editor e confirme que o JSON é válido e não contém nomes/caminhos do projeto nem conteúdo criativo. Falha de `document.execCommand("copy")` deve aparecer como erro visível, sem limpar os logs.

**8. Repita o gate de UI no host.**

Use as mesmas larguras e escalas da seção do Premiere, incluindo navegação por teclado, foco visível, estados e screenshot dentro do After Effects. Registre cada plataforma separadamente.

### Evidência executada em 2026-08-25

Ambiente: After Effects 26.3x87, CEP 12.0.1, Windows 11, projeto descartável não salvo, build do branch `Codex`.

| Passo | Resultado | Evidência observada |
|---|---|---|
| Carregamento limpo | `PASS` após correção | `<ScriptPath>` havia produzido modal de sintaxe na linha 1; removido o elemento opcional, o painel reabriu sem modal e mostrou `Conectado` |
| Contexto | `PASS` | versão 26.3x87, projeto não salvo, nenhum item e nenhuma composição ativa retornados sem erro |
| Ponte Unicode | `PASS` | mensagem “Ponte com o host íntegra”; português, japonês, emoji, aspas e barras voltaram idênticos |
| System Check | `PASS` | tier completo; projeto, escrita, rede e motor de expressões disponíveis; capacidades não empacotadas ou exclusivas do Premiere permaneceram indisponíveis |
| Criar demo | `PASS` | `Moti.on Demo` criada com a camada de texto esperada |
| Rótulo em `Edit > Undo` | `PASS` | `Desfazer Moti.on: criar composição de teste` observado após normalizar `pt_BR` e reinstalar o build |
| Undo em um passo | `PASS` | um único Ctrl+Z removeu toda a composição de teste |
| Diagnóstico/clipboard | `NOT RUN` | não exercitado nesta sessão |
| UI compacta | `PASS` parcial | captura dentro do AE em largura próxima de 280 px, base escura, uma view dominante e sem overflow horizontal; demais larguras/DPI/teclado/leitor continuam `NOT RUN` |

O resultado é específico desse ambiente. Ele não aprova AE 25.x, macOS nem a matriz visual completa.

### Estado do CHMS-009 — metadata de rigs

O núcleo puro de metadata está implementado e teve **24/24 testes focados `PASS`**, também incluídos no check integrado. Ele cria, lê, atualiza, remove e migra o bloco `[MOTION_META_V1]`, preserva o comentário externo ao bloco e devolve planos inline/sidecar com canonicalização, base64url e SHA-256.

Este slice ainda não expõe uma ação de host nem um adapter para `Layer.comment`/filesystem. Portanto, integração com comentário real, limite em bytes do host, escrita/rename/remoção atômicos do sidecar, Undo, corrupção, migração e persistência após reabrir o `.aep` estão `NOT RUN`; não há um passo manual executável que autorize promovê-los a `PASS`. Quando essa camada existir, teste esses casos num projeto descartável e confirme também que o texto do usuário fora do bloco gerenciado permanece byte a byte idêntico.

---

## 4. Depois de verificar

Atualize [`HOST_LIMITATIONS.md`](HOST_LIMITATIONS.md) e [`VERIFICATION_GATES.md`](VERIFICATION_GATES.md) com plataforma, host, versão, data e resultado `PASS`, `FAIL` ou `NOT RUN`. Um item só sai da lista quando alguém executou o passo e viu o resultado — não quando o código "parece certo".

O vocabulário de status é o de `AGENT_SKILLS_GUIDE.md`. Um recurso que passou aqui vira `IMPLEMENTED_AND_VERIFIED`, **na plataforma em que foi testado**: passar no Windows não fecha o macOS.

---

## 5. Produção

O modo de desenvolvimento aceita extensão não assinada. Nada abaixo está implementado — é a lista do que falta, e o empacotamento é o CHMS-049.

- empacotar o Premiere como `.ccx` pelo fluxo UXP;
- assinar e empacotar o After Effects como `.zxp`;
- testar os instaladores em Windows e macOS **limpos**, sem o ambiente de desenvolvimento;
- testar instalação, atualização e desinstalação.

Os identificadores definitivos já são `com.motion.plugin.premiere` e `com.motion.plugin.ae.panel`, e `npm run validate` falha se um placeholder voltar. As permissões declaradas são o mínimo — só `localFileSystem: "request"` —, e a validação recusa qualquer permissão que não esteja justificada por uma issue.
