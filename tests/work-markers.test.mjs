import test from "node:test";
import assert from "node:assert/strict";
import { findWorkMarker } from "../scripts/work-markers.mjs";

test("gate reconhece marcadores reais em texto, comentários e literais", () => {
  for (const marker of ["TODO", "FIXME", "XXX"]) {
    for (const source of [marker, `// ${marker}: finish`, `/*${marker}*/`, `"${marker}"`, `\n${marker}\n`]) {
      assert.equal(findWorkMarker(source), marker, source);
    }
  }
});

test("gate não confunde palavras ou identificadores com marcadores isolados", () => {
  for (const source of ["TODOS eles", "MÉTODO", "preTODOpost", "TODO_2", "_FIXME", "XXXX", "TODOção", "", "Texto completo."]) {
    assert.equal(findWorkMarker(source), null, source);
  }
});

test("palavra inofensiva anterior não esconde um marcador real posterior", () => {
  assert.equal(findWorkMarker("TODOS os casos; FIXME: corrigir"), "FIXME");
  assert.equal(findWorkMarker("MÉTODO / TODO: implementar"), "TODO");
});
