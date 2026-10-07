# Parallax — camadas bloqueadas e profundidade

Correção baseada no diagnóstico da composição Agenda Setembro - Matheus do Acordeon e nas instruções de 13/09/2026.

- Camadas 2D não selecionadas, inclusive Color e LUZ bloqueadas e intercaladas, não impedem a criação. Permanecem no mesmo lugar, com os mesmos switches e sem integrar o rig.
- Precomps planas com Recolher transformações são aceitas. Nas participantes, esse switch é desligado durante a conversão para 3D. O estado anterior fica na metadata para restauração. Precomps recolhidas que contêm uma cena 3D interna ainda exigem preparação.
- Novas câmeras têm Zoom 3000. A distribuição automática ocupa 2500 unidades entre o primeiro plano e o fundo. Para oito camadas, o intervalo é aproximadamente 357,14. A referência de rigs já existentes não é trocada automaticamente pelo clique rápido, para preservar movimentos e edições.
- As expressões compensam Scale e Position X/Y. Profundidade de campo e wiggle não são ativados na criação.
- Mensagens de preflight novas foram incluídas na lista de mensagens visíveis, evitando o erro genérico que escondia o bloqueio.

## Evidência

`npm run check`: PASS, 1.187 testes. Cenários novos verificam overlays bloqueados intercalados, conversão de precomps recolhidas e restauração do switch original.

After Effects 26.5x89: sete testes PASS com Zoom 3000 e profundidade 2500. Cantos/âncoras preservados com erro menor que 0,000001 pixel, movimento relativo pelo null, compensação de Z, remoção e ajustes. Arquivo: `artifacts/native/parallax-depth-results.json`.

Cópia real da composição do usuário: oito participantes em 3D, Recolher transformações desligado; Color e LUZ mantidas bloqueadas, em 2D, na posição [540,960,0] e com os switches originais. Zoom 3000, profundidades de -2500 até 0. A cópia com sufixo “— QA Moti.on” ficou aberta com Z do null em 332 para demonstrar o movimento. Evidência: `artifacts/native/parallax-user-depth-final.json`.

A tentativa de render comparativo TIFF gerou arquivos vazios e não constitui prova de igualdade de pixels. A verificação cobre geometria projetada, propriedades nativas e inspeção visual; comparação completa do render e reabertura do projeto: NOT RUN.

Instalado com backup em `artifacts/install-backups/ae-20260913-125034/previous`. Fonte trabalhada: `implementation`. Nenhuma mudança no design ou no espaçamento nesta rodada.
