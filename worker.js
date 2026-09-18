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
        const result = JSON.parse(data.output_text);
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
      try { return json({ok:true,analysis:JSON.parse(data.output_text)}); }
      catch { return json({error:"L'AI ha restituito un formato non valido."},502); }
    }

    if (request.method === "GET" || request.method === "HEAD") {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("FutureCar: asset binding non configurato.",{status:500});
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
function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{"Content-Type":"application/json; charset=utf-8",...cors()}
  });
}
