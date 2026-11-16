# ADR 0007 — Motor de câmera: uma autoridade de pose para shots vivos

- **Status:** aceita; implementada em 19/10/2026. `IMPLEMENTED_HOST_PARTIALLY_VERIFIED`. No After Effects 26.5x89/Windows, em 20/10/2026, com o núcleo final:
  - `scripts/verify-camera-engine.jsx` passou 14/14;
  - `scripts/verify-camera-choreography.jsx` passou 6/6.

  O painel aberto dentro do AE, o Undo em um passo e o macOS não foram executados.
- **Data:** 2026-10-18
- **Escopo:**
  - comandos `ae.camera.shot.apply`, `ae.camera.shot.adjust`, `ae.camera.shot.remove`, `ae.camera.remove`, `ae.camera.inspect` e `ae.camera.bake` (§13 do `MASTER_BUILD_SPEC.md`);
  - código em `packages/contracts/src/camera-kernel.ts`, `camera-presets.ts`, `host/src/camera/camera-rig.jsx` e `host/src/commands/camera-shots.jsx`;
  - a aba Parallax do painel.

## Situação

O usuário pediu uma categoria de presets de câmera para motion flyers, com:
- suavização, impacto, auto foco, zoom dinâmico, motion blur e 6 eixos;
- controle total;
- funcionamento com o Parallax do Moti.on e também sem ele.

O Moti.on tinha só tabelas fixas de movimentos (`camera-transition.jsx`, `parallax.move`). O rascunho do estudo copiava 12 movimentos para essas tabelas como deslocamentos fixos de dois keyframes.

O estudo do Brazu 2.0.0 (`docs/research/2026-10-18-brazu-parallax-rea.md`, clean-room) mostrou o modelo de mercado: uma câmera presa a um null de controle, com wiggle e foco por expressão. Também mostrou as fraquezas desse modelo:
- a posição é interpolada entre o centro e o valor, então camadas fora do centro "saltam";
- a identidade é por nome;
- o wiggle não tem semente nem loop;
- o foco vai para o Z mundial mais próximo;
- há só quatro presets, todos de um eixo.

## Decisão

1. **Uma autoridade de pose.**
   - `camPose(t, rig, shots)` calcula a câmera em mundo: posição, eixos, lente e cobertura do fundo.
   - O rig escreve esse resultado num único dono: Position, Orientation e Rotate Z do null de controle, e Zoom, Focus Distance, DOF, Aperture e Blur Level da câmera filha.
   - O Parallax nunca recompensa o que a câmera faz: os membros continuam com a projeção exata `k = 1 + z/f` da v3.
2. **A mesma matemática em quatro lugares.** O núcleo é TypeScript ES3 (só `var`/`function`), serializado pelo `scripts/build-motion-library.mjs` em `host/generated/camera-library.jsx`. Ele roda:
   - no host, como `MotionCameraCore`;
   - dentro de cada expressão, via `MotionCameraCore.source`, então o projeto renderiza sem o painel;
   - na prévia do painel;
   - nos testes.
3. **Topologia.** O null de controle fica no pivô e a câmera é filha em `[0, 0, −dist]`.
   - No **modo Parallax**, o motor adota o master v3 e sua câmera, conferindo `compId`, `cameraId` e o parentesco.
   - No **modo independente**, cria o mesmo par sobre uma cena 3D, com a câmera padrão do AE (`zoom = largura · 50/36`), para que o primeiro quadro não mude.
   - Recusa uma cena só 2D (oferece Parallax) e uma câmera existente. Adotar uma câmera existente fica para depois.
