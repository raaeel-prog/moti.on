import type { CommandResponse, ManagedToolInspection } from "@motion/contracts";
import { button, createElement } from "@motion/ui-core";

/** Uses captured targets; the host validates ownership and revision before writes. */
export function renderManagedTools(doc: Document, parent: HTMLElement, tools: ManagedToolInspection[], locale: string,
  execute: (args: Record<string, unknown>) => Promise<CommandResponse<unknown>>): () => void {
  let disposed = false;
  const pt = locale === "pt-BR", root = createElement(doc, "section", "ch-managed-tools");
  root.appendChild(createElement(doc, "h3", "ch-section-title", pt ? "Ferramentas" : "Tools"));
  parent.appendChild(root);
  if (!tools.length) root.appendChild(createElement(doc, "p", "ch-preset-hint", pt ? "Nenhum controle de ferramenta compatível nesta seleção." : "No compatible tool controls in this selection."));
  const sections: HTMLDetailsElement[] = [];
  for (const tool of tools) {
    const section = doc.createElement("details"); section.className = "ch-edit-section";
    section.appendChild(createElement(doc, "summary", "", tool.name)); root.appendChild(section); sections.push(section);
    section.addEventListener("toggle", () => { if (section.open) for (const other of sections) if (other !== section) other.open = false; });
    const values: Record<string, number | number[]> = {};
    const fields: HTMLInputElement[] = [];
    const status = createElement(doc, "p", "ch-preset-hint"); status.setAttribute("role", "status");
    for (const control of tool.controls) {
      const row = createElement(doc, "label", "ch-control-row");
      row.appendChild(createElement(doc, "span", "", control.label)); section.appendChild(row);
      const original = Array.isArray(control.value) ? control.value : [control.value];
      const inputs: HTMLInputElement[] = [];
      for (const value of original) {
        const input = doc.createElement("input"); input.type = "number"; input.value = String(value); input.step = "any";
        input.disabled = control.locked; input.setAttribute("aria-label", control.label);
        if (control.min !== undefined) input.min = String(control.min);
        if (control.max !== undefined) input.max = String(control.max);
        row.appendChild(input); inputs.push(input); fields.push(input);
        input.addEventListener("input", () => {
          const numbers = inputs.map(field => Number(field.value));
          if (inputs.every(field => field.value !== "" && field.checkValidity()) && numbers.every(Number.isFinite)) {
            values[control.id] = Array.isArray(control.value) ? numbers : numbers[0]!;
            section.setAttribute("data-gesture-active", "true");
          }
        });
      }
      if (control.locked) row.appendChild(createElement(doc, "small", "", pt ? "Animado ou bloqueado · edite no host" : "Animated or locked · edit in host"));
    }
    const apply = button(doc, { label: pt ? "Aplicar ajustes" : "Apply changes", onClick: () => { void commit(); } });
    async function commit(): Promise<void> {
      if (disposed || apply.disabled || !Object.keys(values).length || fields.some(field => !field.disabled && (!field.value || !field.checkValidity()))) return;
      apply.disabled = true;
      try {
        const result = await execute({ target: tool.target, values });
        if (disposed) return;
        status.textContent = result.ok ? (pt ? "Ajustes aplicados." : "Changes applied.") : result.error?.message ?? (pt ? "Não foi possível aplicar." : "Unable to apply.");
        if (result.ok) section.removeAttribute("data-gesture-active");
      } catch { if (!disposed) status.textContent = pt ? "Falha ao aplicar. Atualize a seleção antes de tentar novamente." : "Apply failed. Refresh selection before retrying."; }
      finally { if (!disposed) apply.disabled = false; }
    }
    section.appendChild(apply); section.appendChild(status);
  }
  return () => { disposed = true; root.remove(); };
}
