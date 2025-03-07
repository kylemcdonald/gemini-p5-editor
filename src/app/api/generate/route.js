import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

export async function POST(request) {
  try {
    const { prompt, modelName, temperature } = await request.json();

    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: "Respond only with p5.js JavaScript code. Do not add any additional commentary before or after the code.",
    });

    const chatSession = model.startChat({
      generationConfig: {
        ...generationConfig,
        temperature: parseFloat(temperature)
      },
      history: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    const result = await chatSession.sendMessage(prompt);
    let generatedCode = result.response.text();
    
    if (generatedCode.includes('```')) {
      generatedCode = generatedCode
        .split('```')
        .filter((block, index) => index % 2 === 1)
        .join('\n')
        .replace(/^javascript\n/m, '')
        .trim();
    }

    return Response.json({ code: generatedCode });
  } catch (error) {
    console.error('Error generating code:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
} 