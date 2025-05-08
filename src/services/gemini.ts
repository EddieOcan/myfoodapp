import type { RawProductData } from "./api"

// Chiave API di Google Gemini
const GEMINI_API_KEY = "AIzaSyAEGyih0ORP7r6Ej041q-fKRyCYbRgeaKw"
const GEMINI_MODEL = "gemini-2.0-flash"
const GEMINI_TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const GEMINI_VISION_MODEL = "gemini-1.5-flash"
const GEMINI_VISION_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`

export interface GeminiAnalysisResult {
  healthScore: number // Punteggio da 1 a 100
  sustainabilityScore: number // Punteggio di sostenibilità da 1 a 100
  analysis: string // Analisi testuale
  pros: Array<{title: string, detail: string}> // MODIFICATO
  cons: Array<{title: string, detail: string}> // MODIFICATO
  recommendations: string[] // Raccomandazioni
  sustainabilityAnalysis: string // Analisi della sostenibilità
  sustainabilityPros: Array<{title: string, detail: string}> // MODIFICATO
  sustainabilityCons: Array<{title: string, detail: string}> // MODIFICATO
  sustainabilityRecommendations: string[] // Raccomandazioni per la sostenibilità
  productNameFromVision?: string // Nome prodotto identificato da Gemini Vision (opzionale)
  brandFromVision?: string // Marca identificata da Gemini Vision (opzionale)
}

/**
 * Analizza un prodotto alimentare utilizzando Google Gemini
 * @param product Dati del prodotto da OpenFoodFacts o analisi visiva (RawProductData)
 * @returns Risultato dell'analisi
 */
export const analyzeProductWithGemini = async (product: RawProductData): Promise<GeminiAnalysisResult> => {
  try {
    console.log(`[GEMINI START] Avvio analisi per il prodotto ${product.code}: ${product.product_name}`)
    console.time(`[GEMINI TIMING] Analisi completa per ${product.code}`)

    // Costruisci un prompt dettagliato per ottenere risultati coerenti
    const prompt = createAnalysisPrompt(product)
    console.log(`[GEMINI PROMPT] Prompt generato per ${product.code} (lunghezza: ${prompt.length} caratteri)`)

    // Chiama l'API di Google Gemini
    console.log(`[GEMINI API] Chiamata API per ${product.code}`)
    console.time(`[GEMINI API TIMING] Chiamata API per ${product.code}`)

    const response = await fetch(`${GEMINI_TEXT_API_URL}?key=${GEMINI_API_KEY}`, {
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
          maxOutputTokens: 4096,
        },
      }),
    })

    console.timeEnd(`[GEMINI API TIMING] Chiamata API per ${product.code}`)

    if (!response.ok) {
      const errorData = await response.json()
      console.error(`[GEMINI API ERROR] Errore nella risposta API per ${product.code}:`, errorData)
      throw new Error(`Errore API Gemini: ${errorData.error?.message || "Errore sconosciuto"}`)
    }

    const data = await response.json()
    const generatedText = data.candidates[0]?.content?.parts[0]?.text || ""
    console.log(
      `[GEMINI RESPONSE] Risposta ricevuta per ${product.code} (lunghezza: ${generatedText.length} caratteri)`,
    )

    // Analizza la risposta di Gemini per estrarre i dati strutturati
    console.log(`[GEMINI PARSE] Analisi della risposta per ${product.code}`)
    const result = parseGeminiResponse(generatedText)

    console.timeEnd(`[GEMINI TIMING] Analisi completa per ${product.code}`)
    console.log(`[GEMINI SUCCESS] Analisi completata per ${product.code}:`, {
      healthScore: result.healthScore,
      sustainabilityScore: result.sustainabilityScore,
    })

    return result
  } catch (error) {
    console.error(`[GEMINI ERROR] Errore nell'analisi con Gemini per ${product.code}:`, error)
    throw new Error("Si è verificato un errore durante l'analisi del prodotto.")
  }
}

