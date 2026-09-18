const SITE_ORIGIN="https://raw.githubusercontent.com/Arst-calcolo-tratte/FutureCar/main/";

export default {
  async fetch(request, env) {
    const u = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });

    if (u.pathname === "/api/health") {
      return json({
        ok: true,
        service: "FutureCar API",
        ai: !!env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL || "gpt-5.6-luna"
      });
    }

    if (u.pathname === "/api/analyze" && request.method === "POST") {
      if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY non configurata sul backend." }, 500);

      let body;
      try { body = await request.json(); }
      catch { return json({ error: "JSON non valido." }, 400); }

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-5.6-luna",
          input: [
            { role: "system", content: [{ type: "input_text", text: "Sei FutureCar AI Analyst. Analizza auto in modo fattuale. Non inventare dati. Se un dato non è verificabile, dichiaralo. Separa fatti, stime e testimonianze." }] },
            { role: "user", content: [{ type: "input_text", text: JSON.stringify(body) }] }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "futurecar_analysis",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  summary:{type:"string"}, identity:{type:"string"},
                  strengths:{type:"array",items:{type:"string"}},
                  risks:{type:"array",items:{type:"string"}},
                  sellerQuestions:{type:"array",items:{type:"string"}},
                  facts:{type:"array",items:{type:"string"}},
                  estimates:{type:"array",items:{type:"string"}},
                  confidence:{type:"string",enum:["alta","media","bassa"]},
                  nextChecks:{type:"array",items:{type:"string"}}
                },
                required:["summary","identity","strengths","risks","sellerQuestions","facts","estimates","confidence","nextChecks"]
              }
            }
          }
        })
      });

      let data;
      try { data = await response.json(); }
      catch { return json({ error: "Risposta non valida dal servizio AI." }, 502); }

      if (!response.ok) return json({ error: data?.error?.message || "Errore OpenAI.", type: data?.error?.type || null }, response.status);

      try { return json({ ok: true, analysis: JSON.parse(data.output_text) }); }
      catch { return json({ error: "L'AI ha restituito un formato non valido." }, 502); }
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const path = u.pathname === "/" ? "/index.html" : u.pathname;
      const cleanPath = path.replace(/^\/+/, "");
      const asset = await fetch(SITE_ORIGIN + cleanPath);
      if (!asset.ok) return new Response("FutureCar: file non trovato.", { status: 404 });

      const headers = new Headers(asset.headers);
      headers.set("Cache-Control", "no-cache");
      headers.set("Content-Type", mime(cleanPath));
      return new Response(asset.body, { status: asset.status, headers });
    }

    return json({ error: "Endpoint non trovato." }, 404);
  }
};

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

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors() }
  });
}
