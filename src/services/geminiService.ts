import { GoogleGenAI } from "@google/genai";
import { Layer } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateCellImage(layers: Layer[]): Promise<string | null> {
  try {
    const layerDescription = layers.map((l, i) => `${i+1}. ${l.type} (${l.material}, ${l.thickness}µm)`).join(", ");
    const prompt = `A professional, scientific cross-section diagram of a solar cell with the following layers in order: ${layerDescription}. The diagram should be clean, labeled, and look like it belongs in a scientific journal. High resolution, detailed textures for each material.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
        },
      },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64EncodeString = part.inlineData.data;
        return `data:image/png;base64,${base64EncodeString}`;
      }
    }
  } catch (error) {
    console.error("Error generating image:", error);
  }
  
  return null;
}

export async function predictSpacePerformance(simulation: any): Promise<string | null> {
  try {
    const layerDescription = simulation.layers.map((l: any, i: number) => 
      `${i+1}. ${l.type} (${l.material}, ${l.thickness}µm, Bandgap: ${l.bandGap}eV)`
    ).join(", ");

    const performance = simulation.performance ? 
      `Voc: ${simulation.performance.voc}V, Jsc: ${simulation.performance.jsc}mA/cm², FF: ${simulation.performance.ff}%, PCE: ${simulation.performance.pce}%` : 
      "Performance data not available.";

    const prompt = `
      You are an expert in space photovoltaics and radiation effects on solar cells.
      Analyze the following solar cell structure and its performance on Earth:
      
      Structure: ${layerDescription}
      Earth Performance: ${performance}
      
      Predict how this solar cell would perform in a space environment (e.g., LEO or GEO orbit).
      Consider factors like:
      - High-energy radiation (protons and electrons) causing displacement damage.
      - Thermal cycling (extreme temperature swings).
      - Vacuum conditions (outgassing).
      - Ultraviolet (UV) degradation.
      
      Provide your feedback in Markdown format with the following 4 categories:
      1. **Performance change (Voc, Jsc, FF, PCE) compare to the original**: Estimate the percentage change in these parameters.
      2. **Pros**: List the advantages of this structure in space.
      3. **Cons**: List the disadvantages and risks in space.
      4. **Suggestions**: Recommend changes to the structure or materials to enhance space performance (e.g., radiation hardening, cover glass, specific material swaps).
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ text: prompt }],
    });

    return response.text;
  } catch (error) {
    console.error("Error predicting space performance:", error);
  }
  
  return null;
}
