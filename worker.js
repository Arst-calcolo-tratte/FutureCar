/* FutureCar — Cloudflare Worker (API + fallback asset statici)
   Gli asset statici sono serviti da Workers Static Assets ([assets] in wrangler.toml).
   Il Worker viene invocato per primo solo sulle rotte /api/*. */

const DEFAULT_MODEL = "gpt-5.6-luna";
const MARKET_DOMAINS = ["autoscout24.it", "subito.it", "automobile.it"];
const RESEARCH_DOMAINS = [...MARKET_DOMAINS,"toyota.it","honda.it","mazda.it","quattroruote.it","alvolante.it","motori.it","unrae.it"];
const OPENAI_TIMEOUT_MS = 170000;
const MAX_BODY_BYTES = 120000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:cors()});
    if (url.pathname === "/api/health") return json({ok:true,service:"FutureCar API",ai:Boolean(env.OPENAI_API_KEY),model:env.OPENAI_MODEL||DEFAULT_MODEL,mode:"live-web"});
    if (url.pathname === "/api/search") { if(request.method!=="POST") return json({error:"Usa POST su /api/search."},405); return handleSearch(request,env); }
    if (url.pathname === "/api/analyze") { if(request.method!=="POST") return json({error:"Usa POST su /api/analyze."},405); return handleAnalyze(request,env); }
    if (url.pathname.startsWith("/api/")) return json({error:"Endpoint non trovato."},404);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("FutureCar: risorsa non trovata.",{status:404});
  }
};