4. **Orientação sem `lookAt`.** A base da câmera é pan, depois tilt, depois roll (`Ry · Rx · Rz`), o que mantém o horizonte nivelado.
   - `camOrientation` converte pan e tilt nos ângulos de Orientation do AE, pela composição medida no host (`Rx · Ry · Rz`, `docs/research/after-effects-3d-transform.md`).
   - O roll vai para o Rotate Z, que o AE aplica depois da Orientation.
   - `lookAt` só aponta o eixo Z e deixa um roll implícito quando pan e tilt se combinam: com 10°/5°, cerca de −0,9°, ou ~15 px na borda de um flyer.
5. **Determinismo.** Nenhuma memória entre quadros:
   - o ruído é harmônico com semente e fecha o loop por construção;
   - o impacto é uma envoltória C1 (antecipação, ataque, ultrapassagem, acomodação);
   - o foco suaviza com sete amostras numa janela passada.

   Scrub, render fora de ordem e subquadros dão o mesmo resultado.
6. **Intensidade normalizada.** X é medido pela largura visível, Y pela altura visível e Z pela distância da câmera. Uma receita lê igual em 1080×1920, 1920×1080 e 1080×1080.
   - O avanço em direção ao plano mais próximo tem limite suave.
   - Com o Parallax, a cobertura do fundo aplica só o zoom de lente que o movimento exige. O cálculo projeta os quatro cantos do fundo, na profundidade real dele, porque com pan o plano fica oblíquo; medir só o centro deixou ~12 px de borda à mostra no AE.
7. **Tempo por marcadores.** Cada shot é um marcador com duração no null de controle, com os parâmetros `Moti.on.camera = rigId` e `Moti.on.shot = id`.
   - Arrastar ou esticar o marcador muda o shot ao vivo; a expressão lê `marker.key(i).parameters`.
   - Sem o marcador, valem o início e a duração gravados.
8. **Controles vivos nativos** no null de controle, nomeados `Moti.on Câmera · …`:
   - intensidade geral e por shot, lente e cobertura;
   - alvo de foco em Layer Control, que o AE mantém ao renomear;
   - ajuste e suavização do foco, DOF, abertura e desfoque.
9. **Metadados e devolução.**
   - A linha `[Moti.on.camera.v1]` com JSON URI-encoded vai no comentário do controle, com `pluginVersion`.
   - A expressão original de cada propriedade é gravada uma vez e devolvida ao remover. O foco legado do Parallax é aceito e volta ao remover.
   - O motor nunca sobrescreve uma expressão que não seja dele.
10. **Bake** amostra cada propriedade do motor por quadro, grava keys e desliga o motor. Câmera e controle ficam como camadas comuns.
11. **Receitas por intenção.** São 11, em Destacar, Revelar, Atravessar, Impactar e Respirar, todas do Moti.on (§0.8/§34):
    - Hero Push, Depth Slide e Float Loop;
    - Reveal Pull, Pedestal Reveal, Arc Hero, Punch In, Whip Reframe, Dolly Zoom, Beat Hit e Controlled Handheld.

    Os 12 movimentos do rascunho saíram das tabelas fixas; os 11 clássicos continuam.

## Fase 2 — coreografias que leem a cena (19/10/2026)

O usuário pediu presets mais elaborados e mais longos: a câmera saindo lá de trás, passando entre as camadas 3D, dando zoom numa camada e depois em outra, voltando, com o foco automático acompanhando. Decisões:

12. **Shot do tipo "visita".**
    - É uma pose absoluta: olhar um ponto a uma distância, com órbita própria, roll, lente, um arco no meio do trajeto e um ponto de foco.
    - As visitas se dobram em ordem de tempo (`camVisits`): cada uma leva a câmera de onde as anteriores a deixaram até a sua pose, então um tour se encadeia, e a visita ao pivô volta exatamente ao design.
    - O foco segue a mesma dobra e chega a 70% do trajeto (rack focus antes da câmera).
    - A lente da visita se mistura em escala linear, não logarítmica. Quando ela abre para segurar o fundo, acompanha a aproximação da câmera, e o que a câmera atravessa só cresce. No AE, com a mistura em log, o protagonista encolhia no começo do Mergulho.
    - Os shots aditivos (respiração, impacto) somam por cima.
