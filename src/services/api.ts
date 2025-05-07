import { supabase } from "../lib/supabase"
import { analyzeProductWithGemini, type GeminiAnalysisResult } from "./gemini"

export interface Product {
  code: string
  product_name: string
  image_url: string
  brands: string
  ingredients_text: string
  nutrition_grades: string
  ecoscore_grade?: string
  origins?: string
  packaging?: string
  categories?: string
  labels?: string
  nutriments: {
    energy_100g: number
    fat_100g: number
    carbohydrates_100g: number
    proteins_100g: number
    salt_100g: number
    sugars_100g?: number
    fiber_100g?: number
    saturated_fat_100g?: number
  }
  geminiAnalysis?: GeminiAnalysisResult
}

export interface ScannedProduct {
  id: string
  barcode: string
  product_name: string
  product_image: string
  brand: string
  ingredients: string
  nutrition_grade: string
  health_score?: number
  sustainability_score?: number
  scanned_at: string
}

export const fetchProductByBarcode = async (barcode: string): Promise<Product> => {
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`)
    const data = await response.json()

    if (data.status === 0) {
      throw new Error("Prodotto non trovato. Verifica il codice a barre e riprova.")
    }

    const product: Product = {
      code: data.code,
      product_name: data.product.product_name || "Nome non disponibile",
      image_url: data.product.image_url || "",
      brands: data.product.brands || "Marca non disponibile",
      ingredients_text: data.product.ingredients_text || "Ingredienti non disponibili",
      nutrition_grades: data.product.nutrition_grades || "N/A",
      ecoscore_grade: data.product.ecoscore_grade || undefined,
      origins: data.product.origins || undefined,
      packaging: data.product.packaging || undefined,
      categories: data.product.categories || undefined,
      labels: data.product.labels || undefined,
      nutriments: {
        energy_100g: data.product.nutriments?.energy_100g || 0,
        fat_100g: data.product.nutriments?.fat_100g || 0,
        carbohydrates_100g: data.product.nutriments?.carbohydrates_100g || 0,
        proteins_100g: data.product.nutriments?.proteins_100g || 0,
        salt_100g: data.product.nutriments?.salt_100g || 0,
        sugars_100g: data.product.nutriments?.sugars_100g || 0,
        fiber_100g: data.product.nutriments?.fiber_100g || 0,
        saturated_fat_100g: data.product.nutriments?.saturated_fat_100g || 0,
      },
    }

    // Analizza il prodotto con Google Gemini
    try {
      product.geminiAnalysis = await analyzeProductWithGemini(product)
    } catch (geminiError) {
      console.error("Errore nell'analisi con Gemini:", geminiError)
      // Continua senza l'analisi di Gemini
    }

    return product
  } catch (error) {
    console.error("Errore nel recupero dei dati del prodotto:", error)
    throw error
  }
}

export const saveProductToHistory = async (userId: string, product: Product): Promise<void> => {
  try {
    const { error } = await supabase.from("scanned_products").insert({
      user_id: userId,
      barcode: product.code,
      product_name: product.product_name,
      product_image: product.image_url,
      brand: product.brands,
      ingredients: product.ingredients_text,
      nutrition_grade: product.nutrition_grades,
      health_score: product.geminiAnalysis?.healthScore || null,
      sustainability_score: product.geminiAnalysis?.sustainabilityScore || null,
    })

    if (error) {
      console.error("Errore nel salvataggio del prodotto:", error)
      throw new Error("Si è verificato un errore durante il salvataggio del prodotto.")
    }
  } catch (error) {
    console.error("Errore nel salvataggio del prodotto:", error)
    throw error
  }
}

export const getScannedProducts = async (userId: string): Promise<ScannedProduct[]> => {
  try {
    const { data, error } = await supabase
      .from("scanned_products")
      .select("*")
      .eq("user_id", userId)
      .order("scanned_at", { ascending: false })

    if (error) {
      console.error("Errore nel recupero dei prodotti:", error)
      throw new Error("Si è verificato un errore durante il recupero dei prodotti.")
    }

    return data || []
  } catch (error) {
    console.error("Errore nel recupero dei prodotti:", error)
    throw error
  }
}

export const deleteScannedProduct = async (productId: string): Promise<void> => {
  try {
    const { error } = await supabase.from("scanned_products").delete().eq("id", productId)

    if (error) {
      console.error("Errore nell'eliminazione del prodotto:", error)
      throw new Error("Si è verificato un errore durante l'eliminazione del prodotto.")
    }
  } catch (error) {
    console.error("Errore nell'eliminazione del prodotto:", error)
    throw error
  }
}

