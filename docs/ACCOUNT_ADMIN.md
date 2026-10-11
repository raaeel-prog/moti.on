# Conta Google, licenças e administração do Moti.on

## Como funciona

1. A pessoa abre **Configurações → Conta → Continuar com Google** no painel. O navegador abre o login Google (Supabase Auth, PKCE, retorno em `127.0.0.1`).
2. A conta é criada no Supabase, mas fica **pendente**: nada no plugin funciona até você aprovar.
3. Você aprova pelo terminal (`aprovar`). A pessoa clica **Atualizar sessão e licença** e o computador é ativado sozinho.
4. O servidor (`services/supabase/functions/motion-account`) entrega uma **concessão assinada (Ed25519) válida por 7 dias**, presa à conta + computador. Ela permite usar o plugin offline e é renovada a cada verificação.
5. Cada licença tem **um computador ativo**. Para trocar de máquina, a pessoa desativa no painel ou você usa `liberar`.

A sessão fica no Keychain do macOS (`motion-account-vault`), nunca em texto puro. A chave de serviço (acesso total) fica só no Keychain do seu Mac, nunca no plugin.

## Configuração inicial (uma vez)

1. Crie um projeto em https://supabase.com/dashboard (plano gratuito serve). Anote o *project ref* (20 letras na URL).
2. No terminal, na pasta `implementation`:
   ```bash
   npx --yes supabase@2.120.0 login
   ```
   ```bash
   node services/supabase/scripts/setup.mjs SEU_PROJECT_REF
   ```
   Ele cria a chave de assinatura (`~/.motion-admin/`), aplica as tabelas, publica a função, grava `apps/after-effects-cep/account/config.json` e guarda a credencial de admin no Keychain (macOS) ou no Gerenciador de Credenciais (Windows — rode `npm run build` antes, com o Visual Studio Build Tools, para existir o cofre `motion-account-vault.exe`).
3. Google Cloud Console → APIs e serviços → **Tela de consentimento OAuth** (Externo, nome Moti.on) → **Credenciais → Criar ID do cliente OAuth → Aplicativo da Web**. URI de redirecionamento autorizado: `https://SEU_PROJECT_REF.supabase.co/auth/v1/callback`.
4. Supabase → Authentication → **Sign In / Providers → Google**: ative e cole Client ID e Client Secret.
5. Supabase → Authentication → **URL Configuration → Redirect URLs**: adicione `http://127.0.0.1:*/motion/**`.
6. Rode `Atualizar Moti.on.command` (macOS) ou, no Windows, `"Atualizar Moti.on.cmd" -RealLicense` (sem o modo desenvolvedor, para o login valer de verdade), abra o painel, entre com Google e aprove a sua própria conta com `node services/supabase/admin/motion-admin.mjs aprovar <seu-email>`.

Enquanto a tela de consentimento estiver em modo *Teste*, só os e-mails cadastrados como "usuários de teste" no Google conseguem entrar. Publique o app no Google quando for liberar para outras pessoas (escopos `openid email profile` não exigem verificação).

## Administração do dia a dia

```bash
node services/supabase/admin/motion-admin.mjs
```

| Comando | Efeito |
| --- | --- |
| `usuarios` | Todas as contas: licença, validade, computador ativo, último login |
| `pendentes` | Quem entrou com Google e espera aprovação |
| `aprovar <email> [dias]` | Libera a licença (sem prazo, ou por N dias) |
| `revogar <email>` | Revoga a licença e desativa todos os computadores |
| `liberar <email> [deviceId]` | Libera o computador ativo para a pessoa trocar de máquina |
| `bloquear <email>` / `desbloquear <email>` | Impede o login Google e a renovação das sessões da conta |
| `historico [email]` | Últimas aprovações, revogações, ativações e desativações |

**Tempo de efeito de uma revogação:** o painel perde acesso na próxima verificação online (abrir o painel, Atualizar). Um computador que fique totalmente offline mantém a concessão até ela vencer — no máximo 7 dias. Para corte mais rápido, `revogar` + `bloquear`.

Também é possível ver tudo no painel do Supabase: **Table Editor** (`motion_licenses`, `motion_devices`, `motion_license_audit`) e **Authentication → Users** (excluir ou banir contas).

## Segurança

- `~/.motion-admin/lease-*.pem` é a chave que assina licenças. Quem tiver esse arquivo pode emitir licenças: faça backup em local seguro e não compartilhe. Se vazar, apague-o e rode `setup.mjs` de novo (gera nova chave; todos os painéis precisam do build novo).
- O plugin só contém valores públicos (URL, chave publicável, chave pública de verificação).
- O cofre é assinado ad hoc no build local; depois de reconstruir, o macOS pode pedir uma vez para permitir o acesso ao Keychain. Para distribuir a outras pessoas, o binário precisa de assinatura Developer ID + notarização.