13. **Planejador puro e determinístico** (`camera-choreography.ts`), serializado só no host e não nas expressões. Ele:
    - lê a cena (centro em mundo e meias-extensões de cada camada, depois da compensação do Parallax) e reconhece o fundo;
    - escolhe os destaques por importância (área na tela, texto com peso maior) e os ordena: do fundo para a frente, da frente para o fundo ou em leitura.
    - Regras de enquadramento:
      - texto cabe inteiro;
      - imagens preenchem pelo lado limitante, com aumento mínimo (1,15×, ou 1,08× no texto) e máximo pelo que a fonte aguenta;
      - uma camada que tapa o alvo é atravessada: a câmera para entre ela e o alvo.
    - **Enquadramento de operador** (`camReframe`). Centralizar uma camada perto da borda do design mostraria a borda do fundo, e o núcleo então daria zoom para cobri-la. No AE, isso cortou o título dos lados. A ordem é:
      1. o ponto de mira desliza para o centro do layout até o fundo cobrir sozinho, e a camada fica fora do centro, inteira (texto dentro da área segura; imagem com pelo menos 85% no quadro e zoom de cobertura de no máximo 1,25×);
      2. se não bastar, a órbita diminui, porque perto de uma camada pequena ela varre o fundo distante;
      3. por último, a câmera recua.
    - Um título largo não recua para caber em 82% do quadro: avança pelo menos 1,08× enquanto couber em 90%.
    - **Atravessar** (`through`): a câmera passa pela camada do protagonista e termina no fundo, com a lente aberta para o fundo não passar de 2,2×.
    - A abertura "lá de trás" busca a posição mais funda (com deslocamento lateral) que esconde camadas da frente atrás da câmera. Ela não pode:
      - deixar uma camada cortando a lente;
      - deixar qualquer camada cobrindo mais de 40% do quadro;
      - exigir zoom de cobertura acima de 1,25×;
      - mostrar menos de 15% do protagonista.
    - O travelling é um arco em torno do centro do fundo, nunca um deslize lateral, que exigiria zoom para cobrir as bordas.
    - O fim do Mergulho era uma pose funda deslocada de lado, e no AE ficava meio protagonista num fundo vazio. Agora ele atravessa.
14. **Uma coreografia é um grupo de shots.**
    - Cada passo tem marcador; a respiração não tem, porque o AE guarda um marcador por instante.
    - Um controle de intensidade compartilhado multiplica a base de cada passo.
    - `ae.camera.shot.remove {groupId}` remove o grupo inteiro.
    - O motion blur que a coreografia liga fica registrado e volta ao remover o rig.
15. **Custo.** Com visitas, o foco usa uma amostra só, porque o rack já é suave. Sem profundidade de campo, também uma amostra. As 8 expressões do rig ficam em ~20 ms por quadro no AE 26.5, contra ~80 ms antes da otimização.

## Fase 3 — câmera mais inteligente e dinâmica (25/10/2026)

O usuário aprovou as coreografias, mas pediu:
- a abertura com a câmera entrando "Z +2500" até o fundo e voltando à posição original, com as camadas aparecendo na passagem;
- foco mais rápido e no lugar certo;
- câmera menos parada, com zooms rápidos de um canto ao outro;
- uma auditoria.

Decisões:

16. **Abertura por profundidade** (`camDeepStart`).
    - A câmera anda `depth` px em Z a partir da referência (padrão 2500, editável) e olha reto para o fundo, a pelo menos 4% do zoom dele.
    - Uma camada que ficaria colada na lente (cortando a lente, ou cobrindo mais de 55% do quadro ampliada além de 2,5×) é ultrapassada, ou a câmera para antes, o que estiver mais perto da profundidade pedida. O plano informa a profundidade usada e avisa quando ela muda.
    - A lente abre para o fundo não passar de 2,2× e volta ao normal no recuo. Com a mistura linear da lente, a ampliação do fundo só diminui durante o recuo.
