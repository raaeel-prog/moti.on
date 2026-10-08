import { button, createElement } from "@motion/ui-core";
import { loadAccount } from "../account.js";
import type { AccountClient, AccountSnapshot } from "@motion/account-client";
export function createAccountView(doc: Document, locale: string): { element: HTMLElement; dispose(): void } {
  const pt = locale === "pt-BR", element = createElement(doc, "section", "ch-settings-section");
  element.appendChild(createElement(doc, "h2", "ch-section-title", pt ? "Conta" : "Account"));
  const body = createElement(doc, "div", "ch-account"); element.appendChild(body);
  body.textContent = pt ? "Carregando conta…" : "Loading account…";
  let disposed = false, stop: (() => void) | undefined, busy = false;
  function render(client: AccountClient, snapshot: AccountSnapshot): void {
    if (disposed) return; while (body.firstChild) body.removeChild(body.firstChild);
    const text = (value: string): void => { body.appendChild(createElement(doc, "p", "ch-hint", value)); };
    const action = (label: string, work: () => Promise<unknown>): void => { body.appendChild(button(doc, { label, disabled: busy, onClick: () => {
      if (busy || disposed) return; busy = true; render(client, client.snapshot());
      void work().catch(() => {}).finally(() => { busy = false; render(client, client.snapshot()); });
    } })); };
    if (snapshot.status === "setup_required") {
      text(pt ? "A conexão Google aguarda configuração do serviço e do componente de segurança. Operações do plugin exigem uma licença beta ativa." : "Google sign-in requires service and security component setup. Plugin operations require an active beta license."); return;
    }
    if (snapshot.user) {
      text(snapshot.user.name || snapshot.user.email);
      const labels: Record<AccountSnapshot["license"]["state"], string> = pt ? { unavailable: "Licença indisponível", missing: "Aguardando liberação manual da licença beta", active: "Licença ativa", expired: "Prazo offline expirado — reconecte", revoked: "Licença revogada", device_limit: "Outro computador está ativo", inactive: "Ative este computador" } : { unavailable: "License unavailable", missing: "Awaiting manual beta approval", active: "License active", expired: "Offline access expired — reconnect", revoked: "License revoked", device_limit: "Another computer is active", inactive: "Activate this computer" };
      text(labels[snapshot.license.state]);
      if (snapshot.license.expiresAt) text((pt ? "Prazo offline: " : "Offline until: ") + new Date(snapshot.license.expiresAt).toLocaleString(locale));
      for (const device of snapshot.devices) {
        text(device.name + (device.id === snapshot.deviceId ? (pt ? " · Este computador" : " · This computer") : ""));
        action(pt ? "Desativar computador" : "Deactivate computer", () => client.deactivateDevice(device.id));
      }
      if (!snapshot.license.canMutate) action(pt ? "Ativar este computador" : "Activate this computer", () => client.activateDevice());
      action(pt ? "Atualizar sessão e licença" : "Refresh session and license", () => client.refresh());
      text(`${pt ? "Alterações aguardando sincronização" : "Pending sync changes"}: ${snapshot.sync.pending}`);
      action(pt ? "Sincronizar agora" : "Sync now", () => client.sync());
      action(pt ? "Sair" : "Sign out", () => client.signOut());
    } else if (snapshot.status !== "signing_in") action(pt ? "Continuar com Google" : "Continue with Google", () => client.signIn());
    if (snapshot.status === "signing_in") {
      text(pt ? "Conclua o login no navegador." : "Complete sign-in in your browser.");
      // Cancellation must remain available while signIn is awaiting the callback.
      body.appendChild(button(doc, { label: pt ? "Cancelar login" : "Cancel sign-in", onClick: () => { void client.signOut(); } }));
    }
    if (snapshot.persistence === "unavailable") text(pt ? "Armazenamento seguro indisponível. A sessão não será guardada." : "Secure storage unavailable. Your session will not be saved.");
    if (snapshot.error) text(pt ? "Não foi possível concluir. Verifique sua conexão e tente novamente." : "Unable to complete. Check your connection and retry.");
  }
  void loadAccount().then(client => { if (!disposed) stop = client.subscribe(snapshot => render(client, snapshot)); }).catch(() => { if (!disposed) body.textContent = pt ? "Conta indisponível nesta instalação." : "Account unavailable in this installation."; });
  return { element, dispose() { disposed = true; stop?.(); } };
}