/**
 * Crea un prompt dettagliato per l'analisi del prodotto
 */
const createAnalysisPrompt = (product: RawProductData): string => {
  // Helper per formattare array di tag o stringhe opzionali
  const formatField = (value: string | string[] | undefined | null, defaultValue: string = "Non disponibile") => {
    if (Array.isArray(value) && value.length > 0) return value.join(', ');
    return value || defaultValue;
  };

  const formatNutriment = (value: number | undefined | null, unit: string = "g", defaultValue: string = "N/A") => {
    return (value !== undefined && value !== null) ? `${value}${unit}` : defaultValue; // Rimosso spazio per compattezza se preferito
  };

  // Definisci qui le fasce di punteggio per chiarezza
  const healthScoreRanges = {
    A: { min: 90, max: 100, desc: "eccellente" },
    B: { min: 75, max: 89, desc: "buono" },
    C: { min: 60, max: 74, desc: "discreto" },
    D: { min: 40, max: 59, desc: "scarso" },
    E: { min: 0, max: 39, desc: "molto scarso/da evitare" },
    default: { min: 0, max: 100, desc: "valutato su altri criteri" }
  };

  const nutriScore = product.nutrition_grades?.toUpperCase();
  const currentHealthRange = (nutriScore && healthScoreRanges[nutriScore as keyof typeof healthScoreRanges]) 
                             ? healthScoreRanges[nutriScore as keyof typeof healthScoreRanges] 
                             : healthScoreRanges.default;

  return `
Analizza ATTENTAMENTE e SCRUPOLOSAMENTE il seguente prodotto alimentare per valutarne l'impatto sulla SALUTE e sulla SOSTENIBILITÀ. Fornisci una valutazione critica, concisa e DIRETTA.

OBIETTIVO PRINCIPALE: Fornire all'utente informazioni CHIARE, VERITIERE, ACCURATE e UTILI per prendere decisioni consapevoli, in modo EFFICIENTE.

ISTRUZIONI GENERALI IMPORTANTISSIME:
1.  **DISTINZIONE FONDAMENTALE:** Separa NETTAMENTE i criteri, i pro, i contro e le analisi per la SALUTE da quelli per la SOSTENIBILITÀ. Non confonderli MAI. Esempio: 'confezione in vetro' è sostenibilità, 'basso contenuto di zuccheri' è salute.
2.  **BASATI SUI DATI E CONOSCENZA CONSOLIDATA:** La tua analisi DEVE basarsi ESCLUSIVAMENTE sui dati del prodotto forniti e sulla tua conoscenza generale scientificamente validata (es. linee guida nutrizionali, effetti noti di additivi, impatti ambientali riconosciuti). NON INVENTARE INFORMAZIONI o fare affermazioni non supportate.
3.  **VERIDICITÀ E CERTEZZA:** Fornisci solo informazioni che ritieni affidabili e veritiere secondo le conoscenze attuali. Se i dati forniti sono insufficienti per una valutazione certa su un punto specifico, indicalo o assegna un giudizio/punteggio cauto. NON fare supposizioni azzardate.
4.  **ACCURATEZZA:** Sii accurato. Evita generalizzazioni.
5.  **PUNTEGGI (0-100):** Usa l'INTERO range da 0 a 100.
6.  **FORMATO JSON - GLI ESEMPI SONO SOLO GUIDE:** Il formato JSON sotto specificato mostra la STRUTTURA desiderata. Il testo tra parentesi quadre (es. "[Esempio...]") indica il TIPO di contenuto da generare, MA NON È IL TESTO DA COPIARE. Devi generare i tuoi titoli, dettagli, analisi e raccomandazioni originali basati sui dati del prodotto e sulle istruzioni.

DATI DEL PRODOTTO (usa "Non disponibile" solo se il valore è effettivamente assente o vuoto):
- Nome: ${formatField(product.product_name)}
- Marca: ${formatField(product.brands)}
- Ingredienti (con allergeni): ${formatField(product.ingredients_text_with_allergens || product.ingredients_text)}
- Quantità: ${formatField(product.quantity)}
- Porzione consigliata: ${formatField(product.serving_size)}
- Allergeni (tag): ${formatField(product.allergens_tags)}
- Tracce possibili: ${formatField(product.traces)}
- Additivi (tag E-numbers): ${formatField(product.additives_tags)}
- Gruppo NOVA (Processazione Alimenti): ${formatField(product.nova_group?.toString())} (1=non processato, 2=ingredienti culinari, 3=processato, 4=ultra-processato)
- Paesi di vendita: ${formatField(product.countries)}
- Nutri-Score: ${formatField(nutriScore)}
- Eco-Score (Grado): ${formatField(product.ecoscore_grade?.toUpperCase())}
- Eco-Score (Punteggio Numerico): ${product.ecoscore_score !== undefined ? product.ecoscore_score : "Non disponibile"}
- Packaging (descrizione): ${formatField(product.packaging)}
- Packaging (tag): ${formatField(product.packaging_tags)}
- Impatto ambientale (livello tag): ${formatField(product.environmental_impact_level_tags)}
- Categorie Prodotto: ${formatField(product.categories)}
- Labels/Certificazioni (Biologico, FairTrade, ecc.): ${formatField(product.labels)}
- Avvisi qualità dati OpenFoodFacts: ${formatField(product.data_quality_warnings_tags)}
- Stato completezza dati OpenFoodFacts: ${formatField(product.states_tags)}
${product.ecoscore_data ? `- Dettagli Strutturati Eco-Score: ${JSON.stringify(product.ecoscore_data)}` : ''}

VALORI NUTRIZIONALI (per 100g o 100ml):
- Energia (kcal): ${formatNutriment(product.nutriments?.energy_kcal_100g, "kcal")}
- Grassi Totali: ${formatNutriment(product.nutriments?.fat_100g)}
  - di cui Grassi Saturi: ${formatNutriment(product.nutriments?.saturated_fat_100g)}
  - di cui Grassi Trans: ${formatNutriment(product.nutriments?.trans_fat_100g)}
- Colesterolo: ${formatNutriment(product.nutriments?.cholesterol_100g, "mg")}
- Carboidrati Totali: ${formatNutriment(product.nutriments?.carbohydrates_100g)}
  - di cui Zuccheri: ${formatNutriment(product.nutriments?.sugars_100g)}
- Fibre: ${formatNutriment(product.nutriments?.fiber_100g)}
- Proteine: ${formatNutriment(product.nutriments?.proteins_100g)}
- Sale: ${formatNutriment(product.nutriments?.salt_100g)} (Na x 2.5)
- Sodio: ${formatNutriment(product.nutriments?.sodium_100g, "mg")}

ISTRUZIONI SPECIFICHE PER IL PUNTEGGIO DI SALUTE (healthScore da 0 a 100):
- Se Nutri-Score disponibile (${formatField(nutriScore)}), punteggio nella fascia: A(${healthScoreRanges.A.min}-${healthScoreRanges.A.max}), B(${healthScoreRanges.B.min}-${healthScoreRanges.B.max}), C(${healthScoreRanges.C.min}-${healthScoreRanges.C.max}), D(${healthScoreRanges.D.min}-${healthScoreRanges.D.max}), E(${healthScoreRanges.E.min}-${healthScoreRanges.E.max}).
- Altrimenti, valuta da 0 a 100 basandoti su altri criteri.
- Affina (o determina) il punteggio considerando CRITICAMENTE:
    1. Ingredienti Problematici: Zuccheri, Sale/Sodio, Grassi Saturi/Trans.
    2. Additivi: Valuta i tag E-numbers (segnala i controversi).
    3. Grado di Processazione (Gruppo NOVA): Penalizza NOVA 4, premia 1-2.
    4. Qualità Nutrizionale: Fibre, Proteine, micronutrienti (se noti).

ISTRUZIONI SPECIFICHE PER IL PUNTEGGIO DI SOSTENIBILITÀ (sustainabilityScore da 0 a 100):
- Basa il punteggio su:
    1. Eco-Score (Grado/Numerico).
    2. Packaging (Materiali, Riciclabilità, tag).
    3. Origine/Produzione (Località, Certificazioni Bio/FairTrade/MSC/etc.).
    4. Tipo Prodotto (Impatto intrinseco es. carne vs vegetali).
    5. Ingredienti Controversi (Olio di Palma non sostenibile).
- Se dati scarsi, punteggio cauto (40-60) e motiva.

FORMATO DELLA RISPOSTA (SINGOLO OGGETTO JSON VALIDO, SENZA TESTO EXTRA):
{
  "healthScore": [Punteggio numerico INTERO 0-100 SALUTE],
  "sustainabilityScore": [Punteggio numerico INTERO 0-100 SOSTENIBILITÀ],
  "analysis": "[GENERARE QUI 1-2 FRASI CONCISE SULLA SALUTE basate sui dati] ",
  "pros": [
    {"title": "[GENERARE TITOLO PRO SALUTE CON DATO NUMERICO SE DISPONIBILE] ", "detail": "[GENERARE SPIEGAZIONE SALUTE MOLTO BREVE (max 1 frase)] "}
    // ... Generare altri pro salute se rilevanti e certi ...
  ],
  "cons": [
    {"title": "[GENERARE TITOLO CONTRO SALUTE CON DATO NUMERICO SE DISPONIBILE] ", "detail": "[GENERARE SPIEGAZIONE SALUTE MOLTO BREVE (max 1 frase)] "}
    // ... Generare altri contro salute se rilevanti e certi ...
  ],
  "recommendations": [
    "[GENERARE MAX 1-2 Raccomandazioni SALUTE pratiche e concise] "
  ],
  "sustainabilityAnalysis": "[GENERARE QUI 1-2 FRASI CONCISE SULLA SOSTENIBILITÀ basate sui dati] ",
  "sustainabilityPros": [
     {"title": "[GENERARE TITOLO PRO SOSTENIBILITÀ CON DETTAGLIO DAI DATI SE DISPONIBILE] ", "detail": "[GENERARE SPIEGAZIONE SOSTENIBILITÀ MOLTO BREVE (max 1 frase)] "}
     // ... Generare altri pro sostenibilità se rilevanti e certi ...
  ],
  "sustainabilityCons": [
    {"title": "[GENERARE TITOLO CONTRO SOSTENIBILITÀ CON DETTAGLIO DAI DATI SE DISPONIBILE] ", "detail": "[GENERARE SPIEGAZIONE SOSTENIBILITÀ MOLTO BREVE (max 1 frase)] "}
    // ... Generare altri contro sostenibilità se rilevanti e certi ...
  ],
  "sustainabilityRecommendations": [
    "[GENERARE MAX 1-2 Raccomandazioni SOSTENIBILITÀ pratiche e concise] "
  ]
}

ISTRUZIONI FINALI SUL FORMATO JSON:
- Il \`title\` nei pro/contro DEVE includere il dato numerico specifico (es. "Zuccheri: 22g/100g") SE E SOLO SE disponibile e rilevante. Altrimenti, titolo descrittivo breve.
- Le \`detail\` devono essere ESTREMAMENTE concise (max 1 frase).
- Limita le \`recommendations\` a 1 o 2 per categoria.
- Output ESCLUSIVAMENTE JSON valido.
- PRESTA PARTICOLARE ATTENZIONE ALLA SINTASSI JSON: evita virgole finali in array e oggetti, assicurati che tutte le parentesi ({}, []) siano correttamente bilanciate e chiuse.
`;
};

