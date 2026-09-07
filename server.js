const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Modelo de imagem.
// Se futuramente quiser trocar pelo Render,
// basta criar GEMINI_IMAGE_MODEL no Environment.
const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ||
  "gemini-3.1-flash-image";

// ==========================================
// TESTE DO BACKEND
// ==========================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    projeto: "Musa Salão IA",
    mensagem: "Backend da Musa funcionando ✨"
  });
});

// ==========================================
// ROTA PRINCIPAL DA MUSA
// ==========================================

app.post("/musa", async (req, res) => {
  try {
    const {
      imagem,
      ocasiao,
      estilo,
      descricao,
      consentimento
    } = req.body;

    console.log("MUSA: nova solicitação recebida");

    // ======================================
    // VALIDAÇÕES
    // ======================================

    if (!consentimento) {
      return res.status(400).json({
        sucesso: false,
        erro:
          "É necessário concordar com o uso da imagem."
      });
    }

    if (!imagem) {
      return res.status(400).json({
        sucesso: false,
        erro: "Nenhuma imagem foi enviada."
      });
    }

    if (!GEMINI_API_KEY) {
      console.error(
        "MUSA: GEMINI_API_KEY não configurada"
      );

      return res.status(500).json({
        sucesso: false,
        erro:
          "GEMINI_API_KEY não configurada no servidor."
      });
    }

    // ======================================
    // EXTRAIR A IMAGEM BASE64
    // ======================================

    const match = imagem.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
    );

    if (!match) {
      return res.status(400).json({
        sucesso: false,
        erro: "Formato da imagem inválido."
      });
    }

    const mimeType = match[1];
    const base64Image = match[2];

    // ======================================
    // PROMPT DA MUSA
    // ======================================

    const prompt = `
Você é a Musa Salão IA.

Sua função é criar uma simulação REALISTA de maquiagem
sobre a fotografia enviada pela cliente.

PRESERVE RIGOROSAMENTE:

- identidade da pessoa
- formato do rosto
- olhos
- nariz
- boca
- sobrancelhas
- cabelo
- tom geral da pele
- ângulo da fotografia
- enquadramento
- fundo da imagem

NÃO transforme a pessoa em outra pessoa.

NÃO altere:

- idade aparente
- formato corporal
- cabelo
- formato do rosto
- características naturais da cliente

Aplique SOMENTE maquiagem cosmética realista.

A imagem final deve parecer uma fotografia verdadeira
da mesma pessoa depois de receber uma maquiagem profissional.

PREFERÊNCIAS DA CLIENTE

Ocasião:
${ocasiao || "não informada"}

Estilo:
${estilo || "natural"}

Descrição da cliente:
${
  descricao ||
  "Crie uma maquiagem harmoniosa, bonita e realista."
}

A maquiagem pode utilizar conforme necessário:

- preparação de pele
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

Adapte cores e intensidade às características visíveis
do rosto e à ocasião escolhida.

IMPORTANTE:

Preserve a identidade da cliente.

O objetivo é mostrar como ELA ficaria maquiada,
e não criar outro rosto.

Entregue somente a imagem final editada.
`;

    console.log(
      `MUSA: enviando imagem ao Gemini - modelo ${GEMINI_IMAGE_MODEL}`
    );

    // ======================================
    // CHAMADA GEMINI
    // ======================================

    const respostaGemini = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },

        body: JSON.stringify({
          model: GEMINI_IMAGE_MODEL,

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
            type: "image",
            mime_type: "image/jpeg"
          }
        })
      }
    );

    const dados = await respostaGemini.json();

    console.log(
      "MUSA: status Gemini:",
      respostaGemini.status
    );

    // ======================================
    // ERRO GEMINI
    // ======================================

    if (!respostaGemini.ok) {
      console.error(
        "MUSA: erro Gemini:",
        JSON.stringify(dados)
      );

      return res
        .status(respostaGemini.status)
        .json({
          sucesso: false,
          erro:
            "A IA não conseguiu gerar a maquiagem.",
          detalhes: dados
        });
    }

    // ======================================
    // PROCURAR A IMAGEM GERADA
    // ======================================

    let imagemGerada =
      dados?.output_image?.data || null;

    let mimeGerado =
      dados?.output_image?.mime_type ||
      "image/jpeg";

    // Fallback para respostas que chegam em steps
    if (
      !imagemGerada &&
      Array.isArray(dados?.steps)
    ) {
      for (const step of dados.steps) {
        if (!Array.isArray(step?.content)) {
          continue;
        }

        for (const parte of step.content) {
          if (
            parte?.type === "image" &&
            parte?.data
          ) {
            imagemGerada = parte.data;

            mimeGerado =
              parte.mime_type ||
              "image/jpeg";
          }
        }
      }
    }

    // ======================================
    // GEMINI RESPONDEU SEM IMAGEM
    // ======================================

    if (!imagemGerada) {
      console.error(
        "MUSA: Gemini respondeu, mas nenhuma imagem foi encontrada."
      );

      console.error(
        "MUSA: resposta completa:",
        JSON.stringify(dados)
      );

      return res.status(500).json({
        sucesso: false,
        erro:
          "A IA respondeu, mas não devolveu uma imagem."
      });
    }

    // ======================================
    // CONVERTER PARA DATA URL
    // ======================================

    const imagemFinal =
      `data:${mimeGerado};base64,${imagemGerada}`;

    console.log(
      "MUSA: maquiagem gerada com sucesso ✨"
    );

    // ======================================
    // RESPOSTA PARA O CANVA
    // ======================================

    return res.json({
      sucesso: true,
      imagem: imagemFinal,
      mensagem:
        "Sua maquiagem foi criada pela Musa ✨"
    });
  } catch (erro) {
    console.error(
      "MUSA: erro interno:",
      erro
    );

    return res.status(500).json({
      sucesso: false,
      erro:
        "Erro interno no servidor da Musa.",
      detalhes: erro.message
    });
  }
});
// ==========================================
// CADASTRO DE PRODUTOS - MUSA SALÃO IA
// ==========================================

