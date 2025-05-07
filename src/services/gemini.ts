import type { Product } from "./api"

// Chiave API di Google Gemini
const GEMINI_API_KEY = "AIzaSyAEGyih0ORP7r6Ej041q-fKRyCYbRgeaKw"
const GEMINI_MODEL = "gemini-2.0-flash"
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

export interface GeminiAnalysisResult {
  healthScore: number // Punteggio da 1 a 100
  sustainabilityScore: number // Punteggio di sostenibilità da 1 a 100
  analysis: string // Analisi testuale
  pros: string[] // Aspetti positivi
  cons: string[] // Aspetti negativi
  recommendations: string[] // Raccomandazioni
  sustainabilityAnalysis: string // Analisi della sostenibilità
  sustainabilityPros: string[] // Aspetti positivi della sostenibilità
  sustainabilityCons: string[] // Aspetti negativi della sostenibilità
  sustainabilityRecommendations: string[] // Raccomandazioni per la sostenibilità
}

/**
 * Analizza un prodotto alimentare utilizzando Google Gemini
 * @param product Dati del prodotto da OpenFoodFacts
 * @returns Risultato dell'analisi
 */
export const analyzeProductWithGemini = async (product: Product): Promise<GeminiAnalysisResult> => {
  try {
    // Costruisci un prompt dettagliato per ottenere risultati coerenti
    const prompt = createAnalysisPrompt(product)

    // Chiama l'API di Google Gemini
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1, // Temperatura bassa per risultati più deterministici
          topK: 32,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`Errore API Gemini: ${errorData.error?.message || "Errore sconosciuto"}`)
    }

    const data = await response.json()
    const generatedText = data.candidates[0]?.content?.parts[0]?.text || ""

    // Analizza la risposta di Gemini per estrarre i dati strutturati
    return parseGeminiResponse(generatedText)
  } catch (error) {
    console.error("Errore nell'analisi con Gemini:", error)
    throw new Error("Si è verificato un errore durante l'analisi del prodotto.")
  }
}

/**
 * Crea un prompt dettagliato per l'analisi del prodotto
 */
const createAnalysisPrompt = (product: Product): string => {
  return `
Analizza i seguenti dati di un prodotto alimentare e fornisci DUE punteggi separati:
1. Un punteggio di salubrità da 1 a 100 (dove 1 è il meno salutare e 100 il più salutare)
2. Un punteggio di sostenibilità ambientale da 1 a 100 (dove 1 è il meno sostenibile e 100 il più sostenibile)

Entrambi i punteggi devono essere DETERMINISTICI e RIPETIBILI: lo stesso prodotto deve sempre ricevere gli stessi punteggi.

DATI DEL PRODOTTO:
Nome: ${product.product_name}
Marca: ${product.brands}
Nutri-Score: ${product.nutrition_grades || "Non disponibile"}
Eco-Score: ${product.ecoscore_grade || "Non disponibile"}
Ingredienti: ${product.ingredients_text || "Non disponibili"}
Origine ingredienti: ${product.origins || "Non disponibile"}
Packaging: ${product.packaging || "Non disponibile"}
Categorie: ${product.categories || "Non disponibile"}
Labels/Certificazioni: ${product.labels || "Non disponibile"}

VALORI NUTRIZIONALI (per 100g):
Energia: ${product.nutriments?.energy_100g || "N/A"} kcal
Grassi: ${product.nutriments?.fat_100g || "N/A"} g
Carboidrati: ${product.nutriments?.carbohydrates_100g || "N/A"} g
Proteine: ${product.nutriments?.proteins_100g || "N/A"} g
Sale: ${product.nutriments?.salt_100g || "N/A"} g
Zuccheri: ${product.nutriments?.sugars_100g || "N/A"} g
Fibre: ${product.nutriments?.fiber_100g || "N/A"} g
Grassi saturi: ${product.nutriments?.saturated_fat_100g || "N/A"} g

CRITERI DI VALUTAZIONE PER LA SALUBRITÀ:
1. Considera il Nutri-Score come base di partenza
2. Valuta la presenza di additivi, conservanti o ingredienti artificiali
3. Considera il rapporto tra proteine, grassi e carboidrati
4. Valuta la quantità di zuccheri, sale e grassi saturi
5. Considera la presenza di ingredienti benefici (fibre, vitamine, minerali)

CRITERI DI VALUTAZIONE PER LA SOSTENIBILITÀ:
1. Considera l'Eco-Score se disponibile
2. Valuta il tipo di imballaggio (plastica, carta, materiali riciclabili)
3. Considera l'origine degli ingredienti (locale vs importato)
4. Valuta la presenza di certificazioni biologiche, commercio equo, ecc.
5. Considera l'impatto ambientale della produzione (es. prodotti animali vs vegetali)
6. Valuta la stagionalità degli ingredienti
7. Considera la presenza di olio di palma o ingredienti con alto impatto ambientale

FORMATO RISPOSTA:
Fornisci la risposta in formato JSON con i seguenti campi:
{
  "healthScore": [punteggio numerico da 1 a 100],
  "sustainabilityScore": [punteggio numerico da 1 a 100],
  "analysis": [breve analisi testuale della salubrità del prodotto],
  "pros": [array di aspetti positivi per la salute],
  "cons": [array di aspetti negativi per la salute],
  "recommendations": [array di raccomandazioni per la salute],
  "sustainabilityAnalysis": [breve analisi testuale della sostenibilità del prodotto],
  "sustainabilityPros": [array di aspetti positivi per la sostenibilità],
  "sustainabilityCons": [array di aspetti negativi per la sostenibilità],
  "sustainabilityRecommendations": [array di raccomandazioni per la sostenibilità]
}

IMPORTANTE: Entrambi i punteggi devono essere DETERMINISTICI. Usa formule precise basate sui valori disponibili.

Per la SALUBRITÀ:
- Se il Nutri-Score è A, il punteggio dovrebbe essere nell'intervallo 80-100.
- Se il Nutri-Score è B, il punteggio dovrebbe essere nell'intervallo 60-79.
- Se il Nutri-Score è C, il punteggio dovrebbe essere nell'intervallo 40-59.
- Se il Nutri-Score è D, il punteggio dovrebbe essere nell'intervallo 20-39.
- Se il Nutri-Score è E, il punteggio dovrebbe essere nell'intervallo 1-19.
Aggiusta il punteggio all'interno dell'intervallo in base agli altri fattori nutrizionali.

Per la SOSTENIBILITÀ:
- Se l'Eco-Score è A, il punteggio dovrebbe essere nell'intervallo 80-100.
- Se l'Eco-Score è B, il punteggio dovrebbe essere nell'intervallo 60-79.
- Se l'Eco-Score è C, il punteggio dovrebbe essere nell'intervallo 40-59.
- Se l'Eco-Score è D, il punteggio dovrebbe essere nell'intervallo 20-39.
- Se l'Eco-Score è E, il punteggio dovrebbe essere nell'intervallo 1-19.
- Se l'Eco-Score non è disponibile, basa il punteggio su: imballaggio (25%), origine ingredienti (25%), certificazioni (25%), tipo di prodotto (25%).

Se mancano dati, fai ipotesi ragionevoli basate sulle informazioni disponibili, ma mantieni la coerenza.
`
}

