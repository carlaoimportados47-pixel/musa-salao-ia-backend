const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));

app.get("/", (req, res) => {
  res.json({
    status: "online",
    projeto: "Musa Salão IA",
    mensagem: "Backend da Musa funcionando ✨"
  });
});

app.post("/musa", async (req, res) => {
  try {
    const {
      imagem,
      ocasiao,
      estilo,
      descricao,
      consentimento
    } = req.body;

    if (!consentimento) {
      return res.status(400).json({
        erro: "É necessário consentimento para utilizar a imagem."
      });
    }

    if (!imagem) {
      return res.status(400).json({
        erro: "Nenhuma imagem foi enviada."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        erro: "GEMINI_API_KEY não configurada no servidor."
      });
    }

    // Recebe:
    // data:image/jpeg;base64,AAAA...
    const match = imagem.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
    );

    if (!match) {
      return res.status(400).json({
        erro: "Formato da imagem inválido."
      });
    }

    const mimeType = match[1];
    const base64Image = match[2];

    const prompt = `
Edite a fotografia enviada criando uma simulação REALISTA de maquiagem.

IMPORTANTE:
- Preserve rigorosamente a identidade da pessoa.
- Preserve formato do rosto, olhos, nariz, boca, sobrancelhas, cabelo e enquadramento.
- Não transforme a pessoa em outra pessoa.
- Não altere idade aparente.
- Não altere formato corporal.
- Não mude o fundo, a menos que seja necessário por pequenas correções.
- Aplique APENAS maquiagem cosmética realista.
- O resultado deve parecer uma fotografia profissional real, não uma ilustração.

Preferências da cliente:

Ocasião:
${ocasiao || "não informada"}

Estilo:
${estilo || "natural"}

Descrição:
${descricao || "Crie uma maquiagem harmoniosa e elegante."}

Crie uma make adequada à ocasião e ao estilo informado.

Pode utilizar, conforme apropriado:
- base
- corretivo
- pó
- blush
- contorno
- iluminador
- sombra
- delineador
- máscara de cílios
- batom
- gloss

A maquiagem deve respeitar características visíveis do rosto e pele.

Entregue somente a imagem final editada.
`;

    console.log("MUSA: enviando imagem ao Gemini");

    const respostaGemini = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          model: "gemini-3.1-flash-image",
          input: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image",
              mime_type: mimeType,
              data: base64Image
            }
          ],
          response_format: {
            type: "image"
          }
        })
      }
    );

    const dados = await respostaGemini.json();

    console.log(
      "MUSA: status Gemini:",
      respostaGemini.status
    );

    if (!respostaGemini.ok) {
      console.error(
        "MUSA: erro Gemini:",
        JSON.stringify(dados)
      );

      return res.status(respostaGemini.status).json({
        erro: "O Gemini não conseguiu gerar a maquiagem.",
        detalhes: dados
      });
    }

    /*
      A API Interactions retorna os resultados em steps.
      Procuramos o bloco final do tipo image.
    */

    let imagemGerada = null;
    let mimeGerado = "image/png";

    if (Array.isArray(dados.steps)) {
      for (const step of dados.steps) {
        if (
          step.type === "model_output" &&
          Array.isArray(step.content)
        ) {
          for (const bloco of step.content) {
            if (bloco.type === "image" && bloco.data) {
              imagemGerada = bloco.data;

              if (bloco.mime_type) {
                mimeGerado = bloco.mime_type;
              }
            }
          }
        }
      }
    }

    /*
      Caso a API retorne uma propriedade de conveniência
      com a imagem final.
    */
    if (!imagemGerada && dados.output_image?.data) {
      imagemGerada = dados.output_image.data;

      if (dados.output_image.mime_type) {
        mimeGerado = dados.output_image.mime_type;
      }
    }

    if (!imagemGerada) {
      console.error(
        "MUSA: nenhuma imagem encontrada:",
        JSON.stringify(dados)
      );

      return res.status(500).json({
        erro: "A IA respondeu, mas não devolveu uma imagem."
      });
    }

    const dataUrl =
      `data:${mimeGerado};base64,${imagemGerada}`;

    console.log("MUSA: maquiagem gerada com sucesso");

    return res.json({
      sucesso: true,
      imagem: dataUrl
    });

  } catch (erro) {
    console.error("MUSA: erro interno:", erro);

    return res.status(500).json({
      erro: "Erro interno no servidor da Musa.",
      detalhes: erro.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Musa Salão IA online na porta ${PORT}`
  );
});
