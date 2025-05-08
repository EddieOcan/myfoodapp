import { supabase } from "../lib/supabase"
import { analyzeProductWithGemini, type GeminiAnalysisResult } from "./gemini"
import { analyzeImageWithGeminiVision } from './gemini'
import * as FileSystem from 'expo-file-system'; // Assicurati che sia importato
// import { decode } from 'base64-js'

// Utility per convertire base64 in ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = global.atob(base64); // Usa global.atob per chiarezza in RN, anche se atob è globale
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Interfaccia per i dati grezzi da OpenFoodFacts o input manuale per l'analisi visiva
export interface RawProductData {
  code: string; // Barcode
  product_name?: string;
  image_url?: string; 
  brands?: string;
  ingredients_text?: string;
  ingredients_text_with_allergens?: string; 
  quantity?: string; 
  serving_size?: string; 
  allergens_tags?: string[]; 
  traces?: string; 
  additives_tags?: string[]; 
  nova_group?: number | string; 
  countries?: string; 

  nutrition_grades?: string; 
  ecoscore_grade?: string;   
  ecoscore_score?: number;   
  ecoscore_data?: any;       
  
  packaging?: string; 
  packaging_tags?: string[]; 
  environmental_impact_level_tags?: string[]; 

  categories?: string;
  labels?: string;

  data_quality_warnings_tags?: string[]; 
  states_tags?: string[]; 


  nutriments?: { 
    energy_100g?: number;
    energy_kcal_100g?: number; 
    fat_100g?: number;
    saturated_fat_100g?: number;
    trans_fat_100g?: number; 
    cholesterol_100g?: number; 
    carbohydrates_100g?: number;
    sugars_100g?: number;
    fiber_100g?: number;
    proteins_100g?: number;
    salt_100g?: number;
    sodium_100g?: number; 
  };
}

// Interfaccia che rappresenta un record nella tabella 'products' del DB
export interface ProductRecord {
  id: string; // UUID della riga in 'products'
  user_id: string;
  barcode: string;
  product_name?: string;       // Da RawProductData o analisi visiva
  product_image?: string;      // Path nello storage Supabase
  brand?: string;              // Da RawProductData o analisi visiva
  ingredients?: string;        // Da RawProductData o analisi visiva
  nutrition_grade?: string;    // Da RawProductData (es. Nutri-Score)
  
  // Campi Eco-Score da OpenFoodFacts
  ecoscore_grade?: string;
  ecoscore_score?: number;
  // ecoscore_data?: any; // Considera se salvare l'intero oggetto JSON o solo i campi principali

  // Campi per l'analisi AI (GeminiAnalysisResult)
  health_score?: number;
  sustainability_score?: number;
  health_analysis?: string;
  health_pros?: Array<{title: string, detail: string}>;
  health_cons?: Array<{title: string, detail: string}>;
  health_recommendations?: string[];
  sustainability_analysis?: string;
  sustainability_pros?: Array<{title: string, detail: string}>;
  sustainability_cons?: Array<{title: string, detail: string}>;
  sustainability_recommendations?: string[];
  
  // Campi nutrizionali specifici (da RawProductData.nutriments)
  energy_100g?: number;
  fat_100g?: number;
  carbohydrates_100g?: number;
  proteins_100g?: number;
  salt_100g?: number;
  sugars_100g?: number;
  fiber_100g?: number;
  saturated_fat_100g?: number;
  
  is_visually_analyzed?: boolean; // True se il prodotto è stato aggiunto tramite analisi di immagine senza barcode
  created_at: string;
  updated_at: string;
}


// Interfaccia per l'oggetto restituito da handleBarcodeScan
export interface ProcessedProductInfo {
  productData: RawProductData | null; // Dati da OFF o equivalenti se da DB
  aiAnalysis: GeminiAnalysisResult | null; // Analisi AI
  dbProduct: ProductRecord | null; // Record come salvato/recuperato dal DB
  source: 'database' | 'new_scan' | 'error' | 'not_found_off' | 'database_no_ai' | 'new_scan_off_only';
  errorMessage?: string;
}

// Rivediamo ScannedProduct, potrebbe diventare un tipo per la visualizzazione della cronologia
// che include anche 'scanned_at' dalla tabella user_scan_history.
export interface DisplayableHistoryProduct extends ProductRecord {
  history_id: string; // id dalla tabella user_scan_history
  user_scan_time: string; // scanned_at dalla tabella user_scan_history
}

/**
 * Carica un'immagine del prodotto su Supabase Storage.
 * Il path sarà userId/imageId.ext
 * Restituisce il path pubblico o null in caso di errore.
 */
