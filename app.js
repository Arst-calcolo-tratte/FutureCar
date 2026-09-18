(() => {
"use strict";
const $ = id => document.getElementById(id);
const API_BASE = String(window.FUTURECAR_API_BASE || "").replace(/\/+$/,"");
const FIELDS = ["q","price","year","km","fuel","gear","cyl","annual","location","priority"];
const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const eur = v => Number.isFinite(Number(v)) && Number(v)>0 ? Number(v).toLocaleString("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0}) : "Prezzo non indicato";
function filters(){
 const num=id=>$(id).value!==""?Number($(id).value):null, txt=id=>$(id).value.trim()||null;
 const cm={avoid3:"escludere i motori 3 cilindri",min4:"almeno 4 cilindri",exact4:"esattamente 4 cilindri",exact6:"esattamente 6 cilindri"};
 return {q:txt("q"),maxPrice:num("price"),minYear:num("year"),maxKm:num("km"),fuel:txt("fuel"),gearbox:txt("gear"),cylinders:cm[$("cyl").value]||null,annualKm:num("annual"),location:txt("location"),priorities:txt("priority")};
}
function status(t,k=""){const e=$("status");e.textContent=t;e.className=k?"state-"+k:""}
async function api(path,body,ms=180000){
 const c=new AbortController(),tm=setTimeout(()=>c.abort(),ms);
 try{const r=await fetch(API_BASE+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:c.signal});clearTimeout(tm);let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||"Errore server "+r.status);return d}
 catch(e){clearTimeout(tm);if(e.name==="AbortError")throw Error("Tempo scaduto: la ricerca web non ha risposto.");throw e}
}
function render(xs){
 const box=$("cards");box.innerHTML="";
 if(!xs.length){box.innerHTML='<div class="panel empty"><h3>Nessun annuncio reale trovato</h3><p class="meta">Prova ad allargare i filtri.</p></div>';return}
 xs.forEach((x,i)=>{const a=document.createElement("article");a.className="card";const tags=Array.isArray(x.tags)?x.tags.slice(0,6):[];
 a.innerHTML='<span class="meta">'+esc(x.source||"Fonte web")+' · annuncio reale</span><h3>'+esc(x.title)+'</h3><div class="meta">'+esc(x.meta||"")+'</div><div class="price">'+eur(x.price)+'</div><div>'+tags.map(t=>'<span class="tag">'+esc(t)+'</span>').join("")+'</div><p class="meta" style="margin-top:14px">'+esc(x.location||"")+'</p><div class="card-actions"><a class="btn" href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">Apri annuncio →</a> <button class="btn ghost-btn" data-ai="'+i+'">Analizza con AI</button></div>';
 box.appendChild(a);a.querySelector("[data-ai]").onclick=()=>analyze(x);
 });}
async function search(){
 const f=filters();if(!f.q&&!f.maxPrice&&!f.minYear&&!f.maxKm&&!f.fuel&&!f.gearbox&&!f.location){status("Inserisci almeno un criterio di ricerca.","bad");return}
 const b=$("searchBtn");b.disabled=true;b.innerHTML='<span class="spinner"></span> Ricerca web…';status("Ricerca annunci reali in corso… può richiedere più di un minuto.","wait");
 try{const d=await api("/api/search",{filters:f});const xs=Array.isArray(d.listings)?d.listings:[];render(xs);$("count").textContent=xs.length+" annunci reali verificati · "+(d.sources||0)+" fonti consultate";$("results").hidden=false;status(d.note||"Ricerca completata.",xs.length?"ok":"");$("results").scrollIntoView({behavior:"smooth",block:"start"})}
 catch(e){status(e.message,"bad")}finally{b.disabled=false;b.innerHTML='Cerca e analizza <span aria-hidden="true">→</span>'}
}
async function analyze(listing){
 status("Analisi AI con verifica web in corso…","wait");
 try{const d=await api("/api/analyze",{listing,userPriorities:$("priority").value.trim()||null});const a=d.analysis||{};$("aiTitle").textContent="Analisi — "+(listing.title||"Auto");$("aiPanel").innerHTML='<span class="badge">Confidenza: '+esc(a.confidence||"n/d")+'</span><h3>'+esc(a.summary||"")+'</h3><p><b>Identificazione:</b> '+esc(a.identity||"")+'</p><div class="ai-grid"><div><h4>Punti forti</h4>'+list(a.strengths)+'</div><div><h4>Rischi</h4>'+list(a.risks)+'</div><div><h4>Fatti verificati</h4>'+list(a.facts)+'</div><div><h4>Stime</h4>'+list(a.estimates)+'</div><div><h4>Domande al venditore</h4>'+list(a.sellerQuestions)+'</div><div><h4>Controlli successivi</h4>'+list(a.nextChecks)+'</div></div><p class="meta">Fonti: '+((a.sources||[]).map(s=>'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title||s.url)+'</a>').join(" · ")||"nessuna")+'</p>';$("aiOutput").hidden=false;$("aiOutput").scrollIntoView({behavior:"smooth",block:"start"});status("Analisi completata.","ok")}
 catch(e){status(e.message,"bad")}
}
function list(a){return Array.isArray(a)&&a.length?"<ul>"+a.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>":'<p class="meta">Nessun elemento.</p>'}
$("searchBtn").onclick=search;
$("resetBtn").onclick=()=>{FIELDS.forEach(id=>$(id).value="");status("Filtri azzerati.");try{localStorage.removeItem("futurecar.filters.v1")}catch{}};
FIELDS.forEach(id=>$(id).addEventListener("change",()=>{try{localStorage.setItem("futurecar.filters.v1",JSON.stringify(Object.fromEntries(FIELDS.map(k=>[k,$(k).value]))))}catch{}}));
$("homeBtn").onclick=()=>{$("status").textContent="Su iPhone: Safari → Condividi → Aggiungi alla schermata Home."};
async function health(){try{const r=await fetch(API_BASE+"/api/health",{cache:"no-store"}),d=await r.json();$("apiPill").textContent=d.ai?"SERVIZIO ATTIVO":"CHIAVE AI MANCANTE";$("apiPill").classList.add(d.ai?"ok":"bad")}catch{$("apiPill").textContent="SERVIZIO NON RAGGIUNGIBILE";$("apiPill").classList.add("bad")}}
try{const d=JSON.parse(localStorage.getItem("futurecar.filters.v1")||"{}");FIELDS.forEach(k=>{if(typeof d[k]==="string")$(k).value=d[k]})}catch{}
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
health();
})();