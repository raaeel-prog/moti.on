import { afterEach } from 'node:test';
import test from "node:test";
import assert from "node:assert/strict";

import { checkboxField, colorField, numberField, searchField, selectField } from "../dist/shell.js";
import { createFakeDocument } from "./fake-dom.mjs";

test("selectField mantém label acessível e confirma somente opções declaradas pela view", () => {
  const document = createFakeDocument();
  let selected = null;
  const field = selectField(document, {
    id: "loop-type",
    label: "Tipo",
    value: "cycle",
    options: [
      { value: "cycle", label: "Ciclo" },
      { value: "pingpong", label: "Vai e volta" }
    ],
    onChange: (value) => {
      selected = value;
    }
  });

  const label = field.getElementsByTagName("label")[0];
  const select = field.getElementsByTagName("select")[0];
  assert.equal(label.htmlFor, "loop-type");
  assert.equal(select.id, "loop-type");
  assert.equal(select.value, "cycle");

  select.value = "pingpong";
  select.emit("change");
  assert.equal(selected, "pingpong");
});

test("numberField separa preview de commit e mantém unidade fora do valor", () => {
  const document = createFakeDocument();
  const inputs = [];
  const commits = [];
  const field = numberField(document, {
    id: "loop-duration",
    label: "Duração",
    value: 1.5,
    min: 0.01,
    max: 3600,
    step: 0.01,
    unit: "s",
    onInput: (value) => inputs.push(value),
    onCommit: (value) => commits.push(value)
  });

  const input = field.getElementsByTagName("input")[0];
  input.value = "2.25";
  input.emit("input");
  input.emit("change");

  assert.deepEqual(inputs, [2.25]);
  assert.deepEqual(commits, [2.25]);
  assert.match(field.allText, /Duração/);
  assert.match(field.allText, /s/);
  assert.doesNotMatch(field.allText, /2\.25 s/);
});

test("numberField não envia vazio, valor não finito ou fora do intervalo às ferramentas", () => {
  const document = createFakeDocument(), previews = [], commits = [];
  const field = numberField(document, { id: "safe-number", label: "Intensidade", value: 25,
    min: 0, max: 100, step: 1, onInput: value => previews.push(value), onCommit: value => commits.push(value) });
  const input = field.getElementsByTagName("input")[0];
  for (const invalid of ["", " ", "NaN", "Infinity", "-1", "101", "25.5"]) {
    input.value = invalid; input.emit("input"); input.emit("change");
    assert.equal(input.value, invalid, "preserves invalid draft for correction");
    assert.equal(input.getAttribute("aria-invalid"), "true");
  }
  assert.deepEqual(previews, []); assert.deepEqual(commits, []);
  input.value = "0"; input.emit("change");
  assert.deepEqual(commits, [0], "zero explícito permanece válido");
  input.value = ""; input.emit("change"); assert.equal(input.value, "");
  input.keydown("Escape"); assert.equal(input.value, "0");
  assert.equal(input.getAttribute("aria-invalid"), "false");
});

test("colorField fallback mantém hexadecimal inválido para correção e não envia ao host", () => {
  const document = createFakeDocument(), commits = [];
  document.documentElement.lang = "pt-BR";
  const create = document.createElement;
  document.createElement = (tag) => {
    const node = create.call(document, tag);
    if (tag === "input") Object.defineProperty(node, "type", {
      get() { return this.__type ?? "text"; },
      set(value) { this.__type = value === "color" ? "text" : value; },
      configurable: true
    });
    return node;
  };
  const field = colorField(document, { id: "accent", label: "Cor", value: "#abcdef", onCommit: value => commits.push(value) });
  const input = field.getElementsByTagName("input")[0];
  input.value = "#xyz"; input.emit("input"); input.emit("change");
  assert.equal(input.value, "#xyz");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.match(field.allText, /hexadecimais/i);
  assert.deepEqual(commits, []);
  input.value = "ABCDEF"; input.emit("change");
  assert.equal(input.value, "#abcdef");
  assert.deepEqual(commits, [], "normalizar mesma cor não duplica comando");
  input.value = "#123456"; input.emit("change");
  assert.deepEqual(commits, ["#123456"]);
  input.value = "oops"; input.keydown("Escape");
  assert.equal(input.value, "#123456");
  assert.equal(input.getAttribute("aria-invalid"), "false");
});

