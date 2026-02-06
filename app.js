let DB=null;
let historyStack=[];
let deferredPrompt=null;

const $=id=>document.getElementById(id);
const homeEl=$("home");
const toolsEl=$("tools");
const toolEl=$("tool");
const backBtn=$("back");
const installBtn=$("install");
const searchEl=$("search");
const metaEl=$("meta");

window.addEventListener("beforeinstallprompt",(e)=>{
  e.preventDefault();
  deferredPrompt=e;
  installBtn.classList.remove("hidden");
});

installBtn.addEventListener("click", async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt=null;
  installBtn.classList.add("hidden");
});

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}

async function init(){
  DB = await fetch("./tools.json",{cache:"no-store"}).then(r=>r.json());
  metaEl.textContent = `Source: ${DB.generated_from || "Excel"} • Outils: ${DB.tools?.length || 0}`;
  renderHome("");
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js");
  }
}

function setView(view){
  homeEl.classList.add("hidden");
  toolsEl.classList.add("hidden");
  toolEl.classList.add("hidden");
  view.classList.remove("hidden");
  backBtn.classList.toggle("hidden", historyStack.length===0);
}

backBtn.addEventListener("click", ()=>{
  const prev=historyStack.pop();
  if(prev) prev();
  backBtn.classList.toggle("hidden", historyStack.length===0);
});

function uniqDomains(){
  return [...new Set((DB.tools||[]).map(t=>t.domain||"Non classé"))].sort((a,b)=>a.localeCompare(b));
}

function renderHome(filter=""){
  setView(homeEl);
  const q=filter.trim().toLowerCase();
  const domains=uniqDomains().filter(d=>!q || d.toLowerCase().includes(q));
  const domainCards = domains.map(d=>{
    const n = DB.tools.filter(t=>(t.domain||"Non classé")===d).length;
    return `<div class="card" data-domain="${esc(d)}"><h3>${esc(d)}</h3><span class="badge">${n} outils</span></div>`;
  }).join("");
  const allCount=(DB.tools||[]).length;
  homeEl.innerHTML = `
    <div class="card" id="allTools"><h3>📚 Tous les outils</h3><span class="badge">${allCount} outils</span></div>
    <div class="hr"></div>
    <div class="grid">${domainCards}</div>
  `;
  $("allTools").onclick=()=>{
    historyStack.push(()=>renderHome(searchEl.value));
    renderToolsList(null, searchEl.value);
  };
  homeEl.querySelectorAll(".card[data-domain]").forEach(c=>{
    c.onclick=()=>{
      const domain=c.dataset.domain;
      historyStack.push(()=>renderHome(searchEl.value));
      renderToolsList(domain, searchEl.value);
    };
  });
}

function renderToolsList(domain, filter=""){
  setView(toolsEl);
  const q=filter.trim().toLowerCase();
  const tools=(DB.tools||[])
    .filter(t=>domain? (t.domain||"Non classé")===domain : true)
    .filter(t=>!q || (t.name||"").toLowerCase().includes(q) || (t.id||"").toLowerCase().includes(q) || (t.notes||"").toLowerCase().includes(q) || (t.domain||"").toLowerCase().includes(q));
  const title = domain ? domain : "📚 Tous les outils";
  toolsEl.innerHTML = `
    <div class="card"><h3>${esc(title)}</h3><span class="badge">${tools.length} outils</span></div>
    <div class="list">
      ${tools.map(t=>`
        <div class="card" data-id="${esc(t.id)}">
          <h3>${esc(t.name || t.id)}</h3>
          <div class="badge">${esc(t.id)}</div>
          ${t.notes?`<div><small class="muted">${esc(t.notes)}</small></div>`:""}
        </div>
      `).join("")}
    </div>
  `;
  toolsEl.querySelectorAll(".card[data-id]").forEach(c=>{
    c.onclick=()=>{
      const id=c.dataset.id;
      historyStack.push(()=>renderToolsList(domain, searchEl.value));
      renderTool(id);
    };
  });
}

