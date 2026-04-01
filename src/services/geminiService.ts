import { GoogleGenAI } from "@google/genai";
import { Layer } from "../types";

export async function generateCellImage(layers: Layer[]): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing.");
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const layerDescription = layers.map((l, i) => `${i+1}. ${l.type} (${l.material}, ${l.thickness}µm)`).join(", ");
  const prompt = `A professional, scientific cross-section diagram of a Perovskite solar cell with the following layers in order: ${layerDescription}. The diagram should be clean, labeled, and look like it belongs in a scientific journal. High resolution, detailed textures for each material.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
        },
      },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64EncodeString: string = part.inlineData.data;
        return `data:image/png;base64,${base64EncodeString}`;
      }
    }
  } catch (error) {
    console.error("Error generating image:", error);
  }
  
  return null;
}
