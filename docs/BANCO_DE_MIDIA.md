# Banco de mídia — vídeos, imagens e efeitos sonoros gratuitos

Aba **Banco de mídia** no painel do After Effects, logo depois de Presets, com Vídeos, Imagens e Efeitos sonoros no topo. A pessoa busca, ouve/assiste a prévia, vê o crédito e a licença e clica **Importar**: a mídia entra no projeto, na pasta "Moti.on Banco de mídia/<banco>", e vira uma camada no tempo atual.

| Banco | Tipos | Licença | Crédito |
| --- | --- | --- | --- |
| Pexels | vídeos, fotos | Licença Pexels (uso comercial livre) | opcional, mas recomendado |
| Pixabay | vídeos, imagens | Licença de Conteúdo Pixabay | opcional |
| Unsplash | fotos | Licença Unsplash | **obrigatório** no app; o download é registrado no Unsplash |
| Freesound | efeitos sonoros | por som: só **CC0** e **CC BY** são oferecidos | CC BY exige crédito |

## Como funciona (e por que as chaves ficam com você)

```text
Painel AE → função motion-assets (Supabase) → API do banco
                ↑ chaves só aqui (segredos da função)
Painel AE ← metadados normalizados + URL de mídia permitida
Painel AE (Node do CEP) → baixa da CDN do banco → valida → importa no AE
```

- O usuário nunca vê nem recebe chave. Ele só precisa de conta **aprovada** (a mesma licença do plugin: `motion-admin.mjs aprovar`).
- Limite por conta: 40 pedidos por minuto (mude com o segredo `MOTION_ASSETS_PER_MINUTE`, de 5 a 600). As buscas ficam em cache por 24 h no banco do Supabase (tabela `motion_asset_cache`, sem histórico por pessoa), o que economiza a cota das suas chaves — o Pixabay exige esse cache.
- O arquivo baixado vai para `%APPDATA%\Moti.on\Banco de midia\<banco>\` (Windows) ou `~/Library/Application Support/Moti.on/Banco de midia/<banco>/` (macOS), com uma ficha `<arquivo>.chms-asset.json` (banco, autor, licença, SHA-256). O projeto do AE aponta para esse arquivo: não apague a pasta se o projeto ainda usa a mídia.
- Antes de importar, o download é checado: só HTTPS nas CDNs dos bancos (inclusive em redirecionamentos), limite de tamanho, assinatura real do arquivo (JPEG, PNG, MP4/MOV, MP3, WAV) e SHA-256. Qualquer outra coisa é descartada.

## Configurar (uma vez)

Pré-requisito: o serviço de conta já configurado (`docs/ACCOUNT_ADMIN.md`).

1. Crie as chaves gratuitas dos bancos que quiser ligar:
   - Pexels: https://www.pexels.com/api/new/
   - Pixabay: https://pixabay.com/api/docs/ (a chave aparece logado, na própria página)
   - Unsplash: https://unsplash.com/oauth/applications → crie um app e use a **Access Key**
   - Freesound: https://freesound.org/apiv2/apply/ → leia a ADR 0008 antes (uso comercial)
2. Na pasta `implementation`:
   ```bash
   node services/supabase/scripts/assets-setup.mjs SEU_PROJECT_REF
   ```
   O script aplica a tabela de cache, pede cada chave (a digitação não aparece; Enter em branco pula) e publica a função `motion-assets`.
3. Pronto: no painel, aba **Banco de mídia**. Não precisa atualizar o plugin para ligar ou desligar bancos.

## Administração

```bash
node services/supabase/scripts/assets-setup.mjs SEU_PROJECT_REF status
```
```bash
node services/supabase/scripts/assets-setup.mjs SEU_PROJECT_REF remover freesound
```

`status` mostra quais chaves estão configuradas; `remover` desliga um banco na hora (o painel deixa de oferecê-lo na próxima busca). Para trocar uma chave, rode o script de novo e cole só a nova.

Cotas gratuitas típicas das chaves (confira no site de cada banco): Pexels 200 pedidos/hora; Unsplash 50/hora em modo demo (peça o modo produção depois de mostrar a atribuição); Pixabay 100 por minuto. Com muitos usuários, peça aumento de cota a cada banco.

## Estado

`IMPLEMENTED_NOT_HOST_VERIFIED`: backend, downloader, comando do host e tela têm testes automáticos; falta publicar a função, cadastrar as chaves e importar uma mídia de verdade no After Effects. Premiere Pro ainda não tem a tela (o `@motion/asset-sdk` já é independente de host).
