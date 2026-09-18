const MODEL = "gpt-5.6-luna";
const MARKET_DOMAINS = ["autoscout24.it","subito.it","automobile.it"];

export default {
  async fetch(request, env) {
    const u = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });

    if (u.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "FutureCar API",
        ai: !!env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL || MODEL,
        search: !!env.OPENAI_API_KEY,
        mode: "live-web"
      });
    }

    if (u.pathname === "/api/search" && request.method === "POST") {
      if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY non configurata sul Worker futurecar." }, 500);
      let body;
      try { body = await request.json(); } catch { return json({ error: "JSON non valido." }, 400); }
      const filters = body?.filters || {};

      const response = await openai(env, {
        model: env.OPENAI_MODEL || MODEL,
        tools: [{
          type: "web_search",
          search_context_size: "high",
          filters: { allowed_domains: MARKET_DOMAINS },
          user_location: { type: "approximate", country: "IT", region: "Sardegna", city: "Cagliari" }
        }],
        tool_choice: "required",
        input: [{
          role: "system",
          content: [{
            type: "input_text",
            text: "Sei il motore di ricerca di FutureCar. Devi trovare ANNUNCI DI AUTO REALI attualmente pubblicati sul web. Cerca esclusivamente sui marketplace indicati nei domini consentiti. NON inventare auto, prezzi, chilometri, date, allestimenti o URL. Se un campo non è visibile nella fonte usa null o stringa vuota. Restituisci solo annunci che hai effettivamente trovato nei risultati della ricerca web. Preferisci la pagina del singolo annuncio, non la home del marketplace. Elimina duplicati. Applica i filtri richiesti. Se nessun annuncio soddisfa i filtri, restituisci una lista vuota."
          }]
        },{
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({
              filters,
              requestedSources: MARKET_DOMAINS,
              instruction: "Trova fino a 20 annunci reali in Italia. Ordina per aderenza ai filtri e alle priorità dell'utente."
            })
          }]
        }],
        text: {
          format: {
            type: "json_schema",
            name: "futurecar_search",
            strict: true,
            schema: {
              type:"object", additionalProperties:false,
              properties:{
                listings:{type:"array",items:{
                  type:"object",additionalProperties:false,
                  properties:{
                    title:{type:"string"},price:{type:["number","null"]},year:{type:["number","null"]},
                    km:{type:["number","null"]},fuel:{type:"string"},gearbox:{type:"string"},
                    cylinders:{type:["number","null"]},location:{type:"string"},source:{type:"string"},
                    url:{type:"string"},meta:{type:"string"},tags:{type:"array",items:{type:"string"}}
                  },
                  required:["title","price","year","km","fuel","gearbox","cylinders","location","source","url","meta","tags"]
                }},
                sources:{type:"array",items:{type:"string"}},
                note:{type:"string"}
              },
              required:["listings","sources","note"]
            }
          }
        }
      });

      if (!response.ok) return openaiError(response);
      const data = await safeJson(response);
      try {
        const text = extractOutputText(data);
        const result = JSON.parse(text);
        return json({ ok:true, listings:result.listings, sources:result.sources?.length||0, note:result.note });
      } catch {
        return json({ error:"Risposta di ricerca non valida dal servizio AI." },502);
      }
    }

    if (u.pathname === "/api/analyze" && request.method === "POST") {
      if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY non configurata sul Worker futurecar." }, 500);
      let body;
      try { body = await request.json(); } catch { return json({ error: "JSON non valido." }, 400); }

      const response = await openai(env, {
        model: env.OPENAI_MODEL || MODEL,
        tools: [{
          type:"web_search",
          search_context_size:"high",
          filters:{allowed_domains:[
            "autoscout24.it","subito.it","automobile.it",
            "toyota.it","honda.it","mazda.it","quattroruote.it","alvolante.it",
            "motori.it","unrae.it"
          ]},
          user_location:{type:"approximate",country:"IT",region:"Sardegna",city:"Cagliari"}
        }],
        tool_choice:"required",
        input:[
          {role:"system",content:[{type:"input_text",text:"Sei FutureCar AI Analyst. Analizza l'auto indicata usando anche ricerca web. Non inventare dati. Distingui fatti verificati, stime e informazioni riportate da terzi. Verifica identità del modello/motore, distribuzione, cilindri, turbo, DPF/EGR/AdBlue, cambio, difetti ricorrenti, richiami, manutenzione, consumi e costi quando le fonti lo consentono. Se un dato non è verificabile dichiaralo. Fornisci URL delle fonti consultate."}]},
          {role:"user",content:[{type:"input_text",text:JSON.stringify(body)}]}
        ],
        text:{
          format:{
            type:"json_schema",name:"futurecar_analysis",strict:true,
            schema:{
              type:"object",additionalProperties:false,
              properties:{
                summary:{type:"string"},identity:{type:"string"},
                strengths:{type:"array",items:{type:"string"}},
                risks:{type:"array",items:{type:"string"}},
                sellerQuestions:{type:"array",items:{type:"string"}},
                facts:{type:"array",items:{type:"string"}},
                estimates:{type:"array",items:{type:"string"}},
                confidence:{type:"string",enum:["alta","media","bassa"]},
                nextChecks:{type:"array",items:{type:"string"}},
                sources:{type:"array",items:{type:"object",additionalProperties:false,properties:{title:{type:"string"},url:{type:"string"}},required:["title","url"]}}
              },
              required:["summary","identity","strengths","risks","sellerQuestions","facts","estimates","confidence","nextChecks","sources"]
            }
          }
        }
      });
      if (!response.ok) return openaiError(response);
      const data = await safeJson(response);
      try { return json({ok:true,analysis:JSON.parse(extractOutputText(data))}); }
      catch { return json({error:"L'AI ha restituito un formato non valido.",debug:data?.output?.map(x=>x?.type||"unknown")||[]},502); }
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const path = u.pathname === "/" ? "/index.html" : u.pathname;
      const cleanPath = path.replace(/^\/+/, "");
      const asset = await fetch("https://raw.githubusercontent.com/Arst-calcolo-tratte/FutureCar/main/" + cleanPath, {
        headers: { "Accept": "text/plain" }
      });
      if (!asset.ok) return new Response("FutureCar: file non trovato.", { status: 404 });
      const headers = new Headers(asset.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("Content-Type", mime(cleanPath));
      return new Response(asset.body, { status: asset.status, headers });
    }

    return json({error:"Endpoint non trovato."},404);
  }
};

async function openai(env, payload) {
  return fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{
      "Authorization":"Bearer " + env.OPENAI_API_KEY,
      "Content-Type":"application/json"
    },
    body:JSON.stringify(payload)
  });
}
async function safeJson(response) {
  try { return await response.json(); } catch { return {}; }
}
function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;
  const parts = [];
  for (const item of (data?.output || [])) {
    for (const c of (item?.content || [])) {
      if (typeof c?.text === "string" && c.text.trim()) parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}
async function openaiError(response) {
  const data=await safeJson(response);
  return json({error:data?.error?.message||"Errore OpenAI.",type:data?.error?.type||null},response.status||502);
}
function cors(){
  return {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type"
  };
}
function mime(path) {
  const ext = path.split(".").pop().toLowerCase();
  return ({
    html:"text/html; charset=utf-8",
    css:"text/css; charset=utf-8",
    js:"application/javascript; charset=utf-8",
    webmanifest:"application/manifest+json; charset=utf-8",
    json:"application/json; charset=utf-8",
    svg:"image/svg+xml",
    png:"image/png",
    ico:"image/x-icon"
  })[ext] || "application/octet-stream";
}
function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{"Content-Type":"application/json; charset=utf-8",...cors()}
  });
}
