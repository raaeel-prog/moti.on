# ADR 0008 — Banco de mídia (Pexels, Pixabay, Unsplash, Freesound)

Data: 2026-11-13. Estado: aceito.

## Contexto

O §18 do master spec pede assets online sem expor chaves e sem violar termos, e lista Pexels como provider inicial, Unsplash opcional e Freesound opcional "com filtro de licença por item e licença de API comercial antes de uso comercial". O produto pediu vídeos, imagens e sons gratuitos já disponíveis para o usuário final, com o administrador configurando o acesso.

## Decisão

1. **BFF próprio** (`services/supabase/functions/motion-assets`): chaves só como segredos da função; só contas com licença ativa; limite por conta por minuto; cache de busca de 24 h por hash do pedido (sem histórico por pessoa). Desligar um banco = remover o segredo, sem release do plugin.
2. **Detalhe relido no servidor ao importar**: o painel nunca escolhe a URL que será baixada. O Unsplash recebe o hit de `download_location` nesse momento, como exigem os termos.
3. **Um banco por grade**, crédito e licença sempre visíveis no inspetor, links de autor e de origem com `utm_source=moti_on` (Unsplash/Pexels), crédito gravado no comentário do item no Projeto e na ficha `.chms-asset.json`.
4. **Freesound: só CC0 e CC BY.** CC BY-NC e Sampling+ são descartados no adaptador, não só rotulados, porque o plugin é usado em trabalho comercial. Importa-se a prévia HQ (MP3): o download do original exige OAuth2 por usuário.
5. **Freesound e uso comercial da API:** os termos da API do Freesound tratam o uso comercial da própria API à parte. O banco fica **desligado** até o administrador obter o acordo comercial (ou decidir o uso não comercial) e cadastrar a chave. Essa decisão é do administrador, fora do código.
6. **Fora desta versão:** GIPHY (exige chamada direta do cliente e proíbe cache/proxy — outro fluxo), música (sem direito claro de redistribuição), Premiere (a tela; o SDK já é independente de host).

## Consequências

- O plugin só contém URLs públicas das CDNs (CSP `img-src`/`media-src` e allowlist do downloader); a lista é a mesma nos três lugares e um teste compara.
- Mudança de termos de um banco = revisar o adaptador em `_shared/stock-providers.ts` e esta ADR.