/**
 * Analizza la risposta di Gemini per estrarre i dati strutturati
 */
const parseGeminiResponse = (response: string): GeminiAnalysisResult => {
  try {
    // Cerca di estrarre il JSON dalla risposta
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const jsonStr = jsonMatch[0]
      const result = JSON.parse(jsonStr)

      // Verifica che tutti i campi necessari siano presenti
      if (
        typeof result.healthScore === "number" &&
        typeof result.sustainabilityScore === "number" &&
        typeof result.analysis === "string" &&
        Array.isArray(result.pros) &&
        Array.isArray(result.cons) &&
        Array.isArray(result.recommendations) &&
        typeof result.sustainabilityAnalysis === "string" &&
        Array.isArray(result.sustainabilityPros) &&
        Array.isArray(result.sustainabilityCons) &&
        Array.isArray(result.sustainabilityRecommendations)
      ) {
        return result
      }
    }

    // Se non riesce a estrarre il JSON o mancano campi, crea un risultato di fallback
    console.warn("Impossibile analizzare la risposta di Gemini come JSON valido:", response)
    return createFallbackResult(response)
  } catch (error) {
    console.error("Errore nell'analisi della risposta di Gemini:", error)
    return createFallbackResult(response)
  }
}

/**
 * Crea un risultato di fallback se l'analisi della risposta fallisce
 */
const createFallbackResult = (response: string): GeminiAnalysisResult => {
  // Cerca di estrarre un punteggio numerico dalla risposta
  const healthScoreMatch = response.match(/healthScore["\s:]+(\d+)/)
  const sustainabilityScoreMatch = response.match(/sustainabilityScore["\s:]+(\d+)/)
  
  const healthScore = healthScoreMatch ? Number.parseInt(healthScoreMatch[1], 10) : 50
  const sustainabilityScore = sustainabilityScoreMatch ? Number.parseInt(sustainabilityScoreMatch[1], 10) : 50

  return {
    healthScore: Math.min(100, Math.max(1, healthScore)), // Assicura che sia tra 1 e 100
    sustainabilityScore: Math.min(100, Math.max(1, sustainabilityScore)), // Assicura che sia tra 1 e 100
    analysis: "Non è stato possibile generare un'analisi dettagliata della salubrità.",
    pros: ["Non disponibile"],
    cons: ["Non disponibile"],
    recommendations: ["Non disponibile"],
    sustainabilityAnalysis: "Non è stato possibile generare un'analisi dettagliata della sostenibilità.",
    sustainabilityPros: ["Non disponibile"],
    sustainabilityCons: ["Non disponibile"],
    sustainabilityRecommendations: ["Non disponibile"],
  }
}