/**
 * Analizza la risposta di Gemini per estrarre i dati strutturati
 */
const parseGeminiResponse = (response: string): GeminiAnalysisResult => {
  try {
    console.log(`[GEMINI PARSE] Inizio parsing della risposta (lunghezza: ${response.length} caratteri)`)

    // Cerca di estrarre il JSON dalla risposta
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const jsonStr = jsonMatch[0]
      console.log(`[GEMINI PARSE] JSON trovato nella risposta (lunghezza: ${jsonStr.length} caratteri)`)

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
        console.log(`[GEMINI PARSE] Tutti i campi richiesti sono presenti nel JSON`)
        return result
      }
    }

    // Se non riesce a estrarre il JSON o mancano campi, crea un risultato di fallback
    console.warn(`[GEMINI PARSE WARNING] Impossibile analizzare la risposta di Gemini come JSON valido`)
    return createFallbackResult(response)
  } catch (error) {
    console.error(`[GEMINI PARSE ERROR] Errore nell'analisi della risposta di Gemini:`, error)
    return createFallbackResult(response)
  }
}

/**
 * Crea un risultato di fallback se l'analisi della risposta fallisce
 */
const createFallbackResult = (response: string): GeminiAnalysisResult => {
  console.log(`[GEMINI FALLBACK] Creazione risultato di fallback dall'analisi della risposta`)

  // Cerca di estrarre un punteggio numerico dalla risposta
  const healthScoreMatch = response.match(/healthScore["\s:]+(\d+)/)
  const sustainabilityScoreMatch = response.match(/sustainabilityScore["\s:]+(\d+)/)

  const healthScore = healthScoreMatch ? Number.parseInt(healthScoreMatch[1], 10) : 50
  const sustainabilityScore = sustainabilityScoreMatch ? Number.parseInt(sustainabilityScoreMatch[1], 10) : 50

  console.log(`[GEMINI FALLBACK] Punteggi estratti: Health=${healthScore}, Sustainability=${sustainabilityScore}`)

  return {
    healthScore: Math.min(100, Math.max(1, healthScore)), // Assicura che sia tra 1 e 100
    sustainabilityScore: Math.min(100, Math.max(1, sustainabilityScore)), // Assicura che sia tra 1 e 100
    analysis: "Non è stato possibile generare un'analisi dettagliata della salubrità.",
    pros: [{title: "Non disponibile", detail: "Non disponibile"}],
    cons: [{title: "Non disponibile", detail: "Non disponibile"}],
    recommendations: ["Non disponibile"],
    sustainabilityAnalysis: "Non è stato possibile generare un'analisi dettagliata della sostenibilità.",
    sustainabilityPros: [{title: "Non disponibile", detail: "Non disponibile"}],
    sustainabilityCons: [{title: "Non disponibile", detail: "Non disponibile"}],
    sustainabilityRecommendations: ["Non disponibile"],
    productNameFromVision: undefined,
    brandFromVision: undefined,
  }
}

// Funzione helper per convertire Blob in base64 (necessaria in ambiente React Native/browser)
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const result = reader.result as string;
      if (typeof result === 'string' && result.includes(';base64,')) {
        // Estrae la stringa base64 dopo ";base64,"
        const base64String = result.substring(result.indexOf(';base64,') + ';base64,'.length);
        resolve(base64String);
      } else {
        console.error('[GEMINI HELPER ERROR] Formato Data URL non valido o imprevisto durante la conversione blob in base64:', typeof result === 'string' ? result.substring(0, 100) + '...' : 'Risultato non stringa');
        reject(new Error('Impossibile convertire blob in base64: formato Data URL non valido.'));
      }
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Analizza un'immagine di un prodotto alimentare utilizzando Google Gemini Vision
 * @param imageBase64 La stringa base64 dell'immagine
 * @param mimeType Il tipo MIME dell'immagine (es. "image/jpeg", "image/png")
 * @param productNameHint Un nome generico o suggerimento per guidare l'analisi
 * @returns Risultato dell'analisi, inclusi nome e marca identificati (se possibile)
 */
export const analyzeImageWithGeminiVision = async (
    imageBase64: string,      // Modificato da imagePublicUrl
    mimeType: string,         // Nuovo parametro
    productNameHint: string
): Promise<GeminiAnalysisResult> => {
  try {
    console.log(`[GEMINI VISION START] Avvio analisi per immagine fornita come base64 (MIME: ${mimeType}, Hint: ${productNameHint})`);
    console.time(`[GEMINI VISION TIMING] Analisi immagine completa`);

    if (!imageBase64) {
        throw new Error('Stringa base64 dell\'immagine non fornita a Gemini Vision.');
    }
    if (!mimeType) {
        throw new Error('Tipo MIME dell\'immagine non fornito a Gemini Vision.');
    }

    // La logica di download e il ritardo sono stati rimossi.
    // L'immagine è già fornita come base64.

    console.log(`[GEMINI VISION] Immagine base64 ricevuta (lunghezza stringa: ${imageBase64.length})`);

    // Costruisci il prompt per l'analisi visiva
    const prompt = createVisualAnalysisPrompt(productNameHint);
    // console.log(`[GEMINI VISION PROMPT] Prompt generato (lunghezza: ${prompt.length} caratteri)`); // Log opzionale del prompt completo

    // Chiama l'API Gemini Vision usando inlineData
    console.log(`[GEMINI VISION API] Chiamata API con dati immagine inline.`);
    console.time(`[GEMINI VISION API TIMING] Chiamata API`);
    
    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            // TEMPORANEAMENTE COMMENTIAMO L'INVIO DELL'IMMAGINE PER TESTARE LA CONNESSIONE BASE
            {
              inlineData: {
                mimeType: mimeType, 
                data: imageBase64
              }
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2, 
        topK: 32,
        topP: 0.95,
        maxOutputTokens: 2048, 
      },
    };

    const response = await fetch(`${GEMINI_VISION_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
    console.log(`[GEMINI VISION API] Risposta API Gemini ricevuta. Status: ${response.status}`);

    console.timeEnd(`[GEMINI VISION API TIMING] Chiamata API`);

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`[GEMINI VISION API ERROR] Errore nella risposta API:`, errorData);
      throw new Error(`Errore API Gemini Vision: ${errorData.error?.message || "Errore sconosciuto"}`);
    }

    const data = await response.json();
    const generatedText = data.candidates[0]?.content?.parts[0]?.text || "";
    console.log(
      `[GEMINI VISION RESPONSE] Risposta ricevuta (lunghezza: ${generatedText.length} caratteri)`
    );

    // Analizza la risposta di Gemini Vision
    console.log(`[GEMINI VISION PARSE] Analisi della risposta`);
    const result = parseGeminiResponse(generatedText); // Usa lo stesso parser, il formato JSON richiesto è identico

    // Estrai nome e marca identificati (se il parser li gestisce)
    // Questi campi sono stati aggiunti all'interfaccia GeminiAnalysisResult
    // Il parser parseGeminiResponse dovrebbe essere aggiornato per estrarre
    // productNameFromVision e brandFromVision se il prompt li richiede e il modello li fornisce.
    // const identifiedProductName = result.productNameFromVision || productNameHint; // Fallback
    // const identifiedBrand = result.brandFromVision; // Può essere undefined

    console.timeEnd(`[GEMINI VISION TIMING] Analisi immagine completa`);
    console.log(`[GEMINI VISION SUCCESS] Analisi completata:`, {
      healthScore: result.healthScore,
      sustainabilityScore: result.sustainabilityScore,
      // productNameFromVision: identifiedProductName, // Log opzionale
      // brandFromVision: identifiedBrand, // Log opzionale
    });

    // Restituisci il risultato completo
    return result;

  } catch (error) {
    console.error(`[GEMINI VISION ERROR] Errore nell'analisi visiva:`, error);
    throw new Error("Si è verificato un errore durante l'analisi dell'immagine.");
  }
};

/**
 * Crea un prompt dettagliato per l'analisi visiva del prodotto
 */
const createVisualAnalysisPrompt = (productNameHint: string): string => {
  // Prompt simile a quello testuale, ma chiede esplicitamente di identificare il prodotto dall'immagine
  // e include campi specifici per nome e marca identificati nel JSON di risposta.
  return `
Analizza l'immagine fornita di un prodotto alimentare e fornisci:
1. Un possibile NOME per il prodotto (campo "productNameFromVision")
2. Una possibile MARCA per il prodotto (campo "brandFromVision")
3. Punteggi, analisi, pro/contro e raccomandazioni dettagliate come specificato sotto.

Nome del prodotto suggerito (se utile): ${productNameHint}

ISTRUZIONI GENERALI IMPORTANTISSIME:
1.  **DISTINZIONE FONDAMENTALE:** Separa NETTAMENTE i criteri, i pro, i contro e le analisi per la SALUTE da quelli per la SOSTENIBILITÀ. Non confonderli MAI.
2.  **BASATI SULL'IMMAGINE E CONOSCENZA CONSOLIDATA:** La tua analisi DEVE basarsi su ciò che è VISIBILE nell'immagine e sulla tua conoscenza generale scientificamente validata. NON INVENTARE INFORMAZIONI o fare affermazioni non supportate da evidenze visive o inferenze molto solide.
3.  **VERIDICITÀ E CERTEZZA:** Fornisci solo informazioni che ritieni affidabili. Se l'immagine non è chiara o non permette una valutazione certa su un punto specifico, indicalo chiaramente nell'analisi testuale e assegna punteggi cauti (es. intorno a 50).
4.  **PUNTEGGI (0-100) DETERMINISTICI:** I punteggi di salute e sostenibilità DEVONO essere da 0 a 100 e il più DETERMINISTICI e RIPETIBILI possibile per la stessa immagine/prodotto. 
5.  **FORMATO JSON - GLI ESEMPI SONO SOLO GUIDE:** Il formato JSON sotto specificato mostra la STRUTTURA desiderata. Il testo tra parentesi quadre (es. "[Esempio...]") indica il TIPO di contenuto da generare, MA NON È IL TESTO DA COPIARE.

CRITERI DI VALUTAZIONE PER LA SALUBRITÀ (basati sull'immagine):
1. Inferire il tipo di prodotto (es. snack, bevanda, frutta, verdura, piatto pronto).
2. Valutare l'aspetto (es. fresco, processato industrialmente, fritto, glassato, zuccherato, bruciato, presenza di muffe, ecc.).
3. Fare ipotesi caute basate sul tipo di prodotto e aspetto (es. bibita gassata colorata -> probabilmente zuccheri elevati; frutta fresca intatta -> positivo).

CRITERI DI VALUTAZIONE PER LA SOSTENIBILITÀ (basati sull'immagine):
1. Valutare il tipo di imballaggio visibile (es. plastica monouso, vetro, carta, alluminio, multi-materiale, assente).
2. Inferire il tipo di prodotto e il suo impatto ambientale generale (es. carne rossa vs legumi; prodotto locale vs importato se deducibile).
3. Considerare eventuali etichette o loghi visibili (bio, riciclabile, fair trade - se chiaramente leggibili).

FORMATO RISPOSTA (SINGOLO OGGETTO JSON VALIDO, SENZA TESTO EXTRA PRIMA O DOPO):
{
  "productNameFromVision": "[nome identificato dall'immagine o ipotesi migliore e concisa]",
  "brandFromVision": "[marca identificata dall'immagine, o \"Marca non identificabile\" se non visibile/deducibile]",
  "healthScore": [Punteggio numerico INTERO 0-100 SALUTE, basato sull'immagine],
  "sustainabilityScore": [Punteggio numerico INTERO 0-100 SOSTENIBILITÀ, basato sull'immagine],
  "analysis": "[GENERARE QUI 1-2 FRASI CONCISE SULLA SALUTE basate sull'immagine]",
  "pros": [
    {"title": "[GENERARE TITOLO PRO SALUTE DALL'IMMAGINE]", "detail": "[GENERARE SPIEGAZIONE SALUTE MOLTO BREVE (max 1 frase) DALL'IMMAGINE]"}
    // ... Generare ALTRI pro salute SE RILEVANTI E CHIARAMENTE DEDUCIBILI DALL'IMMAGINE ...
  ],
  "cons": [
    {"title": "[GENERARE TITOLO CONTRO SALUTE DALL'IMMAGINE]", "detail": "[GENERARE SPIEGAZIONE SALUTE MOLTO BREVE (max 1 frase) DALL'IMMAGINE]"}
    // ... Generare ALTRI contro salute SE RILEVANTI E CHIARAMENTE DEDUCIBILI DALL'IMMAGINE ...
  ],
  "recommendations": [
    "[GENERARE MAX 1-2 Raccomandazioni SALUTE pratiche e concise BASATE SULL'IMMAGINE]"]
  ],
  "sustainabilityAnalysis": "[GENERARE QUI 1-2 FRASI CONCISE SULLA SOSTENIBILITÀ basate sull'immagine]",
  "sustainabilityPros": [
     {"title": "[GENERARE TITOLO PRO SOSTENIBILITÀ DALL'IMMAGINE]", "detail": "[GENERARE SPIEGAZIONE SOSTENIBILITÀ MOLTO BREVE (max 1 frase) DALL'IMMAGINE]"}
     // ... Generare ALTRI pro sostenibilità SE RILEVANTI E CHIARAMENTE DEDUCIBILI DALL'IMMAGINE ...
  ],
  "sustainabilityCons": [
    {"title": "[GENERARE TITOLO CONTRO SOSTENIBILITÀ DALL'IMMAGINE]", "detail": "[GENERARE SPIEGAZIONE SOSTENIBILITÀ MOLTO BREVE (max 1 frase) DALL'IMMAGINE]"}
    // ... Generare ALTRI contro sostenibilità SE RILEVANTI E CHIARAMENTE DEDUCIBILI DALL'IMMAGINE ...
  ],
  "sustainabilityRecommendations": [
    "[GENERARE MAX 1-2 Raccomandazioni SOSTENIBILITÀ pratiche e concise BASATE SULL'IMMAGINE]"]
  ]
}

ISTRUZIONI FINALI SUL FORMATO JSON:
- I campi \`pros\`, \`cons\`, \`sustainabilityPros\`, \`sustainabilityCons\` DEVONO essere array di oggetti, ciascuno con una chiave \"title\" (stringa breve e descrittiva) e una chiave \"detail\" (stringa, max 1 frase esplicativa). NON usare placeholder come \"[array di...]\". Restituisci un array vuoto [] se non ci sono pro/contro rilevanti.
- Le \`detail\` devono essere ESTREMAMENTE concise.
- Limita le \`recommendations\` a 1 o 2 per categoria. Se non ci sono raccomandazioni specifiche, restituisci un array vuoto [].
- Output ESCLUSIVAMENTE JSON valido. Non includere commenti o testo prima o dopo l'oggetto JSON.
- PRESTA PARTICOLARE ATTENZIONE ALLA SINTASSI JSON: evita virgole finali in array e oggetti, assicurati che tutte le parentesi ({}, []) siano correttamente bilanciate e chiuse, e che le stringhe siano correttamente quotate.
`;
};