export const uploadProductImage = async (
  userId: string,
  localImageUri: string,
): Promise<string | null> => {
  try {
    console.log(`[STORAGE UPLOAD] Inizio caricamento immagine per utente ${userId} da URI locale ${localImageUri}`);

    const fileName = `product_image_${userId}_${Date.now()}.${localImageUri.split('.').pop() || 'jpg'}`;
    let mimeType = 'image/jpeg'; // Default
    if (localImageUri.endsWith('.png')) {
      mimeType = 'image/png';
    } else if (localImageUri.endsWith('.webp')) {
      mimeType = 'image/webp';
    }
    console.log(`[STORAGE UPLOAD] Nome file: ${fileName}, MimeType inferito: ${mimeType}`);

    // Leggi il file come stringa base64
    const base64Data = await FileSystem.readAsStringAsync(localImageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log(`[STORAGE UPLOAD] Dati immagine letti come base64 (lunghezza: ${base64Data.length})`);

    // Converti la stringa base64 in ArrayBuffer
    const arrayBuffer = base64ToArrayBuffer(base64Data);
    console.log(`[STORAGE UPLOAD] Base64 convertita in ArrayBuffer (dimensione: ${arrayBuffer.byteLength} bytes)`);

    if (arrayBuffer.byteLength === 0) {
        console.error("[STORAGE UPLOAD ERROR] ArrayBuffer ha dimensione 0, upload annullato.");
        return null;
    }

    const { data, error } = await supabase.storage
      .from("product-images") 
      .upload(fileName, arrayBuffer, { // Carica l'ArrayBuffer
        contentType: mimeType,
        upsert: true, 
      });

    if (error) {
      console.error("[STORAGE ERROR] Errore durante il caricamento dell'ArrayBuffer immagine:", error);
      throw error;
    }

    if (!data || !data.path) {
      console.error("[STORAGE ERROR] Nessun path restituito dopo il caricamento dell'immagine (ArrayBuffer).");
      return null;
    }
    
    const { data: publicUrlData } = supabase.storage.from("product-images").getPublicUrl(data.path);

    console.log(`[STORAGE SUCCESS] Immagine (da ArrayBuffer) caricata con successo: ${publicUrlData.publicUrl}`);
    return publicUrlData.publicUrl;

  } catch (error) {
    console.error("[STORAGE ERROR] Eccezione durante il caricamento dell'immagine (ArrayBuffer approach):", error);
    return null;
  }
};


/**
 * Salva un nuovo prodotto scansionato/analizzato nel database,
 * lo aggiunge alla cronologia dell'utente e gestisce il limite di 10 elementi nella cronologia.
 */
export const saveProductAndManageHistory = async (
  userId: string,
  barcode: string,
  rawProductData: RawProductData, // Dati da OFF o per analisi visiva
  aiAnalysis?: GeminiAnalysisResult | null, // Questo sarà FORNITO per le scansioni visive, null per nuovi barcode
  uploadedImagePublicUrl?: string, // URL pubblico dell'immagine già caricata
  isVisualScan: boolean = false,
): Promise<ProductRecord | null> => {
  console.log(`[API SAVE UPSERT] Inizio upsert prodotto (AI ${aiAnalysis ? 'presente' : 'assente/da generare'}) e gestione cronologia per utente ${userId}, barcode ${barcode}`);
  try {
    // Costruisci il payload per l'upsert.
    // Iniziamo con i campi base.
    const productUpsertPayload: Partial<ProductRecord> & { user_id: string; barcode: string } = {
      user_id: userId,
      barcode: barcode,
      product_name: rawProductData.product_name,
      product_image: uploadedImagePublicUrl, // Può essere l'image_url da OFF o l'URL caricato per scansione visiva
      brand: rawProductData.brands, // Per scansione visiva, rawProductData.brands sarà impostato da productNameFromVision
      ingredients: rawProductData.ingredients_text,
      nutrition_grade: rawProductData.nutrition_grades,
      // Aggiungiamo i campi Eco-Score
      ecoscore_grade: rawProductData.ecoscore_grade,
      ecoscore_score: rawProductData.ecoscore_score,
      // ecoscore_data: rawProductData.ecoscore_data, // Se decidi di salvarlo
      
      energy_100g: rawProductData.nutriments?.energy_100g,
      fat_100g: rawProductData.nutriments?.fat_100g,
      carbohydrates_100g: rawProductData.nutriments?.carbohydrates_100g,
      proteins_100g: rawProductData.nutriments?.proteins_100g,
      salt_100g: rawProductData.nutriments?.salt_100g,
      sugars_100g: rawProductData.nutriments?.sugars_100g,
      fiber_100g: rawProductData.nutriments?.fiber_100g,
      saturated_fat_100g: rawProductData.nutriments?.saturated_fat_100g,
      
      is_visually_analyzed: isVisualScan,
      // updated_at sarà gestito automaticamente da Supabase sull'update del conflitto
    };

    // Aggiungi i campi dell'analisi AI al payload SE aiAnalysis è fornito.
    // Questo è cruciale per le scansioni visive dove l'AI è già stata fatta.
    // Per le scansioni barcode, aiAnalysis sarà null qui, e questi campi non verranno sovrascritti
    // (o verranno impostati se è la prima volta e il DB permette null).
    // L'aggiornamento AI per i barcode avviene dopo, con fetchOrGenerateAiAnalysisAndUpdateProduct.
    if (aiAnalysis) {
      console.log(`[API SAVE UPSERT] aiAnalysis fornito. Inclusione dei campi AI nel payload per ${barcode}.`);
      productUpsertPayload.health_score = aiAnalysis.healthScore;
      productUpsertPayload.sustainability_score = aiAnalysis.sustainabilityScore;
      productUpsertPayload.health_analysis = aiAnalysis.analysis;
      productUpsertPayload.health_pros = aiAnalysis.pros;
      productUpsertPayload.health_cons = aiAnalysis.cons;
      productUpsertPayload.health_recommendations = aiAnalysis.recommendations;
      productUpsertPayload.sustainability_analysis = aiAnalysis.sustainabilityAnalysis;
      productUpsertPayload.sustainability_pros = aiAnalysis.sustainabilityPros;
      productUpsertPayload.sustainability_cons = aiAnalysis.sustainabilityCons;
      productUpsertPayload.sustainability_recommendations = aiAnalysis.sustainabilityRecommendations;
      // Se i campi AI erano null nel DB e ora vengono forniti, verranno aggiornati.
      // Se erano già presenti e vengono forniti di nuovo (es. ri-analisi visiva), verranno sovrascritti.
    } else {
      console.log(`[API SAVE UPSERT] aiAnalysis NON fornito per ${barcode}. I campi AI non saranno modificati/impostati in questo upsert.`);
      // Se si volesse esplicitamente impostare a null i campi AI se aiAnalysis non è fornito,
      // andrebbe fatto qui. Ma l'approccio corrente è di non toccarli, lasciando che
      // fetchOrGenerateAiAnalysisAndUpdateProduct li gestisca per i barcode.
    }

    const { data: upsertedRecord, error: upsertError } = await supabase
      .from("products")
      .upsert(productUpsertPayload as any, { // Cast ad 'any' o tipo più specifico se Omit crea problemi con l'upsert
        onConflict: 'user_id,barcode', 
        // ignoreDuplicates: false, // default è false (comportamento di update)
      })
      .select() 
      .single();

    if (upsertError) {
      console.error("[DB ERROR] Errore durante l'UPSERT del prodotto:", upsertError);
      throw upsertError; 
    }

    if (!upsertedRecord) {
        console.error("[DB ERROR] Nessun record prodotto restituito dopo l'UPSERT.");
        return null; 
    }
    
    const savedProductRecord = upsertedRecord as ProductRecord;
    console.log(`[DB SUCCESS] Prodotto UPSERTED (ID: ${savedProductRecord.id}) in 'products'.`);
    console.log(`[DB SUCCESS] Dettagli salvati: EcoScore Grade: ${savedProductRecord.ecoscore_grade}, AI Health Score: ${savedProductRecord.health_score}, Visually Analyzed: ${savedProductRecord.is_visually_analyzed}`);


    // 2. Aggiungi/Aggiorna il prodotto nella cronologia dell'utente
    const { error: historyUpsertError } = await supabase
      .from("user_scan_history")
      .upsert({
        user_id: userId,
        product_id: savedProductRecord.id, // FK alla tabella products
        scanned_at: new Date().toISOString() // Aggiorna sempre l'ora della scansione
      },
      { onConflict: 'user_id, product_id' } // Upsert basato sulla coppia user_id, product_id
    );

    if (historyUpsertError) {
      console.error("[DB ERROR] Errore durante l'upsert nella cronologia (post product upsert):", historyUpsertError);
      // Non bloccare l'operazione principale per questo, ma logga l'errore.
    } else {
      console.log(`[DB SUCCESS] Cronologia aggiornata per prodotto ${savedProductRecord.id}.`);
    }

    return savedProductRecord; // Restituisce il record completo (con o senza AI, a seconda di cosa c'era prima nel DB)

  } catch (error) {
    console.error(`[API ERROR] Errore in saveProductAndManageHistory (UPSERT) per utente ${userId}, barcode ${barcode}:`, error);
    return null; // Restituisce null in caso di errore critico
  }
};


/**
 * Aggiunge un prodotto (un record specifico dalla tabella 'products') ai preferiti dell'utente.
 */
export const addProductToFavorites = async (userId: string, productRecordId: string): Promise<boolean> => {
  try {
    console.log(`[API FAVORITES] Utente ${userId} aggiunge prodotto ${productRecordId} ai preferiti.`);
    const { error } = await supabase
      .from("user_favorites")
      .insert({
      user_id: userId,
        product_id: productRecordId,
        // favorited_at è gestito automaticamente da Supabase (o created_at se così chiamata)
      })
      // .onConflict(['user_id', 'product_id']) // Opzionale: per ignorare se già esiste
      // .ignore(); // se usi onConflict

    if (error) {
      // Se il vincolo UNIQUE (user_id, product_id) è attivo, un tentativo di duplicato darà errore 23505
      if (error.code === '23505') { // Codice per unique_violation in PostgreSQL
        console.log(`[DB INFO] Prodotto ${productRecordId} già nei preferiti per utente ${userId}.`);
        return true; // Consideralo un successo se era già lì
      }
      console.error("[DB ERROR] Errore durante l'aggiunta ai preferiti:", error);
      throw error;
    }
    console.log(`[DB SUCCESS] Prodotto ${productRecordId} aggiunto ai preferiti per utente ${userId}.`);
    return true;
  } catch (error) {
    console.error(`[API ERROR] Errore in addProductToFavorites per utente ${userId}, prodotto ${productRecordId}:`, error);
    return false;
  }
};


/**
 * Rimuove un prodotto dai preferiti dell'utente.
 */
export const removeProductFromFavorites = async (userId: string, productRecordId: string): Promise<boolean> => {
  try {
    console.log(`[API FAVORITES] Utente ${userId} rimuove prodotto ${productRecordId} dai preferiti.`);
    const { error } = await supabase
      .from("user_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("product_id", productRecordId);

    if (error) {
      console.error("[DB ERROR] Errore durante la rimozione dai preferiti:", error);
      throw error;
    }
    console.log(`[DB SUCCESS] Prodotto ${productRecordId} rimosso dai preferiti per utente ${userId}.`);
    return true;
  } catch (error) {
    console.error(`[API ERROR] Errore in removeProductFromFavorites per utente ${userId}, prodotto ${productRecordId}:`, error);
    return false;
  }
};


/**
 * Recupera la cronologia delle scansioni dell'utente (ultimi 10 prodotti).
 * Ogni elemento include i dati completi del prodotto dalla tabella 'products'.
 */
export const getScanHistory = async (userId: string): Promise<DisplayableHistoryProduct[]> => {
  try {
    console.log(`[API FETCH] Recupero cronologia scansioni per utente ${userId}.`);
    const { data: historyEntries, error } = await supabase
      .from("user_scan_history")
      .select(`
        id,
        scanned_at,
        products (
          *,
          user_id 
        )
      `)
      .eq("user_id", userId)
      .order("scanned_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("[DB ERROR] Errore nel recupero della cronologia:", error);
      throw error;
    }

    if (!historyEntries) {
      return [];
    }
    
    // Trasforma i dati per l'UI
    const displayableHistory: DisplayableHistoryProduct[] = historyEntries.map((entry: any) => {
      // La join di Supabase mette l'oggetto 'products' come una proprietà
      // Se 'products' fosse null (non dovrebbe succedere con FK corretta), gestiscilo
      const productData = entry.products as ProductRecord; 
      return {
        ...productData,
        history_id: entry.id, // ID della riga in user_scan_history
        user_scan_time: entry.scanned_at, // scanned_at da user_scan_history
      };
    }).filter(item => item.id !== undefined); // Assicura che il prodotto esista

    console.log(`[DB SUCCESS] Recuperati ${displayableHistory.length} elementi per la cronologia utente ${userId}.`);
    return displayableHistory;

  } catch (error) {
    console.error(`[API ERROR] Errore in getScanHistory per utente ${userId}:`, error);
    return [];
  }
};

/**
 * Recupera i prodotti preferiti dell'utente.
 * Ogni elemento include i dati completi del prodotto dalla tabella 'products'.
 */
export const getFavoriteProducts = async (userId: string): Promise<ProductRecord[]> => {
  try {
    console.log(`[API FETCH] Recupero prodotti preferiti per utente ${userId}.`);
    const { data: favoriteEntries, error } = await supabase
      .from("user_favorites")
      .select(`
        id, 
        created_at, 
        products (
          *
        )
      `) // created_at qui è di user_favorites, non di products
      .eq("user_id", userId)
      .order("created_at", { ascending: false }); // O il nome della colonna timestamp in user_favorites

    if (error) {
      console.error("[DB ERROR] Errore nel recupero dei preferiti:", error);
      throw error;
    }

    if (!favoriteEntries) {
      return [];
    }

    // Estrai e restituisci solo i dati dei prodotti
    const favoriteProducts: ProductRecord[] = favoriteEntries.map((entry: any) => entry.products as ProductRecord).filter(p => p !== null);
    
    console.log(`[DB SUCCESS] Recuperati ${favoriteProducts.length} prodotti preferiti per utente ${userId}.`);
    return favoriteProducts;

  } catch (error) {
    console.error(`[API ERROR] Errore in getFavoriteProducts per utente ${userId}:`, error);
    return [];
  }
};

// Funzione per generare un barcode sintetico per prodotti senza codice
// Questa funzione potrebbe essere ancora utile
export const generateVisualScanBarcode = (): string => {
  const timestamp = new Date().getTime();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const syntheticBarcode = `VISUAL_${timestamp}_${randomSuffix}`;
  console.log(`[UTIL] Generato barcode sintetico per scansione visiva: ${syntheticBarcode}`);
  return syntheticBarcode;
};


export const fetchProductFromOpenFoodFacts = async (barcode: string): Promise<RawProductData | null> => {
  try {
    console.log(`[API FETCH] Recupero dati per il prodotto ${barcode} da OpenFoodFacts`);
    console.time(`[API TIMING] Recupero dati OpenFoodFacts per ${barcode}`);

    // Verifica se il barcode è uno sintetico per scansioni visive
    if (barcode.startsWith("VISUAL_")) {
      console.log(`[API INFO] Il barcode ${barcode} è sintetico (scansione visiva), skip OpenFoodFacts.`);
      // Per i barcode sintetici, non ci sono dati da OFF.
      // Restituiamo un oggetto RawProductData minimo, che verrà poi popolato dall'analisi AI e dall'immagine.
      return {
        code: barcode, // Manteniamo il barcode sintetico
        product_name: "Prodotto da analisi visiva", // Placeholder
        // Altri campi possono essere omessi o impostati a default se necessario
      };
    }

    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await response.json();

    console.timeEnd(`[API TIMING] Recupero dati OpenFoodFacts per ${barcode}`);

    if (data.status === 0) {
      console.warn(`[API WARN] Prodotto ${barcode} non trovato su OpenFoodFacts.`);
      // Non lanciare errore qui, l'analisi AI potrebbe comunque funzionare con l'immagine
      return null; 
    }

    const offProduct = data.product; // Riferimento più corto a data.product

    const product: RawProductData = {
      code: data.code, 
      product_name: offProduct.product_name || undefined,
      image_url: offProduct.image_url || undefined,
      brands: offProduct.brands || undefined,
      ingredients_text: offProduct.ingredients_text || undefined,
      ingredients_text_with_allergens: offProduct.ingredients_text_with_allergens || offProduct.ingredients_text || undefined,
      quantity: offProduct.quantity || undefined,
      serving_size: offProduct.serving_size || undefined,
      allergens_tags: offProduct.allergens_tags || [], 
      traces: offProduct.traces || undefined, 
      additives_tags: offProduct.additives_tags || [], 
      nova_group: offProduct.nova_group || undefined, 
      countries: offProduct.countries || undefined,

      nutrition_grades: offProduct.nutrition_grades || undefined,
      ecoscore_grade: offProduct.ecoscore_grade || undefined, 
      ecoscore_score: offProduct.ecoscore_score || undefined, 
      ecoscore_data: offProduct.ecoscore_data || undefined, 
      
      packaging: offProduct.packaging || undefined, 
      packaging_tags: offProduct.packaging_tags || [], 
      environmental_impact_level_tags: offProduct.environmental_impact_level_tags || [], 

      categories: offProduct.categories || undefined,
      labels: offProduct.labels || undefined,

      data_quality_warnings_tags: offProduct.data_quality_warnings_tags || [],
      states_tags: offProduct.states_tags || [],

      nutriments: {
        energy_100g: offProduct.nutriments?.energy_100g,
        energy_kcal_100g: offProduct.nutriments?.['energy-kcal_100g'] || offProduct.nutriments?.energy_value,
        fat_100g: offProduct.nutriments?.fat_100g,
        saturated_fat_100g: offProduct.nutriments?.saturated_fat_100g,
        trans_fat_100g: offProduct.nutriments?.trans_fat_100g,
        cholesterol_100g: offProduct.nutriments?.cholesterol_100g,
        carbohydrates_100g: offProduct.nutriments?.carbohydrates_100g,
        sugars_100g: offProduct.nutriments?.sugars_100g,
        fiber_100g: offProduct.nutriments?.fiber_100g,
        proteins_100g: offProduct.nutriments?.proteins_100g,
        salt_100g: offProduct.nutriments?.salt_100g,
        sodium_100g: offProduct.nutriments?.sodium_100g,
      },
    };

    console.log(`[API SUCCESS] Dati per il prodotto ${barcode} recuperati da OpenFoodFacts.`);
    return product;
  } catch (error) {
    console.error(`[API ERROR] Errore nel recupero dei dati del prodotto ${barcode} da OpenFoodFacts:`, error);
    // In caso di errore di rete o altro, restituisci null per permettere fallback a scansione visiva se applicabile
    return null;
  }
};

/**
 * Funzione di utility per eliminare un'immagine dallo storage di Supabase.
 * Usata internamente quando un prodotto viene rimosso dalla tabella 'products'.
 */
const deleteImageFromStorage = async (imagePath: string): Promise<void> => {
  if (!imagePath) return;

  // L'imagePath potrebbe essere un URL pubblico. Dobbiamo estrarre il path relativo al bucket.
  // Esempio URL: https://<idprogetto>.supabase.co/storage/v1/object/public/product_images/userId/image.jpg
  // Path da usare con API: userId/image.jpg
  let relativePath = imagePath;
  try {
    const url = new URL(imagePath);
    // Il path nel bucket inizia dopo "/public/" o "/object/" e il nome del bucket
    const pathParts = url.pathname.split('/');
    const bucketNameIndex = pathParts.indexOf('product-images'); // Modificato da product_images
    if (bucketNameIndex !== -1 && bucketNameIndex + 1 < pathParts.length) {
      relativePath = pathParts.slice(bucketNameIndex + 1).join('/');
    } else {
      console.warn(`[STORAGE DELETE WARN] Impossibile estrarre il path relativo per l'eliminazione da: ${imagePath}`);
      // Potrebbe essere già un path relativo, proviamo comunque
  }
  } catch (e) {
    // Non è un URL valido, potrebbe essere già un path relativo
    console.log(`[STORAGE DELETE INFO] ${imagePath} non è un URL, lo tratto come path relativo.`);
  }
  
  if (!relativePath) {
      console.warn(`[STORAGE DELETE WARN] Path relativo vuoto per l'immagine: ${imagePath}, eliminazione saltata.`);
      return;
  }

  console.log(`[STORAGE DELETE] Tentativo di eliminazione immagine: ${relativePath}`);
  const { error: deleteError } = await supabase.storage
    .from("product-images")
    .remove([relativePath]);

  if (deleteError) {
    console.error(`[STORAGE ERROR] Errore durante l'eliminazione dell'immagine ${relativePath}:`, deleteError);
  } else {
    console.log(`[STORAGE SUCCESS] Immagine ${relativePath} eliminata con successo.`);
  }
};

// Le funzioni originali per l'analisi Gemini (analyzeProductWithGemini, analyzeImageWithGeminiVision)
// rimangono in ./gemini.ts e verranno chiamate dal codice dell'UI prima di invocare
// saveProductAndManageHistory.

/**
 * Recupera un singolo record di prodotto dalla tabella 'products' usando il suo ID.
 */
export const getProductRecordById = async (productRecordId: string): Promise<ProductRecord | null> => {
  try {
    console.log(`[API FETCH] Recupero ProductRecord con ID: ${productRecordId}`);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", productRecordId)
      .maybeSingle();

    if (error) {
      console.error(`[DB ERROR] Errore nel recupero del ProductRecord ${productRecordId}:`, error);
      throw error;
    }

    if (!data) {
      console.log(`[DB INFO] Nessun ProductRecord trovato con ID: ${productRecordId}`);
      return null;
    }
    
    console.log(`[DB SUCCESS] ProductRecord ${productRecordId} recuperato.`);
    // Assicurati che i campi array siano effettivamente array se Supabase li restituisce come stringhe
    // Questo dipende dalla configurazione di Supabase e da come gestisce i tipi array in select("*")
    // Per ora, assumiamo che Supabase li restituisca correttamente o che il tipo ProductRecord gestisca stringhe.
    return data as ProductRecord;
  } catch (error) {
    console.error(`[API ERROR] Errore in getProductRecordById per ID ${productRecordId}:`, error);
    return null;
  }
};

/**
 * Verifica se un prodotto (identificato dal suo productRecordId) è nei preferiti dell'utente.
 */
export const isProductInFavorites = async (userId: string, productRecordId: string): Promise<boolean> => {
  try {
    console.log(`[API CHECK FAVORITE] Controllo se ${productRecordId} è nei preferiti di ${userId}`);
    const { data, error, count } = await supabase
      .from("user_favorites")
      .select("id", { count: "exact" }) // Seleziona solo l'ID e chiedi il conteggio
      .eq("user_id", userId)
      .eq("product_id", productRecordId);

    if (error) {
      console.error("[DB ERROR] Errore nel controllo dei preferiti:", error);
      // Non lanciare errore, considera come "non nei preferiti" in caso di dubbio o errore DB
      return false;
    }
    
    const isSaved = count !== null && count > 0;
    console.log(`[DB RESULT] Prodotto ${productRecordId} ${isSaved ? "TROVATO" : "NON TROVATO"} nei preferiti di ${userId}. Conteggio: ${count}`);
    return isSaved;

  } catch (error) {
    console.error(`[API ERROR] Errore in isProductInFavorites per utente ${userId}, prodotto ${productRecordId}:`, error);
    return false;
  }
};

export const handleBarcodeScan = async (
  barcode: string,
  userId: string,
): Promise<ProcessedProductInfo> => {
  console.log(`[PROCESS BARCODE] Avvio processo per barcode: ${barcode}, utente: ${userId}`);

  try {
    // 1. Controlla se il prodotto esiste già nel DB per questo utente
    // Questo controllo è ancora utile per decidere rapidamente se andare a OFF o meno,
    // e per recuperare l'AI se già presente. L'upsert in saveProductAndManageHistory
    // gestirà la concorrenza a livello di scrittura dei dati base.
    const { data: existingProductRecord, error: fetchExistingError } = await supabase
      .from('products')
      .select('*') 
      .eq('barcode', barcode)
      .eq('user_id', userId)
      .eq('is_visually_analyzed', false) 
      .maybeSingle(); 

    if (fetchExistingError && fetchExistingError.code !== 'PGRST116') { // PGRST116: "Searched item not found"
      console.error('[DB ERROR] Errore nel cercare prodotto esistente:', fetchExistingError);
      return {
        productData: null, aiAnalysis: null, dbProduct: null, 
        source: 'error', errorMessage: "Errore nel recupero dati dal database." 
      };
    }

    if (existingProductRecord) {
      console.log(`[PROCESS BARCODE] Prodotto ${barcode} trovato nel database per utente ${userId}. ID: ${existingProductRecord.id}`);

      // Aggiorna la cronologia (upsert per scanned_at)
      const { error: historyUpsertError } = await supabase
        .from('user_scan_history')
        .upsert(
          { user_id: userId, product_id: existingProductRecord.id, scanned_at: new Date().toISOString() },
          { onConflict: 'user_id, product_id' } 
        );

      if (historyUpsertError) {
        console.warn('[DB WARN] Mancato aggiornamento scanned_at nella cronologia per prodotto esistente:', historyUpsertError);
      } else {
         console.log(`[DB INFO] Cronologia aggiornata per prodotto esistente ${existingProductRecord.id}`);
      }
      
      const productDataFromDb: RawProductData = {
        code: existingProductRecord.barcode,
        product_name: existingProductRecord.product_name,
        image_url: existingProductRecord.product_image, 
        brands: existingProductRecord.brand,
        ingredients_text: existingProductRecord.ingredients,
        nutrition_grades: existingProductRecord.nutrition_grade,
        // Aggiungiamo i campi Eco-Score anche qui per coerenza
        ecoscore_grade: existingProductRecord.ecoscore_grade,
        ecoscore_score: existingProductRecord.ecoscore_score,
        // ecoscore_data: existingProductRecord.ecoscore_data, // Se salvato
        nutriments: {
          energy_100g: existingProductRecord.energy_100g,
          fat_100g: existingProductRecord.fat_100g,
          carbohydrates_100g: existingProductRecord.carbohydrates_100g,
          proteins_100g: existingProductRecord.proteins_100g,
          salt_100g: existingProductRecord.salt_100g,
          sugars_100g: existingProductRecord.sugars_100g,
          fiber_100g: existingProductRecord.fiber_100g,
          saturated_fat_100g: existingProductRecord.saturated_fat_100g,
        }
      };

      // Controlla se l'analisi AI è presente
      const aiPresent = existingProductRecord.health_score !== undefined && existingProductRecord.health_score !== null;
      let aiAnalysisFromDb: GeminiAnalysisResult | null = null;
      if (aiPresent) {
        aiAnalysisFromDb = {
          healthScore: existingProductRecord.health_score ?? 0,
          sustainabilityScore: existingProductRecord.sustainability_score ?? 0,
          analysis: existingProductRecord.health_analysis ?? '',
          pros: existingProductRecord.health_pros ?? [],
          cons: existingProductRecord.health_cons ?? [],
          recommendations: existingProductRecord.health_recommendations ?? [],
          sustainabilityAnalysis: existingProductRecord.sustainability_analysis ?? '',
          sustainabilityPros: existingProductRecord.sustainability_pros ?? [],
          sustainabilityCons: existingProductRecord.sustainability_cons ?? [],
          sustainabilityRecommendations: existingProductRecord.sustainability_recommendations ?? [],
        };
      }
      
      console.log(`[PROCESS BARCODE] Dati per ${barcode} recuperati dal DB. AI ${aiPresent ? 'presente' : 'assente'}.`);
      return {
        productData: productDataFromDb,
        aiAnalysis: aiAnalysisFromDb, // Sarà null se AI non presente
        dbProduct: existingProductRecord,
        source: aiPresent ? 'database' : 'database_no_ai', // Nuova source per UI
      };
    }

    console.log(`[PROCESS BARCODE] Prodotto ${barcode} non trovato nel DB. Avvio recupero da OpenFoodFacts.`);
    const rawProductDataFromOFF = await fetchProductFromOpenFoodFacts(barcode);

    if (!rawProductDataFromOFF || !rawProductDataFromOFF.product_name) { 
      console.warn(`[API WARN] Nessun dato trovato su OpenFoodFacts per il barcode: ${barcode} o prodotto senza nome.`);
      return { 
        productData: null, aiAnalysis: null, dbProduct: null, 
        source: 'not_found_off', errorMessage: `Prodotto con barcode ${barcode} non trovato su OpenFoodFacts o dati incompleti.` 
      };
    }
    console.log(`[PROCESS BARCODE] Dati da OFF per ${barcode} recuperati. Salvataggio dati base e cronologia.`);

    // Salva i dati base da OFF, senza AI. uploadedImagePublicUrl sarà l'image_url da OFF.
    // La funzione saveProductAndManageHistory gestirà l'insert/update e la cronologia.
    const savedProductAfterOFF = await saveProductAndManageHistory(
      userId,
      barcode,
      rawProductDataFromOFF,
      null, // AI ANALYSIS è NULL INIZIALMENTE
      rawProductDataFromOFF.image_url, 
      false 
    );

    if (!savedProductAfterOFF) {
        console.error(`[API ERROR] Salvataggio (upsert) del prodotto ${barcode} da OFF (senza AI) fallito.`);
        // Se saveProductAndManageHistory restituisce null, significa che c'è stato un errore nell'upsert.
        return {
            productData: rawProductDataFromOFF, 
            aiAnalysis: null, 
            dbProduct: null, 
            source: 'error', errorMessage: `Salvataggio del prodotto ${barcode} nel database fallito dopo recupero da OFF.`
        };
    }
    console.log(`[PROCESS BARCODE] Prodotto ${barcode} salvato/aggiornato (senza AI specifica in questa fase) con ID: ${savedProductAfterOFF.id}.`);

    // Ora l'UI navigherà e ProductDetailScreen si occuperà di chiamare per l'AI.
    // savedProductAfterOFF contiene lo stato del prodotto dopo l'upsert (potrebbe avere vecchia AI se esisteva)
    return {
      productData: rawProductDataFromOFF, // Dati freschi da OFF
      aiAnalysis: null, // AI non ancora generata/recuperata in questo flusso specifico
      dbProduct: savedProductAfterOFF, // Record del DB dopo l'upsert dei dati base
      source: 'new_scan_off_only', 
    };

  } catch (error) {
    console.error(`[API ERROR] Errore critico in handleBarcodeScan per barcode ${barcode}:`, error);
    return { 
        productData: null, aiAnalysis: null, dbProduct: null, 
        source: 'error', errorMessage: `Errore durante la processazione del barcode ${barcode}: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

/**
 * Nuova funzione per ottenere/generare l'analisi AI e aggiornare il prodotto.
 */
export const fetchOrGenerateAiAnalysisAndUpdateProduct = async (
  productRecordId: string,
  userId: string, // Aggiunto userId per coerenza e potenziali controlli futuri
  rawProductDataSource: RawProductData // Dati base del prodotto (da OFF o DB senza AI)
): Promise<GeminiAnalysisResult | null> => {
  console.log(`[AI FETCH/GEN] Inizio processo AI per ProductRecord ID: ${productRecordId}, Utente: ${userId}`);
  try {
    // 1. Controlla se l'analisi AI esiste già nel DB per questo prodotto
    const existingProduct = await getProductRecordById(productRecordId);

    if (!existingProduct) {
      console.error(`[AI FETCH/GEN ERROR] Prodotto con ID ${productRecordId} non trovato.`);
      return null;
    }

    if (existingProduct.health_score !== undefined && existingProduct.health_score !== null) {
      console.log(`[AI FETCH/GEN] Analisi AI già presente nel DB per ${productRecordId}.`);
      return {
        healthScore: existingProduct.health_score ?? 0, 
        sustainabilityScore: existingProduct.sustainability_score ?? 0,
        analysis: existingProduct.health_analysis ?? '',
        pros: existingProduct.health_pros ?? [],
        cons: existingProduct.health_cons ?? [],
        recommendations: existingProduct.health_recommendations ?? [],
        sustainabilityAnalysis: existingProduct.sustainability_analysis ?? '',
        sustainabilityPros: existingProduct.sustainability_pros ?? [],
        sustainabilityCons: existingProduct.sustainability_cons ?? [],
        sustainabilityRecommendations: existingProduct.sustainability_recommendations ?? [],
      };
    }

    console.log(`[AI FETCH/GEN] Analisi AI non trovata per ${productRecordId}. Avvio generazione con Gemini.`);
    // Assicurati che rawProductDataSource non sia null e contenga dati utili per Gemini
    if (!rawProductDataSource || !rawProductDataSource.product_name) {
        console.error(`[AI FETCH/GEN ERROR] Dati prodotto insufficienti per l'analisi AI (rawProductDataSource):`, rawProductDataSource);
        // Potremmo voler restituire un errore specifico o null
        return null;
    }

    const aiAnalysisResult = await analyzeProductWithGemini(rawProductDataSource);

    if (!aiAnalysisResult) {
      console.error(`[AI FETCH/GEN ERROR] Generazione analisi AI fallita per ${productRecordId}.`);
      return null;
    }
    console.log(`[AI FETCH/GEN] Analisi AI generata per ${productRecordId}. Aggiornamento DB...`);

    // 4. Aggiorna il ProductRecord nel DB con i risultati dell'AI
    const updatePayload = {
      health_score: aiAnalysisResult.healthScore,
      sustainability_score: aiAnalysisResult.sustainabilityScore,
      health_analysis: aiAnalysisResult.analysis || undefined,
      health_pros: aiAnalysisResult.pros || [],
      health_cons: aiAnalysisResult.cons || [],
      health_recommendations: aiAnalysisResult.recommendations || [],
      sustainability_analysis: aiAnalysisResult.sustainabilityAnalysis || undefined,
      sustainability_pros: aiAnalysisResult.sustainabilityPros || [],
      sustainability_cons: aiAnalysisResult.sustainabilityCons || [],
      sustainability_recommendations: aiAnalysisResult.sustainabilityRecommendations || [],
      updated_at: new Date().toISOString(), // Forza l'aggiornamento di updated_at
    };

    const { data: updatedProduct, error: updateError } = await supabase
      .from("products")
      .update(updatePayload)
      .eq("id", productRecordId)
      .select()
      .single();

    if (updateError) {
      console.error(`[AI FETCH/GEN DB ERROR] Errore durante l'aggiornamento del prodotto ${productRecordId} con i dati AI:`, updateError);
      // Restituisci comunque l'analisi AI generata, l'UI può tentare di salvare di nuovo o gestire
      return aiAnalysisResult; 
    }
    
    if (!updatedProduct) {
        console.error(`[AI FETCH/GEN DB ERROR] Nessun record restituito dopo l'aggiornamento del prodotto ${productRecordId} con AI.`);
        // Restituisci comunque l'analisi AI, magari l'update è andato a buon fine ma il select no
        return aiAnalysisResult;
    }

    console.log(`[AI FETCH/GEN SUCCESS] Prodotto ${productRecordId} aggiornato con successo con i dati AI.`);
    return aiAnalysisResult;

  } catch (error) {
    console.error(`[AI FETCH/GEN CRITICAL ERROR] Errore critico in fetchOrGenerateAiAnalysisAndUpdateProduct per ${productRecordId}:`, error);
    return null;
  }
};
