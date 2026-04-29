app.post("/encurtar", async (req, res) => {
  const longUrl = normalizarUrl(req.body?.url);
  const customCode = req.body?.code;
  const userId = req.body?.user_id;

  if (!longUrl) {
    return res.status(400).json({ error: "URL inválido" });
  }

  let code = customCode || gerarCodigo(6);

  // verificar se já existe
  const { data: exists } = await supabase
    .from("links")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (exists) {
    return res.status(400).json({ error: "Código já existe" });
  }

  const { error } = await supabase.from("links").insert({
    code,
    long_url: longUrl,
    user_id: userId || null
  });

  if (error) {
    return res.status(500).json({ error: "Erro ao guardar link" });
  }

  res.json({
    short: `${req.protocol}://${req.get("host")}/${code}`
  });
});