17. **Foco planejado pela intenção e pela tela** (`camPlanFocus`, shots `focus`).
    - Enquanto a câmera vai a uma camada e fica nela, o foco é essa camada, com rack a partir do início do movimento.
    - Fora disso (abertura, recuo, travelling, volta ao layout), o planejador percorre o movimento e escolhe a camada que mais pesa na tela: área, centro, texto e protagonista com mais peso, o fundo só quando nada mais aparece. A troca exige vitória clara mantida por 0,2 s.
    - Cada troca vira um rack de 0,3 s, com no máximo 10 por coreografia.
    - As visitas passam o foco para os racks (`vis[8]`).
    - No AE, cada rack lê a posição atual da camada por um Layer Control no controle do rig, então o foco acompanha camadas animadas.
18. **Movimento contínuo.**
    - As visitas aceitam a curva de impacto com ultrapassagem pequena (5–7%).
    - Também aceitam `creep`: depois de chegar, a câmera continua avançando, com entrada suave e no máximo 15% da distância.
    - O roll alterna como a órbita, e o texto não ganha roll.
    - Nova ordem `spread` ("De canto a canto"): o mais importante primeiro, depois sempre o mais distante na tela. Nova coreografia Zooms rápidos.
19. **Correções da auditoria.**
    - Visita com peso máximo 1: acima de 100% a visita extrapolava o enquadramento.
    - Ótica (DOF, abertura, desfoque) gravada e devolvida ao remover a última coreografia.
    - Cena lida no meio da janela, com o indicador de tempo devolvido em seguida.
    - O protagonista pode encher o quadro no travelling.
    - Limite de shots por comp subiu de 24 para 32, para caberem os racks.
    - No travelling, o protagonista pode ocupar até 55% do quadro (os outros, 40%), e no meio do arco outra camada precisa aparecer. Sem esse limite, o AE mostrou uma parede laranja.

    Verificado no AE 26.5x89/Windows em 25/10: coreografias 7/7 e motor 14/14.

## Consequências

- **Parallax:**
  - `ae.parallax.remove` espera a câmera sair;
  - `ae.parallax.move` (keyframes) é recusado enquanto o motor dirige o master;
  - `ae.parallax.adjust` aceita o zoom gerenciado.
- **Expressões e limites:**
  - Cada expressão do rig carrega o núcleo inteiro (cerca de 8,5 mil caracteres de funções). O custo por quadro é medido no script de verificação.
  - Pan acima de ±90° funciona na expressão, mas a representação dos ângulos pula. As receitas ficam bem abaixo disso.
- **Fica para depois:**
  - rack focus (Rack Reveal) e perfil de motion blur;
  - nulls de alvo de foco;
  - o pacote de flyer da fase 3;
  - adotar uma câmera existente;
  - a identidade v4 dos membros do Parallax (ADR 0004).
- **Identidade do rig de câmera:** é por ids no metadado. Uma comp duplicada é detectada e recusada, sem religar em silêncio.
- **Código gerado:** o núcleo vai para o host por `toString`, então os geradores proíbem a sintaxe abreviada de objeto do esbuild, e um teste faz o parse ES3 do host montado. Sem isso, o AE recusou o host inteiro.
- **Modo independente:** não há cobertura automática do fundo, porque o motor não sabe qual camada é o fundo.
- **Verificação:**
  - O harness de Node prova a cadeia completa contra o núcleo, incluindo a matriz de Orientation medida no AE.
  - No AE 26.5x89/Windows foram medidos: câmera padrão, paridade de projeção, marcadores dentro da expressão, foco, cobertura do fundo, Bake, reabertura e render com motion blur. O detalhe está em `docs/implementation/2026-10-18-camera-engine.md`.