test("checkboxField propaga estado e campo desabilitado explica o motivo", () => {
  const document = createFakeDocument();
  let checked = null;
  const field = checkboxField(document, {
    id: "safe-mode",
    label: "Preservar expressão",
    checked: true,
    disabled: true,
    disabledReason: "Obrigatório nesta versão",
    onChange: (value) => {
      checked = value;
    }
  });

  const input = field.getElementsByTagName("input")[0];
  assert.equal(input.checked, true);
  assert.equal(input.disabled, true);
  assert.equal(input.title, "Obrigatório nesta versão");

  input.checked = false;
  input.emit("change");
  assert.equal(checked, null, "disabled field cannot emit a change");
});

test("searchField reage a cada tecla, e nao so ao change", () => {
  // É o oposto deliberado de textField. Um campo de busca que só respondesse no
  // `change` faria o usuário digitar às cegas até tirar o foco do campo.
  const document = createFakeDocument();
  const teclas = [];
  const field = searchField(document, {
    id: "tools-search",
    label: "Buscar ferramenta",
    value: "",
    placeholder: "Nome ou descrição",
    onInput: (value) => teclas.push(value)
  });

  const label = field.getElementsByTagName("label")[0];
  const input = field.getElementsByTagName("input")[0];
  assert.equal(label.htmlFor, "tools-search");
  assert.equal(input.id, "tools-search");
  assert.equal(input.getAttribute("placeholder"), "Nome ou descrição");
  assert.equal(input.getAttribute("autocomplete"), "off");

  input.value = "ne";
  input.emit("input");
  input.value = "neo";
  input.emit("input");
  assert.deepEqual(teclas, ["ne", "neo"]);

  // `change` não pode disparar uma segunda vez: o consumidor filtraria duas
  // vezes o mesmo texto ao sair do campo.
  input.emit("change");
  assert.deepEqual(teclas, ["ne", "neo"]);
});

test("searchField cai para type=text quando o runtime nao conhece type=search", () => {
  // UXP não é um navegador completo; um input de tipo desconhecido vira um
  // campo inerte, e um filtro que não aceita digitação é pior que nenhum.
  const document = createFakeDocument();
  const original = document.createElement;
  document.createElement = (tag) => {
    const node = original.call(document, tag);
    if (tag === "input") {
      Object.defineProperty(node, "type", {
        get: () => node.__type ?? "text",
        set: (v) => {
          node.__type = v === "search" ? "text" : v;
        },
        configurable: true
      });
    }
    return node;
  };

  const field = searchField(document, {
    id: "busca",
    label: "Buscar",
    value: "",
    onInput: () => {}
  });
  document.createElement = original;

  const input = field.getElementsByTagName("input")[0];
  assert.equal(input.type, "text");
});


test("numberField validates decimal commas and commits Enter only once", () => {
  const doc = createFakeDocument(), commits = [];
  doc.documentElement.lang = "en-US";
  const field = numberField(doc, {id:"decimal",label:"Duration",value:1,min:0,max:10,step:0.01,onCommit:value=>commits.push(value)});
  const input = field.getElementsByTagName("input")[0];
  input.value = "not a number"; input.emit("change");
  assert.match(field.allText, /Enter a number between 0 and 10/);
  input.value = "2,25"; input.keydown("Enter"); input.emit("change");
  assert.deepEqual(commits,[2.25]);
  assert.equal(input.getAttribute("aria-invalid"),"false");
});

test("numberField scrub previews movement and sends one commit on release", () => {
  const doc=createFakeDocument(), previews=[], commits=[];
  const field=numberField(doc,{id:"frames",label:"Duração",value:24,min:1,max:300,step:1,onInput:v=>previews.push(v),onCommit:v=>commits.push(v)});
  const handle=field.getElementsByTagName("button")[0], input=field.getElementsByTagName("input")[0];
  handle.setPointerCapture=()=>{};
  handle.emit("pointerdown",{button:0,pointerId:1,clientX:0});
  handle.emit("pointermove",{pointerId:1,clientX:8});
  handle.emit("pointermove",{pointerId:1,clientX:12});
  assert.deepEqual(commits,[]);
  assert.deepEqual(previews,[26,27]);
  handle.emit("pointerup");
  assert.deepEqual(commits,[27]);
  handle.emit("pointerdown",{button:0,pointerId:2,clientX:0});
  handle.emit("pointermove",{pointerId:2,clientX:20});
  handle.emit("pointercancel");
  assert.equal(input.value,"27");
  assert.deepEqual(commits,[27]);
  handle.keydown("ArrowRight",{shiftKey:true});
  assert.deepEqual(commits,[27,37]);
});

