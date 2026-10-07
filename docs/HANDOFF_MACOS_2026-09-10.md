# Continuidade — Mac / 2026-09-10

## Direção do responsável

Priorizar funcionalidades ausentes, ferramentas, layout e tema seguindo o MASTER e Addendum. Em 2026-09-10, o responsável pediu reduzir análises, testes e builds repetidos. A última etapa recebeu apenas o build necessário para instalar. Não converter isso em declaração de QA completo.

## Ambiente e preservação

- Repositório de trabalho: `/Users/rael/Documents/moti.on`.
- Branch: `macos-m5-continuation`, criada a partir de `caf89ba` com as alterações locais existentes preservadas. Não houve commit nem publicação.
- macOS 26.6.2 (25G83), arm64. AE 26.3x87 / CEP 12.0.1.2; Premiere 26.3.2.
- Node 24.19.0 do runtime local e npm 11.6.2 instalado com integridade SHA-512 conferida. PATH da sessão: `$HOME/.local/share/motion-dev/bin`.
- `npm ci` substituiu dependências transferidas do Windows. A primeira tentativa de check falhou por permissões dos executáveis Windows; após instalação, 1153 testes passaram.

## Implementado nesta continuidade

- Instalação local do Moti.on AE e Premiere; script reproduzível `install:premiere:dev:mac`.
- Correção da Home que mostrava logs sob o título Início e ícone desconhecido.
- Home/catalogo: favoritos, recentes, busca persistente durante navegação, Quick no catálogo e ajuste explícito por botão independente.
- Preferências locais versionadas: tema dark/light, densidade default/compact, favoritos (até 100 IDs) e recentes (8). Não armazena conteúdo ou caminhos de projetos.
- Configuração de aparência compartilhada nos dois aplicativos; base escura mantida em `#1D1D1D`.
- Grade responsiva 2/3/4 colunas, nomes com quebra e ações separadas.

## Evidência e limites

| Escopo | Resultado | Observado |
|---|---|---|
| Dependências macOS | PASS | `npm ci`, 0 vulnerabilidades reportadas pelo npm naquele momento |
| Check anterior às preferências/favoritos | PASS | 1155 testes após a correção inicial da Home; não se aplica às adições seguintes |
| Build após preferências/favoritos/grade | PASS | `npm run build`, incluindo compilação de tipos |
| AE, build anterior às adições de interface | PASS parcial | Painel aberto e conectado; contexto 26.3x87; composição Moti.on Demo criada e removida com um Cmd+Z |
| Premiere instalação/reinstalação | PASS | UPIA informou Installation Successful e Moti.on Enabled |
| Premiere execução do painel | NOT RUN | Diálogo de licenciamento/regularização da conta Adobe reapareceu antes do editor; não houve ação de pagamento |
| Favoritos, recentes, aparência e nova grade em host | NOT RUN | Build gerado; não foi realizada nova sessão de QA após o pedido de reduzir testes |
| Matriz completa, performance, acessibilidade, exportação e Undo de todas as ferramentas | NOT RUN | Não inferir aprovação a partir do smoke de composição |

Status das adições de interface: `IMPLEMENTED_NOT_HOST_VERIFIED`. Não é release comercial.

## Próximas entregas concretas

1. Completar Home/dock/Inspector conforme A4: o filtro Recentes entregue não equivale ao dock completo, e ainda faltam previews reais de hover e favoritos reordenáveis.
2. Completar as ferramentas contra seus inputs/aceite, sem inventar comandos. Há lacunas explícitas em §15.5 (duplicar/inverter/mover ao final em um Undo) e §17 (transições FX, distintas dos movimentos de câmera existentes).
3. Remover a dependência de catálogo fictício do rascunho de Assets do Premiere ao integrar um provider real. `mockProvider` já existia no worktree recebido; esta continuidade não implementou backend/provider/licença.
4. Integrar Live Controls do Premiere com um renderer real; não promover os doubles existentes a evidência de host.
5. Assets, captions, native, licenciamento e distribuição permanecem fases abertas. Respeitar decisões de produto/termos e não criar placeholders para aparentar conclusão.

Para recompilar: `npm run build`. Para instalar o build pronto: `bash scripts/install-ae-dev.sh` e `bash scripts/install-premiere-dev.sh`. Reabrir os painéis para carregar o novo JavaScript. Rollback: reinstalar um build anterior preservado; não reverter em bloco as alterações locais herdadas.


## Biblioteca AE — referências instaladas Animation Composer e Brazu

Implementado layout AE específico com Explorar/Editar, categorias laterais, busca,
favoritos/recentes e grade compacta com ícones próprios. Clique seleciona sem mutação;
Aplicar usa o QuickProfile existente, Editar/duplo clique abre parâmetros e Alt+clique
aciona Quick. Bloqueios de contexto e comandos existentes permanecem no caminho de aplicação.
Referências observadas diretamente no AE: Animation Composer Browse/categorias/ações;
Brazu Tools e Keyframe (grade de atalhos, curvas e controles concentrados).
Não foi inspecionado o comportamento de execução de cada ferramenta do Brazu.

Build: PASS (`/tmp/motion-library-build.log`). Instalador AE: PASS.
Painel atualizado apareceu no AE 26.3; inspeção visual da grade/abas: PASS.
Execução das ferramentas novas na timeline: NOT RUN. Suite completa: NOT RUN a pedido do usuário.
Testes de navegação existentes adaptados ao novo contrato de seleção; execução: NOT RUN.
Este marco não representa conclusão do produto nem reprodução integral de todas as telas de referência.


## Refinamento visual e microinterações — 2026-09-10

Identidade Moti.on na biblioteca, superfícies grafite com accent semântico violeta,
nomes a 11 px, categorias com indicador e contagem de resultados. Grade rola
independentemente dos detalhes da seleção; rodapé mantém as ações acessíveis.
Hover/press, favorito e entradas de detalhe/view usam o catálogo de movimento
existente. Navegação anima apenas na troca de view; detalhe apenas na mudança de
seleção, sem repetir em polling do contexto. Favorito atualiza em lugar e tem
nome acessível/estado pressionado. Preferência reduzida interna/sistema continua
consumida pela folha compartilhada; sem dependências, mídias ou loops novos.

Build: PASS (`/tmp/motion-premium-build.log`, após correção de narrowing TypeScript).
Instalação AE: PASS. Testes automatizados e matriz visual no host: NOT RUN neste
marco, conforme pedido para concentrar esforço no desenvolvimento. Reabrir painel
para carregar o bundle novo. Fluxos de comando/host não foram alterados.
