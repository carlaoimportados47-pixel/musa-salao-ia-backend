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

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

if (!accountId || !apiToken) {
  return res.status(500).json({
    success: false,
    erro: "Cloudflare não configurada no servidor.",
  });
}

const form = new FormData();

const imagemBuffer = Buffer.from(base64Image, "base64");

form.append("prompt", prompt);

form.append(
  "input_image_0",
  new Blob([imagemBuffer], {
    type: mimeType || "image/jpeg",
  }),
  "musa-foto.jpg"
);

// O FLUX.2 Klein exige que imagens de entrada sejam menores que 512x512.
// A saída pode continuar em 512x512.
form.append("width", "512");
form.append("height", "512");

console.log("Musa IA: enviando foto para Cloudflare Workers AI...");

const respostaCloudflare = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
    body: form,
  }
);

const textoResposta = await respostaCloudflare.text();

let dadosCloudflare;

try {
  dadosCloudflare = JSON.parse(textoResposta);
} catch {
  console.error(
    "Resposta inválida da Cloudflare:",
    textoResposta
  );

  return res.status(500).json({
    success: false,
    erro: "A Cloudflare retornou uma resposta inválida.",
  });
}

if (
  !respostaCloudflare.ok ||
  dadosCloudflare?.success === false
) {
  console.error(
    "Erro Cloudflare:",
    JSON.stringify(dadosCloudflare, null, 2)
  );

  return res.status(respostaCloudflare.status || 500).json({
    success: false,
    erro:
      dadosCloudflare?.errors?.[0]?.message ||
      "Não foi possível gerar a maquiagem.",
    detalhes: dadosCloudflare,
  });
}

const imagemGerada =
  dadosCloudflare?.result?.image ||
  dadosCloudflare?.image;

if (!imagemGerada) {
  console.error(
    "Cloudflare respondeu sem imagem:",
    JSON.stringify(dadosCloudflare, null, 2)
  );

  return res.status(500).json({
    success: false,
    erro: "A Musa recebeu a foto, mas a IA não retornou uma imagem.",
  });
}

const dataUrl = imagemGerada.startsWith("data:image")
  ? imagemGerada
  : `data:image/jpeg;base64,${imagemGerada}`;

console.log("Musa IA: maquiagem criada com sucesso.");

return res.json({
  success: true,
  imagem: dataUrl,
  imagemGerada: dataUrl,
  resultado: dataUrl,
  image: dataUrl,
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
