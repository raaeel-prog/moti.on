# Instalação e verificação nos hosts

> Este documento é o **entregável 9 da §39** do master spec. Ele existe para uma finalidade específica: fechar os itens de [`HOST_LIMITATIONS.md`](HOST_LIMITATIONS.md) que nenhum teste automatizado consegue responder.
>
> `npm run check` verde prova que a lógica está correta e que os contratos batem entre si. **Não prova que o painel carrega, que o Undo agrupa, nem que os bytes atravessam o `evalScript` intactos.** Só o aplicativo real responde isso.

## 1. Gerar os artefatos

Na raiz do projeto:

```bash
npm ci
```

```bash
npm run check
```

A saída fica em `dist/`. `npm run check` roda lint, typecheck, build, validação, testes e a validação do pacote de skills, nessa ordem.

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
| O painel abre | Nome do projeto, sequência ativa, contagem de sequências e de trilhas | Carregamento do painel |
| **Atualizar contexto** | Os campos recarregam; o log mostra a duração em ms | Ponte painel↔adapter |
| **Executar autoteste** | Três linhas com `✓`: `module.premierepro`, `project.active`, `project.transactionApi` | Presença da API de transação por símbolo |
| **Verificar sistema** | Tier de suporte e uma linha por capacidade, cada ausência com motivo | Sonda de capacidades |

Se `project.transactionApi` aparecer com `✕`, a instalação é anterior a 25.6 ou o módulo não expôs os símbolos. A mensagem diz qual dos dois.

### O que anotar para fechar `HOST_LIMITATIONS.md`

- O painel **carregou** sem erro? (item 8 — aceitação de `requiredPermissions`)
- O UXP reclamou de alguma permissão ao carregar?
- Se o log mostrar `hostVersion: unknown`, é o esperado hoje — a forma documentada de obter a versão no UXP ainda não foi confirmada (item 7).

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

**3. Clique em "Verificar sistema".**

Mostra o tier de suporte, o motor de expressões e uma linha por capacidade.

Anote o valor de **motor de expressões**. Se aparecer `unknown`, a string que o After Effects devolve não é nenhuma das reconhecidas, e o valor real precisa ser registrado (item 6).

Se `canWriteFiles` aparecer como `?` com o motivo `couldNotReadHostPreference`, a chave de preferência que o código tenta ler não existe com aquele nome — o que já é a suspeita registrada. Anote (item 3).

**4. Clique em "Criar composição de teste".**

Deve criar uma composição `Moti.on Demo`, 1920 × 1080, 5 segundos, 30 fps, com um texto centralizado.

**5. Aperte Ctrl+Z (Cmd+Z) uma única vez.**

A composição inteira — comp, camada de texto, posição e formatação — deve desaparecer de uma vez. Se forem necessários dois ou mais Ctrl+Z, o agrupamento de Undo não está funcionando e o item 4 **não** fecha.

**6. Confira o menu `Edit > Undo` antes de desfazer.**

O rótulo deve estar no idioma da sua instalação: *"Moti.on: criar composição de teste"* em português, *"Moti.on: create test composition"* em inglês. Se aparecer em inglês numa instalação em português, o `appUILocale` do CEP veio num formato que o código não reconhece — anote o comportamento (item 9).

---

## 4. Depois de verificar

Atualize [`HOST_LIMITATIONS.md`](HOST_LIMITATIONS.md) com o que foi observado. Um item só sai da lista quando alguém executou o passo e viu o resultado — não quando o código "parece certo".

O vocabulário de status é o de `AGENT_SKILLS_GUIDE.md`. Um recurso que passou aqui vira `IMPLEMENTED_AND_VERIFIED`, **na plataforma em que foi testado**: passar no Windows não fecha o macOS.

---

## 5. Produção

O modo de desenvolvimento aceita extensão não assinada. Nada abaixo está implementado — é a lista do que falta, e o empacotamento é o CHMS-049.

- empacotar o Premiere como `.ccx` pelo fluxo UXP;
- assinar e empacotar o After Effects como `.zxp`;
- testar os instaladores em Windows e macOS **limpos**, sem o ambiente de desenvolvimento;
- testar instalação, atualização e desinstalação.

Os identificadores definitivos já são `com.motion.plugin.premiere` e `com.motion.plugin.ae.panel`, e `npm run validate` falha se um placeholder voltar. As permissões declaradas são o mínimo — só `localFileSystem: "request"` —, e a validação recusa qualquer permissão que não esteja justificada por uma issue.
