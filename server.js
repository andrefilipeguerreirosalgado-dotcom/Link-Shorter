const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function generateCode(length = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function normalizeUrl(url) {
  const text = String(url || "").trim();
  if (!text) return null;

  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    try {
      const parsed = new URL("https://" + text);
      return parsed.toString();
    } catch {
      return null;
    }
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/shorten", async (req, res) => {
  const longUrl = normalizeUrl(req.body?.url);
  const customCode = String(req.body?.code || "").trim();
  const userId = String(req.body?.user_id || "").trim();

  if (!longUrl) {
    return res.status(400).json({ error: "Invalid URL." });
  }

  if (customCode && !/^[a-zA-Z0-9_-]+$/.test(customCode)) {
    return res.status(400).json({ error: "Custom code contains invalid characters." });
  }

  let code = customCode || generateCode(6);

  for (let attempts = 0; attempts < 8; attempts++) {
    const { data: existing, error: checkError } = await supabase
      .from("links")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (checkError) {
      return res.status(500).json({ error: "Database error while checking code." });
    }

    if (existing) {
      if (customCode) {
        return res.status(400).json({ error: "That code is already in use." });
      }
      code = generateCode(6);
      continue;
    }

    const { error: insertError } = await supabase.from("links").insert({
      code,
      long_url: longUrl,
      user_id: userId || null
    });

    if (insertError) {
      return res.status(500).json({ error: "Database error while saving link." });
    }

    return res.json({
      short: `${req.protocol}://${req.get("host")}/${code}`,
      code
    });
  }

  return res.status(500).json({ error: "Could not generate a unique code." });
});

app.get("/my-links", async (req, res) => {
  const userId = String(req.query.user_id || "").trim();

  if (!userId) {
    return res.status(400).json({ error: "Missing user_id." });
  }

  const { data, error } = await supabase
    .from("links")
    .select("code, long_url, clicks, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: "Database error while loading links." });
  }

  res.json(data || []);
});

app.delete("/delete/:code", async (req, res) => {
  const userId = String(req.body?.user_id || "").trim();
  const code = String(req.params.code || "").trim();

  if (!userId) {
    return res.status(400).json({ error: "Missing user_id." });
  }

  const { error } = await supabase
    .from("links")
    .delete()
    .eq("code", code)
    .eq("user_id", userId);

  if (error) {
    return res.status(500).json({ error: "Database error while deleting link." });
  }

  res.json({ success: true });
});

app.get("/:code", async (req, res) => {
  const code = String(req.params.code || "").trim();

  const { data, error } = await supabase
    .from("links")
    .select("long_url, clicks")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    return res.status(500).send("Database error.");
  }

  if (!data) {
    return res.status(404).send("Link not found.");
  }

  await supabase
    .from("links")
    .update({ clicks: (data.clicks || 0) + 1 })
    .eq("code", code);

  res.redirect(data.long_url);
});

app.listen(PORT, () => {
  console.log(`Link Me Now is running on port ${PORT}`);
});
