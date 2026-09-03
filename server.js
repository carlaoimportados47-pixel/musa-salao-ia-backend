const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

// Teste do servidor
app.get("/", (req, res) => {
  res.json({
    status: "online",
    projeto: "Musa Salão IA",
    mensagem: "Backend da Musa funcionando ✨"
  });
});

// IA DA MUSA
app.post("/musa", async (req, res) => {
  try {
    const { imagem, ocasiao, estilo, descricao } = req.body;

    if (!imagem) {
      return res.status(400).json({
        erro: "Envie uma imagem para a Musa."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        erro: "GEMINI_API_KEY não configurada."
      });
    }

    // Aceita imagem em formato data:image/jpeg;base64,...
    const match = imagem.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
    );

    if (!match) {
      return res.status(400).json({
        erro: "Formato de imagem inválido."
      });
    }

    const mimeType = match[1];
    const base64 = match[2];

    const prompt = `
Você é Musa, uma consultora virtual especialista em maquiagem e beleza.

A cliente enviou uma fotografia do próprio rosto para receber uma simulação personalizada.

Preferências:
Ocasião: ${ocasiao || "não informada"}
Estilo: ${estilo || "não informado"}
Pedido da cliente: ${descricao || "não informado"}

Analise apenas características visuais úteis para maquiagem, como formato aparente do rosto, iluminação, contraste e características visíveis de olhos, lábios e pele.

Crie uma sugestão de maquiagem personalizada que preserve a identidade e as características naturais da pessoa.

Responda em português do Brasil, de maneira feminina, elegante e objetiva.

Retorne:
1. Nome da make
2. Pele
3. Olhos
4. Lábios
5. Blush/contorno/iluminador
6. Paleta de cores sugerida
7. Uma descrição curta do resultado visual
`;

    const resposta = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64
                  }
                }
              ]
            }
          ]
        })
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error("Erro Gemini:", dados);

      return res.status(resposta.status).json({
        erro: "A Musa não conseguiu analisar a imagem.",
        detalhes: dados
      });
    }

    const resultado =
      dados?.candidates?.[0]?.content?.parts
        ?.map((parte) => parte.text || "")
        .join("\n")
        .trim() || "Não foi possível gerar a recomendação.";

    res.json({
      sucesso: true,
      resultado
    });

  } catch (erro) {
    console.error("Erro Musa:", erro);

    res.status(500).json({
      erro: "Erro interno ao executar a Musa."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Musa Salão IA online na porta ${PORT}`);
});
