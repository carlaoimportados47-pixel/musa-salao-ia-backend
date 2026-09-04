const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

app.use(
  express.json({
    limit: "25mb",
  })
);

const PORT = process.env.PORT || 10000;

// TESTE DO SERVIDOR
app.get("/", (req, res) => {
  res.json({
    status: "online",
    projeto: "Musa Salão IA",
    mensagem: "Backend da Musa funcionando ✨",
  });
});

// ROTA PRINCIPAL DA MUSA
app.post("/musa", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        sucesso: false,
        erro: "GEMINI_API_KEY não encontrada no servidor.",
      });
    }

    const {
      imagem,
      ocasiao = "",
      estilo = "",
      descricao = "",
    } = req.body;

    if (!imagem) {
      return res.status(400).json({
        sucesso: false,
        erro: "Nenhuma imagem foi enviada.",
      });
    }

    // Espera receber:
    // data:image/jpeg;base64,XXXXX
    const match = imagem.match(
      /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/
    );

    if (!match) {
      return res.status(400).json({
        sucesso: false,
        erro: "Formato da imagem inválido.",
      });
    }

    let mimeType = match[1];
    const base64Image = match[2];

    if (mimeType === "image/jpg") {
      mimeType = "image/jpeg";
    }

    const prompt = `
Você é MUSA, uma inteligência artificial especialista em maquiagem virtual realista.

Sua tarefa é EDITAR A FOTO DA CLIENTE fornecida como referência.

A pessoa da imagem deve continuar sendo claramente a MESMA PESSOA.

PRESERVE COM ALTA FIDELIDADE:
- identidade facial
- formato do rosto
- olhos
- nariz
- boca
- sobrancelhas
- proporções faciais
- tom de pele
- textura natural da pele
- cabelo
- pose
- ângulo da câmera
- enquadramento
- expressão facial
- fundo original
- iluminação original sempre que possível

MODIFIQUE SOMENTE A MAQUIAGEM.

Ocasião escolhida:
${ocasiao || "não informada"}

Estilo escolhido:
${estilo || "não informado"}

Pedido adicional da cliente:
${descricao || "nenhum pedido adicional"}

Crie uma maquiagem profissional, elegante, realista e fotograficamente convincente de acordo com as escolhas acima.

A maquiagem pode envolver, conforme adequado:
- preparação e uniformização natural da pele
- blush
- contorno suave
- iluminador
- sobrancelhas bem definidas sem modificar seu formato natural
- sombra
- delineado
- máscara de cílios
- batom ou gloss

REGRAS OBRIGATÓRIAS:

NÃO altere a identidade da pessoa.

NÃO transforme o rosto em outra pessoa.

NÃO altere formato dos olhos, nariz, boca ou rosto.

NÃO rejuvenesça ou envelheça a pessoa artificialmente.

NÃO altere cabelo ou penteado.

NÃO altere roupas.

NÃO altere o cenário.

NÃO crie colagem.

NÃO crie comparação antes e depois.

NÃO coloque duas pessoas.

NÃO coloque textos.

NÃO coloque legendas.

NÃO coloque títulos.

NÃO coloque nomes de produtos.

NÃO coloque marcas.

NÃO coloque setas.

NÃO coloque molduras.

NÃO coloque ícones.

NÃO coloque explicações dentro da imagem.

NÃO coloque marca d'água visual adicional.

O resultado deve parecer uma fotografia real da mesma cliente depois de receber uma maquiagem profissional.

A imagem final deve conter SOMENTE A FOTO EDITADA.
`;

    const respostaGemini = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model: "gemini-3.1-flash-image",

          input: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image",
              mime_type: mimeType,
              data: base64Image,
            },
          ],

          response_format: {
            type: "image",
          },
        }),
      }
    );

    const textoResposta = await respostaGemini.text();

    let dados;

    try {
      dados = JSON.parse(textoResposta);
    } catch {
      console.error("Resposta não JSON do Gemini:", textoResposta);

      return res.status(500).json({
        sucesso: false,
        erro: "O Gemini retornou uma resposta inválida.",
      });
    }

    if (!respostaGemini.ok) {
      console.error("Erro Gemini:", dados);

      return res.status(respostaGemini.status).json({
        sucesso: false,
        erro:
          dados?.error?.message ||
          "Não foi possível gerar a maquiagem.",
        detalhes: dados,
      });
    }

    // A API Interactions pode retornar a imagem
    // como output_image ou dentro das saídas.
    let imagemGerada = null;
    let tipoImagem = "image/png";

    if (dados.output_image?.data) {
      imagemGerada = dados.output_image.data;

      if (dados.output_image.mime_type) {
        tipoImagem = dados.output_image.mime_type;
      }
    }

    // Busca alternativa caso a estrutura venha dentro de outputs
    if (!imagemGerada && Array.isArray(dados.outputs)) {
      for (const output of dados.outputs) {
        if (output?.type === "image" && output?.data) {
          imagemGerada = output.data;
          tipoImagem = output.mime_type || "image/png";
          break;
        }
      }
    }

    // Busca profunda como fallback
    if (!imagemGerada) {
      const procurarImagem = (obj) => {
        if (!obj || typeof obj !== "object") {
          return null;
        }

        if (
          obj.type === "image" &&
          typeof obj.data === "string"
        ) {
          return {
            data: obj.data,
            mimeType:
              obj.mime_type ||
              obj.mimeType ||
              "image/png",
          };
        }

        if (
          obj.inlineData?.data &&
          typeof obj.inlineData.data === "string"
        ) {
          return {
            data: obj.inlineData.data,
            mimeType:
              obj.inlineData.mimeType ||
              "image/png",
          };
        }

        for (const valor of Object.values(obj)) {
          if (Array.isArray(valor)) {
            for (const item of valor) {
              const encontrado = procurarImagem(item);
              if (encontrado) return encontrado;
            }
          } else if (valor && typeof valor === "object") {
            const encontrado = procurarImagem(valor);
            if (encontrado) return encontrado;
          }
        }

        return null;
      };

      const encontrada = procurarImagem(dados);

      if (encontrada) {
        imagemGerada = encontrada.data;
        tipoImagem = encontrada.mimeType;
      }
    }

    if (!imagemGerada) {
      console.error(
        "Gemini respondeu sem imagem:",
        JSON.stringify(dados)
      );

      return res.status(500).json({
        sucesso: false,
        erro:
          "A Musa recebeu a foto, mas o Gemini não retornou uma imagem.",
      });
    }

    const dataUrl = `data:${tipoImagem};base64,${imagemGerada}`;

    return res.json({
      sucesso: true,
      imagem: dataUrl,
      imagemGerada: dataUrl,
      resultado: dataUrl,
      mensagem: "Make criada pela Musa ✨",
    });
  } catch (erro) {
    console.error("Erro interno da Musa:", erro);

    return res.status(500).json({
      sucesso: false,
      erro: "Erro interno ao criar a maquiagem.",
      detalhes: erro.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Musa Salão IA online na porta ${PORT}`);
});
