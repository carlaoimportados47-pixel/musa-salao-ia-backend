const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const MAX_GERACOES_TESTE =
  Number(process.env.MAX_GERACOES_TESTE) || 10;

const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ||
  "gemini-3.1-flash-image";

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
}

// TESTE DO BACKEND
app.get("/", (req, res) => {
  res.json({
    status: "online",
    projeto: "Musa Salão IA",
    mensagem: "Backend da Musa funcionando ✨"
  });
});

// CONSULTA QUANTAS GERAÇÕES JÁ FORAM USADAS
async function consultarUso() {
  const resposta = await fetch(
    `${SUPABASE_URL}/rest/v1/musa_usage?id=eq.1&select=geracoes_usadas`,
    {
      method: "GET",
      headers: supabaseHeaders()
    }
  );

  if (!resposta.ok) {
    const texto = await resposta.text();

    throw new Error(
      `Erro ao consultar Supabase: ${texto}`
    );
  }

  const dados = await resposta.json();

  if (!dados.length) {
    throw new Error(
      "Registro musa_usage id=1 não encontrado."
    );
  }

  return Number(dados[0].geracoes_usadas) || 0;
}

// ATUALIZA O CONTADOR APÓS SUCESSO
async function registrarGeracaoSucesso(novoValor) {
  const resposta = await fetch(
    `${SUPABASE_URL}/rest/v1/musa_usage?id=eq.1`,
    {
      method: "PATCH",
      headers: {
        ...supabaseHeaders(),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        geracoes_usadas: novoValor,
        updated_at: new Date().toISOString()
      })
    }
  );

  if (!resposta.ok) {
    const texto = await resposta.text();

    throw new Error(
      `Erro ao atualizar Supabase: ${texto}`
    );
  }

  return resposta.json();
}

// ROTA PRINCIPAL DA MUSA
app.post("/musa", async (req, res) => {
  try {
    const {
      imagem,
      ocasiao,
      estilo,
      descricao,
      consentimento
    } = req.body;

    // VALIDAÇÕES
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
      return res.status(500).json({
        sucesso: false,
        erro:
          "GEMINI_API_KEY não configurada no servidor."
      });
    }

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY
    ) {
      return res.status(500).json({
        sucesso: false,
        erro:
          "Supabase não configurado no servidor."
      });
    }

    // CONSULTA O CONTADOR ANTES DE GASTAR API
    const geracoesUsadas = await consultarUso();

    console.log(
      `MUSA: uso atual ${geracoesUsadas}/${MAX_GERACOES_TESTE}`
    );

    if (geracoesUsadas >= MAX_GERACOES_TESTE) {
      console.log(
        `MUSA: LIMITE DE TESTES ATINGIDO - ${geracoesUsadas}/${MAX_GERACOES_TESTE}`
      );

      return res.status(429).json({
        sucesso: false,
        limiteAtingido: true,
        geracoesUsadas,
        limite: MAX_GERACOES_TESTE,
        mensagem:
          "Os 10 testes gratuitos da Musa foram utilizados."
      });
    }

    // EXTRAI BASE64
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

    // PROMPT DA MUSA
    const prompt = `
Edite a fotografia enviada criando uma simulação REALISTA de maquiagem.

REGRAS IMPORTANTES:

- Preserve rigorosamente a identidade da pessoa.
- Preserve rosto, olhos, nariz, boca, sobrancelhas e cabelo.
- Preserve o mesmo enquadramento e ângulo da fotografia.
- Não transforme a pessoa em outra pessoa.
- Não altere idade aparente.
- Não altere corpo.
- Não altere o fundo sem necessidade.
- Aplique somente maquiagem cosmética realista.
- O resultado precisa parecer uma fotografia real.

Preferências da cliente:

Ocasião:
${ocasiao || "não informada"}

Estilo:
${estilo || "natural"}

Descrição:
${
  descricao ||
  "Crie uma maquiagem harmoniosa e elegante."
}

A maquiagem pode utilizar, conforme apropriado:

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

Adapte a maquiagem às características visíveis da pessoa.

Entregue a imagem final editada.
`;

    console.log("MUSA: enviando imagem ao Gemini");

    // GEMINI - EDIÇÃO DE IMAGEM
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

    if (!respostaGemini.ok) {
      console.error(
        "MUSA: erro Gemini:",
        JSON.stringify(dados)
      );

      // NÃO contabiliza erro
      return res
        .status(respostaGemini.status)
        .json({
          sucesso: false,
          erro:
            "A IA não conseguiu gerar a maquiagem.",
          detalhes: dados
        });
    }

    // A API Interactions fornece a imagem final
    // também através de output_image.
    let imagemGerada =
      dados?.output_image?.data || null;

    let mimeGerado =
      dados?.output_image?.mime_type ||
      "image/jpeg";

    // Fallback: procura imagem dentro dos steps
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

    if (!imagemGerada) {
      console.error(
        "MUSA: Gemini respondeu sem imagem."
      );

      // NÃO contabiliza
      return res.status(500).json({
        sucesso: false,
        erro:
          "A IA respondeu, mas não devolveu uma imagem."
      });
    }

    // SOMENTE AGORA CONTA COMO TESTE USADO
    const novoTotal = geracoesUsadas + 1;

    await registrarGeracaoSucesso(
      novoTotal
    );

    console.log(
      `MUSA: geração ${novoTotal} de ${MAX_GERACOES_TESTE}`
    );

    if (
      novoTotal >= MAX_GERACOES_TESTE
    ) {
      console.log(
        `MUSA: LIMITE DE TESTES ATINGIDO - ${novoTotal}/${MAX_GERACOES_TESTE}`
      );
    }

    const dataUrl =
      `data:${mimeGerado};base64,${imagemGerada}`;

    console.log(
      "MUSA: maquiagem gerada com sucesso"
    );

    return res.json({
      sucesso: true,
      imagem: dataUrl,
      geracoesUsadas: novoTotal,
      limite: MAX_GERACOES_TESTE,
      geracoesRestantes:
        Math.max(
          0,
          MAX_GERACOES_TESTE -
            novoTotal
        )
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
      `MUSA: limite configurado = ${MAX_GERACOES_TESTE}`
    );
  }
);