// ---- Excel-like formula engine (basic) ----
function normalizeFormula(f){
  if(!f) return "";
  let s=String(f);
  if(s.startsWith("=")) s=s.slice(1);
  // handle empty args: ,,  (or (,) or ,)
  while(s.includes(",,")) s=s.replaceAll(",,", ",undefined,");
  s=s.replaceAll("(,", "(undefined,");
  s=s.replaceAll(",)", ",undefined)");
  // Excel operators
  s=s.replaceAll("^","**").replaceAll("<>","!=");
  // Convert single '=' in comparisons to '==' (avoid >=, <=, !=, ==)
  s=s.replace(/(?<![<>!=])=(?!=)/g,"==");
  return s;
}
function replaceCellRefs(expr){
  // $B$7 or B7 -> CELL("B7")
  return expr.replace(/\$?([A-Z]{1,3})\$?(\d{1,4})/g,(m,col,row)=>`CELL("${col}${row}")`);
}
function makeEvaluator(formula){
  const js = replaceCellRefs(normalizeFormula(formula));
  // eslint-disable-next-line no-new-func
  return new Function("CTX", `with(CTX){ return (${js}); }`);
}
function buildCtx(V){
  function CELL(ref){
    return (ref in V) ? V[ref] : undefined;
  }
  function N(x){ return (x===undefined||x===null||x==="") ? 0 : Number(x); }
  function IF(cond,a,b){ return cond ? a : b; }
  function AND(...args){ return args.every(Boolean); }
  function OR(...args){ return args.some(Boolean); }
  function PI(){ return Math.PI; }
  function SQRT(x){ return Math.sqrt(N(x)); }
  function POWER(x,y){ return Math.pow(N(x), N(y)); }
  function ABS(x){ return Math.abs(N(x)); }
  function MIN(...args){ return Math.min(...args.map(N)); }
  function MAX(...args){ return Math.max(...args.map(N)); }
  return {CELL,N,IF,AND,OR,PI,SQRT,POWER,ABS,MIN,MAX,Math};
}
function runTool(t, inputValues){
  const V={};
  // init inputs
  (t.inputs||[]).forEach(inp=>{
    const v = (inp.key in inputValues) ? inputValues[inp.key] : inp.default;
    V[inp.cell]=v;
  });
  const ctxBase=buildCtx(V);

  // compile formulas
  const formulas=(t.calc_cells||[]).map(c=>({cell:c.cell, fn:makeEvaluator(c.formula)}));

  // iterate a few times to resolve dependencies
  for(let iter=0; iter<25; iter++){
    let changed=false;
    for(const f of formulas){
      try{
        const val=f.fn(buildCtx(V));
        const prev=V[f.cell];
        if(val!==prev && !(Number.isNaN(val) && Number.isNaN(prev))){
          V[f.cell]=val;
          changed=true;
        }
      }catch(e){
        // keep previous if error
      }
    }
    if(!changed) break;
  }

  const resCell=t.kpi?.result_cell || "B19";
  const statCell=t.kpi?.status_cell || "B20";
  return {V, result: V[resCell], status: V[statCell]};
}

function renderTool(id){
  setView(toolEl);
  const t=(DB.tools||[]).find(x=>x.id===id);
  if(!t) return;

  const inputs=(t.inputs||[]);
  toolEl.innerHTML = `
    <div class="card">
      <h3>${esc(t.name || t.id)}</h3>
      <div class="badge">${esc(t.domain)} • ${esc(t.id)}</div>
      ${t.notes?`<div><small class="muted">${esc(t.notes)}</small></div>`:""}
      <div class="muted code">Feuille Excel: ${esc(t.sheet || "-")}</div>
    </div>

    <div class="card" id="form">
      <h3>Entrées</h3>
      ${inputs.length? inputs.map(inp=>`
        <div class="row">
          <div>
            <div><b>${esc(inp.label)}</b></div>
            <div class="badge">${esc(inp.unit || "-")}</div>
          </div>
          <input inputmode="decimal" type="number" step="any" value="${inp.default ?? ""}" data-key="${esc(inp.key)}">
        </div>
      `).join("") : `<div class="muted">Aucune entrée détectée dans l’Excel (A7:C12).</div>`}
      <button class="primary" id="calc">Calculer</button>
      <div><small class="muted">V2: calculs basiques via formules Excel (colonne B, lignes 13→30).</small></div>
    </div>

    <div class="card" id="result">
      <h3>KPI</h3>
      <div class="row"><div><b>Résultat clé</b></div><div class="badge">—</div></div>
      <div class="row"><div><b>Statut</b></div><div class="badge">—</div></div>
    </div>
  `;

  $("calc").onclick=()=>{
    const vals={};
    document.querySelectorAll("#form input[data-key]").forEach(i=>{
      vals[i.dataset.key]=Number(i.value);
    });
    const out=runTool(t, vals);
    const r = (out.result===undefined) ? "—" : out.result;
    const s = (out.status===undefined) ? "—" : out.status;
    $("result").innerHTML = `
      <h3>KPI</h3>
      <div class="row"><div><b>Résultat clé</b></div><div class="badge">${esc(r)}</div></div>
      <div class="row"><div><b>Statut</b></div><div class="badge">${esc(s)}</div></div>
    `;
  };
}

searchEl.addEventListener("input", ()=>{
  const q=searchEl.value;
  if(!toolsEl.classList.contains("hidden")){
    // keep current list view by reusing last renderer in history if possible
    const title = toolsEl.querySelector(".card h3")?.textContent || "";
    const domain = (title==="📚 Tous les outils") ? null : title;
    renderToolsList(domain, q);
    historyStack = historyStack.slice(0,-0);
  }else if(toolEl.classList.contains("hidden")){
    renderHome(q);
  }
});

init();
