const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function gerarCodigo(tamanho = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let codigo = "";
  for (let i = 0; i < tamanho; i++) {
    codigo += chars[Math.floor(Math.random() * chars.length)];
  }
  return codigo;
}

function normalizarUrl(url) {
  const texto = String(url || "").trim();
  if (!texto) return null;

  try {
    const parsed = new URL(texto);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    try {
      const parsed = new URL("https://" + texto);
      return parsed.toString();
    } catch {
      return null;
    }
  }
}

app.post("/encurtar", async (req, res) => {
  const longUrl = normalizarUrl(req.body?.url);

  if (!longUrl) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  for (let tentativas = 0; tentativas < 8; tentativas++) {
    const code = gerarCodigo(6);

    const { error } = await supabase.from("links").insert({
      code,
      long_url: longUrl,
    });

    if (!error) {
      return res.json({
        short: `${req.protocol}://${req.get("host")}/${code}`,
        code,
      });
    }

    if (error.code !== "23505") {
      console.error("Erro ao inserir:", error);
      return res.status(500).json({ error: "Erro to storage link" });
    }
  }

  return res.status(500).json({ error: "Erro 500" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/:code", async (req, res) => {
  const code = req.params.code;

  const { data, error } = await supabase
    .from("links")
    .select("long_url, clicks")
    .eq("code", code)
    .single();

  if (error || !data) {
    return res.status(404).send("Link not found");
  }

  await supabase
    .from("links")
    .update({ clicks: (data.clicks || 0) + 1 })
    .eq("code", code);

  return res.redirect(data.long_url);
});

app.listen(PORT, () => {
  console.log(`Servidor em http://localhost:${PORT}`);
});