app.post("/produtos", async (req, res) => {
  try {
    const {
      nome,
      categoria,
      tom_cor,
      descricao,
      preco,
      foto_url,
      link_compra,
      whatsapp
    } = req.body;

    if (!nome || !categoria) {
      return res.status(400).json({
        sucesso: false,
        erro: "Nome e categoria são obrigatórios."
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        sucesso: false,
        erro: "Supabase não configurado no servidor."
      });
    }

    const resposta = await fetch(
      `${SUPABASE_URL}/rest/v1/products`,
      {
        method: "POST",
        headers: {
          ...supabaseHeaders(),
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          nome,
          categoria,
          tom_cor: tom_cor || null,
          descricao: descricao || null,
          preco: preco || null,
          foto_url: foto_url || null,
          link_compra: link_compra || null,
          whatsapp: whatsapp || null,
          disponivel: true
        })
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error("MUSA: erro cadastro produto:", dados);

      return res.status(resposta.status).json({
        sucesso: false,
        erro: "Não foi possível cadastrar o produto.",
        detalhes: dados
      });
    }

    console.log("MUSA: produto cadastrado:", nome);

    return res.status(201).json({
      sucesso: true,
      mensagem: "Produto cadastrado com sucesso.",
      produto: dados[0]
    });

  } catch (erro) {
    console.error("MUSA: erro interno produto:", erro);

    return res.status(500).json({
      sucesso: false,
      erro: "Erro interno ao cadastrar produto.",
      detalhes: erro.message
    });
  }
});
// ==========================================
// INICIAR SERVIDOR
// ==========================================

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Musa Salão IA online na porta ${PORT}`
    );

    console.log(
      `MUSA: modelo configurado = ${GEMINI_IMAGE_MODEL}`
    );

    console.log(
      "MUSA: geração sem limite de testes"
    );
  }
);