async function handleSearch(request,env){
  if(!env.OPENAI_API_KEY)return json({error:"OPENAI_API_KEY non configurata sul Worker futurecar."},500);
  const body=await readJson(request); if(body.error)return json({error:body.error},body.status);
  const filters=sanitizeFilters(body.data?.filters||{});
  const payload={model:env.OPENAI_MODEL||DEFAULT_MODEL,tools:[{type:"web_search",search_context_size:env.SEARCH_CONTEXT_SIZE||"medium",filters:{allowed_domains:MARKET_DOMAINS},user_location:{type:"approximate",country:"IT",region:env.USER_REGION||"Sardegna",city:env.USER_CITY||"Cagliari"}}],tool_choice:"auto",input:[
    {role:"system",content:[{type:"input_text",text:"Sei il motore di ricerca di FutureCar. Devi trovare ANNUNCI DI AUTO REALI attualmente pubblicati sul web, cercando esclusivamente sui domini consentiti. NON inventare auto, prezzi, chilometri, date, allestimenti o URL. Ogni URL deve essere una pagina di annuncio realmente vista nei risultati della ricerca web, non la home del marketplace e non un indirizzo ricostruito. Se un campo non è visibile nella fonte usa null (numeri) o stringa vuota (testo). Elimina i duplicati, applica i filtri richiesti e, se nessun annuncio li soddisfa, restituisci una lista vuota."}]},
    {role:"user",content:[{type:"input_text",text:JSON.stringify({filters,requestedSources:MARKET_DOMAINS,instruction:"Trova fino a 20 annunci reali in Italia. Ordina per aderenza ai filtri e alle priorità dell'utente."})}]}
  ],text:{format:{type:"json_schema",name:"futurecar_search",strict:true,schema:{type:"object",additionalProperties:false,properties:{listings:{type:"array",items:{type:"object",additionalProperties:false,properties:{title:{type:"string"},price:{type:["number","null"]},year:{type:["number","null"]},km:{type:["number","null"]},fuel:{type:"string"},gearbox:{type:"string"},cylinders:{type:["number","null"]},location:{type:"string"},source:{type:"string"},url:{type:"string"},meta:{type:"string"},tags:{type:"array",items:{type:"string"}}},required:["title","price","year","km","fuel","gearbox","cylinders","location","source","url","meta","tags"]}},sources:{type:"array",items:{type:"string"}},note:{type:"string"}},required:["listings","sources","note"]}}}};
  const call=await openai(env,payload); if(call.error)return json({error:call.error},call.status);
  let result; try{result=parseJsonObject(extractOutputText(call.data));}catch(e){return json({error:"Risposta di ricerca non valida dal servizio AI.",detail:e.message},502);}
  const listings=validateListings(result.listings,filters),dropped=(Array.isArray(result.listings)?result.listings.length:0)-listings.length;
  let note=typeof result.note==="string"?result.note:""; if(dropped>0)note+=(note?" ":"")+dropped+" risultati scartati perché non verificabili sulle fonti consentite."; if(!listings.length&&!note)note="Nessun annuncio verificabile per questi filtri.";
  return json({ok:true,listings,sources:Array.isArray(result.sources)?result.sources.length:0,sourceList:Array.isArray(result.sources)?result.sources.slice(0,30):[],note});
}
async function handleAnalyze(request,env){
  if(!env.OPENAI_API_KEY)return json({error:"OPENAI_API_KEY non configurata sul Worker futurecar."},500);
  const body=await readJson(request); if(body.error)return json({error:body.error},body.status);
  const listing=body.data?.listing; if(!listing||typeof listing!=="object")return json({error:"Nessun annuncio da analizzare."},400);
  const payload={model:env.OPENAI_MODEL||DEFAULT_MODEL,tools:[{type:"web_search",search_context_size:env.SEARCH_CONTEXT_SIZE||"medium",filters:{allowed_domains:RESEARCH_DOMAINS},user_location:{type:"approximate",country:"IT",region:env.USER_REGION||"Sardegna",city:env.USER_CITY||"Cagliari"}}],tool_choice:"auto",input:[
    {role:"system",content:[{type:"input_text",text:"Sei FutureCar AI Analyst. Analizza l'auto indicata usando anche la ricerca web. Non inventare dati. Distingui fatti verificati, stime e informazioni riportate da terzi. Verifica identità del modello/motore, distribuzione, cilindri, turbo, DPF/EGR/AdBlue, cambio, difetti ricorrenti, richiami, manutenzione, consumi e costi quando le fonti lo consentono. Se un dato non è verificabile dichiaralo esplicitamente. Riporta gli URL delle fonti consultate. Rispondi in italiano."}]},
    {role:"user",content:[{type:"input_text",text:JSON.stringify({listing,userPriorities:typeof body.data.userPriorities==="string"?body.data.userPriorities:null})}]}
  ],text:{format:{type:"json_schema",name:"futurecar_analysis",strict:true,schema:{type:"object",additionalProperties:false,properties:{summary:{type:"string"},identity:{type:"string"},strengths:{type:"array",items:{type:"string"}},risks:{type:"array",items:{type:"string"}},sellerQuestions:{type:"array",items:{type:"string"}},facts:{type:"array",items:{type:"string"}},estimates:{type:"array",items:{type:"string"}},confidence:{type:"string",enum:["alta","media","bassa"]},nextChecks:{type:"array",items:{type:"string"}},sources:{type:"array",items:{type:"object",additionalProperties:false,properties:{title:{type:"string"},url:{type:"string"}},required:["title","url"]}}},required:["summary","identity","strengths","risks","sellerQuestions","facts","estimates","confidence","nextChecks","sources"]}}}};
  const call=await openai(env,payload); if(call.error)return json({error:call.error},call.status);
  try{return json({ok:true,analysis:parseJsonObject(extractOutputText(call.data))});}catch(e){return json({error:"L'AI ha restituito un formato non valido.",detail:e.message},502);}
}
async function openai(env,payload){
  let response;
  try{response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(OPENAI_TIMEOUT_MS)});}
  catch(e){const timeout=e&&(e.name==="TimeoutError"||e.name==="AbortError");return{error:timeout?"Il servizio AI non ha risposto in tempo. Riprova con filtri più stretti.":"Impossibile contattare il servizio AI.",status:timeout?504:502};}
  const data=await safeJson(response);
  if(!response.ok)return{error:data?.error?.message||`Errore OpenAI (${response.status}).`,status:response.status===401||response.status===429?response.status:502};
  if(data?.status==="incomplete")return{error:"Risposta AI incompleta ("+(data?.incomplete_details?.reason||"motivo non indicato")+").",status:502};
  return{data};
}
function extractOutputText(data){
  if(typeof data?.output_text==="string"&&data.output_text.trim())return data.output_text.trim();
  const parts=[];
  for(const item of data?.output||[]){if(item?.type&&item.type!=="message")continue;for(const c of item?.content||[]){if(c?.type==="refusal"&&c.refusal)throw new Error("Richiesta rifiutata dal modello: "+c.refusal);if(c?.type==="output_text"&&typeof c.text==="string"&&c.text.trim())parts.push(c.text);}}
  return parts.join("\n").trim();
}
function parseJsonObject(text){
  if(!text)throw new Error("Risposta AI vuota.");
  const clean=text.replace(/^\s*\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`\s*$/,"").trim();
  try{return JSON.parse(clean);}catch{}
  const start=clean.indexOf("{"),end=clean.lastIndexOf("}");
  if(start>=0&&end>start)return JSON.parse(clean.slice(start,end+1));
  throw new Error("JSON AI non trovato.");
}
function sanitizeFilters(raw){
  const num=(v,min,max)=>{const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;};
  const str=(v,max)=>(typeof v==="string"&&v.trim()?v.trim().slice(0,max):null);
  return{q:str(raw.q,120),maxPrice:num(raw.maxPrice,0,5000000),minYear:num(raw.minYear,1950,2100),maxKm:num(raw.maxKm,0,2000000),fuel:str(raw.fuel,30),gearbox:str(raw.gearbox,30),cylinders:str(raw.cylinders,60),annualKm:num(raw.annualKm,0,500000),location:str(raw.location,80),priorities:str(raw.priorities,1000)};
}
function validateListings(listings,filters){
  if(!Array.isArray(listings))return[];
  const seen=new Set(),out=[];
  for(const item of listings){
    if(!item||typeof item!=="object"||!item.title||typeof item.title!=="string")continue;
    let host;
    try{
      const u=new URL(String(item.url));
      if(u.protocol!=="https:"&&u.protocol!=="http:")continue;
      host=u.hostname.replace(/^www\./,"").toLowerCase();
      if(!MARKET_DOMAINS.some(d=>host===d||host.endsWith("."+d)))continue;
      if(u.pathname==="/"||u.pathname==="")continue;
      item.url=u.href;
    }catch{continue;}
    const key=item.url.split("?")[0].toLowerCase();
    if(seen.has(key))continue; seen.add(key);
    const price=Number(item.price),year=Number(item.year),km=Number(item.km);
    if(filters.maxPrice&&Number.isFinite(price)&&price>filters.maxPrice*1.02)continue;
    if(filters.minYear&&Number.isFinite(year)&&year<filters.minYear)continue;
    if(filters.maxKm&&Number.isFinite(km)&&km>filters.maxKm*1.05)continue;
    if(!item.source)item.source=host;
    if(!Array.isArray(item.tags))item.tags=[];
    out.push(item); if(out.length>=20)break;
  }
  return out;
}
async function readJson(request){
  const len=Number(request.headers.get("content-length")||0);
  if(len>MAX_BODY_BYTES)return{error:"Richiesta troppo grande.",status:413};
  try{const text=await request.text();if(text.length>MAX_BODY_BYTES)return{error:"Richiesta troppo grande.",status:413};return{data:JSON.parse(text||"{}")};}
  catch{return{error:"JSON non valido.",status:400};}
}
async function safeJson(response){try{return await response.json();}catch{return{};}}
function cors(){return{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"86400"};}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...cors()}});}
