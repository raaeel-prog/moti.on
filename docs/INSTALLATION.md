# Instalação e teste

## 1. Gerar os artefatos

Na raiz do projeto:

```bash
npm run check
```

A saída ficará em `dist/`.

## 2. Premiere Pro UXP

Pré-requisitos:

- Premiere Pro 25.6 ou posterior;
- UXP Developer Tool 2.2 ou posterior;
- Developer Mode ativado nas preferências de Plugins do Premiere.

Procedimento:

1. Abra o Premiere Pro.
2. Abra o UXP Developer Tool.
3. Clique em **Add Plugin**.
4. Selecione `dist/premiere-uxp/manifest.json`.
5. Clique em **Load & Watch**.
6. No Premiere, abra `Window > UXP Plugins > CrossHost Toolkit`.

Teste esperado:

- o painel informa o projeto e a sequência ativa;
- o botão **Atualizar contexto** refaz a leitura;
- o botão **Executar autoteste** valida o acesso ao runtime e às sequências.

## 3. After Effects CEP — Windows

Execute no PowerShell:

```powershell
npm run build
.\scripts\install-ae-dev.ps1 -EnableDebugMode
```

Reinicie o After Effects e abra o painel **CrossHost Toolkit** no menu de extensões.

## 4. After Effects CEP — macOS

```bash
npm run build
./scripts/install-ae-dev.sh --enable-debug
```

Reinicie o After Effects e abra o painel **CrossHost Toolkit** no menu de extensões.

Teste esperado:

- o painel informa projeto, item ativo e composição ativa;
- **Criar composição de teste** gera uma composição 1920 × 1080, 5 segundos, 30 fps, com um texto central;
- a operação pode ser desfeita em um único passo.

## 5. Produção

O modo de desenvolvimento aceita extensão não assinada. Para distribuição real:

- empacote o Premiere como `.ccx` pelo fluxo UXP;
- assine e empacote o After Effects como `.zxp`;
- substitua todos os IDs `com.example...` por IDs próprios e permanentes;
- teste os instaladores em Windows e macOS limpos.