test("numberField keeps caret keys native and allows precise modifier steps", () => {
  const doc=createFakeDocument(),commits=[];
  const field=numberField(doc,{id:"seconds",label:"Duração",value:1,min:0,max:20,step:0.1,onCommit:v=>commits.push(v)});
  const input=field.getElementsByTagName("input")[0],handle=field.getElementsByTagName("button")[0];
  assert.equal(input.keydown("ArrowLeft").defaultPrevented,false);
  handle.keydown("ArrowRight",{altKey:true});
  assert.deepEqual(commits,[1.01]);
});

test("search expands without losing the query and collapses only an empty draft", () => {
  const doc=createFakeDocument(),values=[];
  const field=searchField(doc,{id:"search",label:"Buscar",value:"",onInput:value=>values.push(value)});
  const input=field.getElementsByTagName("input")[0],trigger=field.getElementsByTagName("button")[0];
  assert.equal(input.hidden,true); trigger.click();
  assert.equal(input.hidden,false); assert.equal(doc.activeElement,input);
  input.value="wiggle"; input.emit("input"); input.emit("blur");
  assert.equal(input.hidden,false); assert.equal(input.value,"wiggle");
  input.keydown("Escape"); assert.equal(input.value,"wiggle");
  input.value=""; input.emit("input"); input.keydown("Escape");
  assert.equal(input.hidden,true); assert.equal(doc.activeElement,trigger);
  assert.deepEqual(values,["wiggle",""]);
});

test("select rejects values absent from the declared options", () => {
  const doc=createFakeDocument(),values=[];
  const field=selectField(doc,{id:"safe-select",label:"Modo",value:"one",options:[{value:"one",label:"Um"}],onChange:v=>values.push(v)});
  const select=field.getElementsByTagName("select")[0];
  select.value="injected"; select.emit("change");
  assert.deepEqual(values,[]);
});


test("browser select keeps accessible value, keyboard selection and focus return", async () => {
  const doc=createFakeDocument(), values=[], listeners=new Map();
  const create=doc.createElement;
  doc.createElement=tag=>{
    const node=create(tag); node.style={}; node.animate=()=>{};
    node.getBoundingClientRect=()=>({left:20,top:80,bottom:108,width:110});
    node.contains=target=>node===target||node.children.some(child=>child.contains(target));
    return node;
  };
  doc.body=doc.createElement("body");
  doc.addEventListener=(name,fn)=>listeners.set(name,fn);
  doc.removeEventListener=name=>listeners.delete(name);
  doc.defaultView={innerHeight:600,addEventListener(){},removeEventListener(){}};
  const field=selectField(doc,{id:"menu",label:"Mode",value:"one",options:[{value:"one",label:"One"},{value:"two",label:"Two"}],onChange:v=>values.push(v)});
  const select=field.getElementsByTagName("select")[0],trigger=field.getElementsByTagName("button")[0];
  assert.equal(select.hidden,true);
  trigger.click();
  assert.equal(trigger.getAttribute("aria-expanded"),"true");
  const menu=doc.body.children[0], choices=menu.children;
  choices[0].keydown("ArrowDown"); assert.equal(doc.activeElement,choices[1]);
  choices[1].click();
  assert.deepEqual(values,["two"]); assert.equal(select.value,"two");
  assert.equal(trigger.getAttribute("aria-label"),"Mode: Two");
  assert.equal(doc.activeElement,trigger);
  assert.equal(doc.body.children.length,0);
  trigger.click(); doc.body.children[0].children[1].keydown("Escape");
  assert.equal(doc.body.children.length,0);
  assert.equal(listeners.size,0);
  doc.defaultView.getComputedStyle=()=>({transitionDuration:"0.01s"});
  trigger.click(); const reversing=doc.body.children[0]; trigger.click();
  assert.equal(reversing.getAttribute("data-open"),"false");
  assert.equal(listeners.size,0,"global handlers detach before exit animation");
  trigger.click();
  assert.equal(doc.body.children[0],reversing,"rapid reversal reuses the surface");
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(doc.body.children[0],reversing,"cancelled exit does not remove reopened menu");
  trigger.click(); await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(doc.body.children.length,0);
  doc.defaultView.getComputedStyle=()=>({transitionDuration:"0s"});
  trigger.click(); trigger.click();
  assert.equal(doc.body.children.length,0,"reduced motion closes immediately");
  let observeRemoval,disconnected=false;
  doc.defaultView.MutationObserver=class { constructor(callback){observeRemoval=callback;} observe(){} disconnect(){disconnected=true;} };
  doc.documentElement.contains=()=>false;
  trigger.click(); observeRemoval();
  assert.equal(doc.body.children.length,0,"detached control cannot leave a portal behind");
  assert.equal(listeners.size,0);
  assert.equal(disconnected,true);
});

afterEach(() => {
  for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
});
