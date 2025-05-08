"use client"

import React from "react"
import { useState, useEffect, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Share,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native"
import { useTheme } from "../../contexts/ThemeContext"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { AppStackParamList } from "../../navigation"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../../contexts/AuthContext"
import {
  getProductRecordById,
  isProductInFavorites,
  addProductToFavorites,
  removeProductFromFavorites,
  fetchOrGenerateAiAnalysisAndUpdateProduct,
  type ProductRecord,
  type RawProductData,
} from "../../services/api"
import EmptyState from "../../components/EmptyState"
import { formatNutritionValue, getNutritionGradeLabel, getEcoScoreLabel } from "../../utils/formatters"
import HealthScoreIndicator from "../../components/HealthScoreIndicator"
import SustainabilityScoreIndicator from "../../components/SustainabilityScoreIndicator"
import type { GeminiAnalysisResult } from "../../services/gemini"

// Abilita LayoutAnimation su Android (se si decide di usarla)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Funzione helper per parsare campi array JSON, spostata fuori da loadProductData
const parseJsonArrayField = (fieldData: any): Array<{title: string, detail: string}> => {
  if (Array.isArray(fieldData)) {
    if (fieldData.length > 0 && typeof fieldData[0] === 'string') {
      try {
        // Tenta di parsare ogni elemento se l'array contiene stringhe JSON
        return fieldData.map(item => JSON.parse(item));
      } catch (e) {
        console.warn("[PARSE HELPER WARN] Errore parsing stringhe JSON nell'array, restituendo dati grezzi o fallback.", e, fieldData);
        // Se il parsing fallisce, potrebbe essere un array misto o non JSON valido.
        // Restituisci un formato di fallback o considera di loggare/gestire l'errore più specificamente.
        return fieldData.map(item => (typeof item === 'string' ? { title: "Errore formato", detail: item } : item)) as Array<{title: string, detail: string}>;
      }
    }
    // Se è già un array di oggetti (o un array vuoto), restituiscilo così com'è
    return fieldData as Array<{title: string, detail: string}>;
  } else if (typeof fieldData === 'string') {
    // Se è una singola stringa JSON che rappresenta un array
    try {
      const parsed = JSON.parse(fieldData);
      return Array.isArray(parsed) ? parsed : [{ title: "Errore formato dati", detail: "Il JSON non è un array" }];
    } catch (e) {
      console.warn("[PARSE HELPER WARN] Errore parsing stringa JSON del campo, fallback.", e, fieldData);
      return [{ title: "Errore formato dati", detail: "Impossibile leggere i dettagli" }];
    }
  }
  console.log("[PARSE HELPER INFO] fieldData non è né array né stringa, restituendo array vuoto:", fieldData);
  return []; // Fallback per tipi non gestiti (es. null, undefined)
};

type ProductDetailScreenRouteParams = {
  productRecordId: string;
  initialProductData?: RawProductData | null; 
  aiAnalysisResult?: GeminiAnalysisResult | null;
};

type Props = NativeStackScreenProps<AppStackParamList, "ProductDetail">;

const ProductDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { productRecordId, initialProductData: routeInitialProductData, aiAnalysisResult: routeAiAnalysisResult } = route.params as ProductDetailScreenRouteParams;
  
  const [displayProductInfo, setDisplayProductInfo] = useState<RawProductData | ProductRecord | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<GeminiAnalysisResult | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [loadingInitialData, setLoadingInitialData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [savingFavorite, setSavingFavorite] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const { colors } = useTheme()
  const { user } = useAuth()

  // Nuovo stato per elementi espandibili
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleItemExpansion = (key: string) => {
      // Attiva animazione (opzionale)
      // LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpandedItems(prev => ({
          ...prev,
          [key]: !prev[key]
      }));
  };

  // Funzione helper per accedere ai valori nutrizionali in modo sicuro
  const getNutrimentValue = (field: keyof ProductRecord | keyof NonNullable<RawProductData['nutriments']>) => {
    if (!displayProductInfo) return undefined;
    if ('nutriments' in displayProductInfo && displayProductInfo.nutriments) {
      return displayProductInfo.nutriments[field as keyof NonNullable<RawProductData['nutriments']>];
    }
    // Prova ad accedere direttamente se displayProductInfo è un ProductRecord o una struttura piatta
    return (displayProductInfo as any)[field]; 
  };

  const loadProductData = useCallback(async (mountedRef: { current: boolean }) => {
    if (!user || !productRecordId) {
      if (mountedRef.current) {
        setError("Informazioni utente o ID prodotto mancanti.");
        setLoadingInitialData(false);
      }
      return;
    }

    if (mountedRef.current) {
      setLoadingInitialData(true);
      setError(null);
    }

    try {
      if (routeInitialProductData && mountedRef.current) {
        console.log("[DETAIL] Dati iniziali (Raw) ricevuti dalla route.");
        setDisplayProductInfo(routeInitialProductData);
        if (routeAiAnalysisResult) {
          console.log("[DETAIL] Analisi AI ricevuta dalla route. Applico parsing ai campi pro/con.");
          setAiAnalysis({
            ...routeAiAnalysisResult,
            pros: parseJsonArrayField(routeAiAnalysisResult.pros),
            cons: parseJsonArrayField(routeAiAnalysisResult.cons),
            sustainabilityPros: parseJsonArrayField(routeAiAnalysisResult.sustainabilityPros),
            sustainabilityCons: parseJsonArrayField(routeAiAnalysisResult.sustainabilityCons),
            // recommendations e altri campi string/number non necessitano di questo parsing specifico
          });
        }
        setLoadingInitialData(false);
      } else {
        console.log(`[DETAIL] Caricamento ProductRecord completo per ID: ${productRecordId}`);
        const fetchedProduct = await getProductRecordById(productRecordId);
        if (mountedRef.current) {
          if (fetchedProduct) {
            setDisplayProductInfo(fetchedProduct);
            if (fetchedProduct.health_score !== undefined && fetchedProduct.health_score !== null) {
              console.log("[DETAIL] Analisi AI trovata nel ProductRecord caricato. Applico parsing ai campi pro/con.");

              setAiAnalysis({
                healthScore: fetchedProduct.health_score ?? 0, 
                sustainabilityScore: fetchedProduct.sustainability_score ?? 0,
                analysis: fetchedProduct.health_analysis ?? '',
                pros: parseJsonArrayField(fetchedProduct.health_pros),
                cons: parseJsonArrayField(fetchedProduct.health_cons),
                recommendations: fetchedProduct.health_recommendations ?? [],
                sustainabilityAnalysis: fetchedProduct.sustainability_analysis ?? '',
                sustainabilityPros: parseJsonArrayField(fetchedProduct.sustainability_pros),
                sustainabilityCons: parseJsonArrayField(fetchedProduct.sustainability_cons),
                sustainabilityRecommendations: fetchedProduct.sustainability_recommendations ?? [],
              });
            }
          } else {
            setError("Prodotto non trovato nel database.");
          }
          setLoadingInitialData(false);
        }
      }

      if (user && productRecordId && mountedRef.current) {
        const favoriteStatus = await isProductInFavorites(user.id, productRecordId);
        if (mountedRef.current) {
          setIsFavorite(favoriteStatus);
        }
      }

    } catch (err) {
      console.error("[DETAIL ERROR] Errore nel caricamento dei dati del prodotto:", err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Errore caricamento dati.");
        setLoadingInitialData(false);
      }
    }
  }, [user, productRecordId, routeInitialProductData, routeAiAnalysisResult]);

  useEffect(() => {
    const mountedRef = { current: true };
    loadProductData(mountedRef);
    return () => { mountedRef.current = false; };
  }, [loadProductData]);

  useEffect(() => {
    const mountedRef = { current: true };

    const attemptAiAnalysis = async () => {
      // Prevenzione esecuzioni multiple se una è già in corso (basato sullo stato isAiLoading)
      if (isAiLoading) {
        console.log("[DETAIL AI] Tentativo di avvio analisi AI mentre una è già in corso (isAiLoading=true). Skip.");
        return;
      }

      // Condizioni per avviare una nuova analisi AI:
      // - Utente e productRecordId validi.
      // - displayProductInfo (dati base del prodotto) caricato.
      // - aiAnalysis (risultato AI precedente) non ancora presente.
      if (user && productRecordId && displayProductInfo && !aiAnalysis) {
        
        if (mountedRef.current) {
          console.log("[DETAIL AI] Impostazione isAiLoading = true");
          setIsAiLoading(true);
          // setError(null); // Resetta eventuali errori precedenti relativi all'AI
        }

        // Determina la sorgente dati più appropriata e completa per Gemini
        let dataForGeminiAnalysis: RawProductData;

        if (routeInitialProductData && routeInitialProductData.code) {
          console.log("[DETAIL AI] Utilizzo routeInitialProductData per l'analisi Gemini.");
          dataForGeminiAnalysis = routeInitialProductData;
        } else if (displayProductInfo && 'nutriments' in displayProductInfo && (displayProductInfo as any).code) {
          console.log("[DETAIL AI] Utilizzo displayProductInfo (come RawProductData) per l'analisi Gemini.");
          dataForGeminiAnalysis = displayProductInfo as RawProductData;
        } else if (displayProductInfo && (displayProductInfo as ProductRecord).barcode) {
          console.log("[DETAIL AI] Costruzione RawProductData da displayProductInfo (ProductRecord) per l'analisi Gemini.");
          const record = displayProductInfo as ProductRecord;
          dataForGeminiAnalysis = {
            code: record.barcode,
            product_name: record.product_name,
            image_url: record.product_image,
            brands: record.brand,
            ingredients_text: record.ingredients,
            nutrition_grades: record.nutrition_grade,
            nutriments: {
              energy_kcal_100g: record.energy_100g, 
              energy_100g: record.energy_100g, // Manteniamo entrambi se uno dei due è usato altrove
              fat_100g: record.fat_100g,
              saturated_fat_100g: record.saturated_fat_100g,
              carbohydrates_100g: record.carbohydrates_100g,
              sugars_100g: record.sugars_100g,
              fiber_100g: record.fiber_100g,
              proteins_100g: record.proteins_100g,
              salt_100g: record.salt_100g,
              // Aggiungere qui gli altri campi da RawProductData.nutriments se presenti in ProductRecord
              // e necessari per Gemini (es. trans_fat_100g, cholesterol_100g, sodium_100g)
              // Assicuriamoci che tutti i campi inviati a Gemini siano qui, se disponibili in ProductRecord
              // Questa mappatura è cruciale per l'accuratezza dell'AI
            },
            // È FONDAMENTALE mappare qui ALTRI campi di RawProductData che Gemini usa,
            // se sono stati salvati in ProductRecord. Esempio:
            // nova_group: record.nova_group, (se nova_group è in ProductRecord)
            // ecoscore_grade: record.ecoscore_grade, (se ecoscore_grade è in ProductRecord)
            // packaging: record.packaging_text (se si aggiunge un campo packaging_text a ProductRecord)
            // Aggiungere tutti i campi che il prompt di Gemini si aspetta e che potrebbero essere in ProductRecord
            nova_group: (record as any).nova_group,
            ecoscore_grade: record.ecoscore_grade,
            ecoscore_score: record.ecoscore_score,
            packaging: (record as any).packaging,
            additives_tags: (record as any).additives_tags,
            labels: (record as any).labels,
            categories: (record as any).categories,
          };
        } else {
          console.warn("[DETAIL AI] Dati sorgente insufficienti o codice prodotto mancante per avviare l'analisi AI. Skip.");
          if (mountedRef.current) setIsAiLoading(false);
          return;
        }
        
        console.log(`[DETAIL AI] Avvio chiamata a fetchOrGenerateAiAnalysisAndUpdateProduct per productRecordId: ${productRecordId}`);
        try {
          const newAiAnalysisResult = await fetchOrGenerateAiAnalysisAndUpdateProduct(
            productRecordId,
            user.id,
            dataForGeminiAnalysis 
          );

          console.log("[DETAIL AI] Risultato da fetchOrGenerateAiAnalysisAndUpdateProduct:", newAiAnalysisResult ? "Dati AI ricevuti" : "Nessun dato AI (null)");

          if (mountedRef.current) {
            if (newAiAnalysisResult) {
              console.log("[DETAIL AI] Impostazione stato aiAnalysis con i nuovi dati.");
              setAiAnalysis(newAiAnalysisResult);
            } else {
              console.warn("[DETAIL AI] newAiAnalysisResult è null. Lo stato aiAnalysis non sarà aggiornato con nuovi dati (o rimarrà null).");
              // setAiAnalysis(null); // Opzionale: per assicurare che sia null se l'operazione fallisce
              // setError("Analisi AI non disponibile."); // Esempio se hai uno stato di errore specifico per l'AI
            }
          }
        } catch (error) {
          console.error("[DETAIL AI ERROR] Errore catturato durante fetchOrGenerateAiAnalysisAndUpdateProduct:", error);
          if (mountedRef.current) {
            // setAiAnalysis(null);
            // setError(error instanceof Error ? error.message : "Errore imprevisto nell'analisi AI.");
          }
        } finally {
          if (mountedRef.current) {
            console.log("[DETAIL AI] Blocco finally: Impostazione isAiLoading = false");
            setIsAiLoading(false);
          }
        }
      } else {
        // Log per capire perché non si entra nel blocco if principale per avviare l'analisi
        if (loadingInitialData) console.log("[DETAIL AI] Skip attemptAiAnalysis: loadingInitialData è true.");
        else if (!user) console.log("[DETAIL AI] Skip attemptAiAnalysis: user non disponibile.");
        else if (!productRecordId) console.log("[DETAIL AI] Skip attemptAiAnalysis: productRecordId non disponibile.");
        else if (!displayProductInfo) console.log("[DETAIL AI] Skip attemptAiAnalysis: displayProductInfo non disponibile.");
        else if (aiAnalysis) console.log("[DETAIL AI] Skip attemptAiAnalysis: aiAnalysis già presente.");
        // Aggiungi un log se isAiLoading era true e ha causato lo skip all'inizio della funzione
        else if (isAiLoading) console.log("[DETAIL AI] Skip attemptAiAnalysis: isAiLoading era true all'inizio della funzione (non dovrebbe succedere con il check iniziale)."); 
      }
    };

    // L'effetto si attiva solo se i dati di base sono stati caricati.
    if (!loadingInitialData) {
      console.log("[DETAIL AI] Dati iniziali caricati. Chiamata a attemptAiAnalysis.");
      attemptAiAnalysis();
    } else {
      console.log("[DETAIL AI] Dati iniziali ANCORA in caricamento. attemptAiAnalysis non chiamata.");
    }

    return () => {
      mountedRef.current = false;
      console.log("[DETAIL AI] Componente ProductDetailScreen smontato o effetto pulito.");
    };
  }, [
    user, 
    productRecordId, 
    displayProductInfo, 
    aiAnalysis, 
    loadingInitialData,
    routeInitialProductData,
    // isAiLoading è stato rimosso dalle dipendenze.
  ]);

  const handleToggleFavorite = async () => {
    if (!displayProductInfo || !user || !productRecordId) return;

    setSavingFavorite(true)
    try {
      let success = false
      if (isFavorite) {
        success = await removeProductFromFavorites(user.id, productRecordId)
        if (success) {
          setIsFavorite(false)
          Alert.alert("Info", "Prodotto rimosso dai preferiti.")
        } else {
          Alert.alert("Errore", "Impossibile rimuovere il prodotto dai preferiti.")
        }
      } else {
        success = await addProductToFavorites(user.id, productRecordId)
        if (success) {
          setIsFavorite(true)
          Alert.alert("Successo", "Prodotto salvato nei preferiti.")
        } else {
          Alert.alert("Errore", "Impossibile salvare il prodotto nei preferiti.")
        }
      }
    } catch (error) {
      Alert.alert(
        "Errore",
        error instanceof Error ? error.message : "Si è verificato un errore durante l'operazione.",
      )
    } finally {
      setSavingFavorite(false)
    }
  }

  const handleShareProduct = async () => {
    if (!displayProductInfo) return;

    try {
      const productName = 'product_name' in displayProductInfo ? displayProductInfo.product_name : (displayProductInfo as ProductRecord).product_name;
      const brandName = 'brands' in displayProductInfo ? displayProductInfo.brands : (displayProductInfo as ProductRecord).brand;
      const nutritionGrade = 'nutrition_grades' in displayProductInfo ? displayProductInfo.nutrition_grades : (displayProductInfo as ProductRecord).nutrition_grade;

      let message = `Ho trovato questo prodotto con FoodScanner: ${productName || "Sconosciuto"} di ${brandName || "Marca Sconosciuta"}.`

      if (nutritionGrade) {
        message += ` Nutri-Score: ${nutritionGrade.toUpperCase()}.`
      }
      if (aiAnalysis?.healthScore !== undefined) {
        message += ` Punteggio Salute: ${aiAnalysis.healthScore}/100.`
      }

      await Share.share({ message })
    } catch (error) {
      Alert.alert("Errore", "Impossibile condividere il prodotto.")
    }
  }

  const getNutritionGradeColor = (grade: string | undefined) => {
    if (!grade) return colors.text
    switch (grade.toLowerCase()) {
      case "a":
        return "#1E8F4E"
      case "b":
        return "#7AC547"
      case "c":
        return "#FFC734"
      case "d":
        return "#FF9900"
      case "e":
        return "#FF0000"
      default:
        return colors.text
    }
  }

  const getEcoScoreColor = (grade: string | undefined) => {
    if (!grade) return colors.text
    switch (grade.toLowerCase()) {
      case "a":
        return "#1E8F4E"
      case "b":
        return "#7AC547"
      case "c":
        return "#FFC734"
      case "d":
        return "#FF9900"
      case "e":
        return "#FF0000"
      default:
        return colors.text
    }
  }

  const hasNutritionData = () => {
    if (!displayProductInfo) return false;
    // Controlla usando getNutrimentValue per astrazione
    return (
        getNutrimentValue('energy_kcal_100g') !== undefined ||
        getNutrimentValue('energy_100g') !== undefined || // Aggiunto per coerenza con RawProductData
        getNutrimentValue('fat_100g') !== undefined ||
        getNutrimentValue('saturated_fat_100g') !== undefined ||
        getNutrimentValue('carbohydrates_100g') !== undefined ||
        getNutrimentValue('sugars_100g') !== undefined ||
        getNutrimentValue('fiber_100g') !== undefined ||
        getNutrimentValue('proteins_100g') !== undefined ||
        getNutrimentValue('salt_100g') !== undefined
        // Aggiungere altri campi nutrizionali se rilevanti per la visualizzazione o il check
    );
  }

  const renderNutritionTable = () => {
    if (!hasNutritionData()) {
      return (
        <View style={styles.nutritionSection}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Tabella Nutrizionale</Text>
          <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 10 }}>Dati nutrizionali non disponibili.</Text>
        </View>
      );
    }

    const nutritionFields: Array<{ label: string; key: keyof ProductRecord | keyof NonNullable<RawProductData['nutriments']>; unit: string }> = [
      { label: "Energia", key: "energy_kcal_100g", unit: "kcal" }, // O energy_100g per kJ
      { label: "Grassi", key: "fat_100g", unit: "g" },
      { label: "di cui Saturi", key: "saturated_fat_100g", unit: "g" },
      { label: "Carboidrati", key: "carbohydrates_100g", unit: "g" },
      { label: "di cui Zuccheri", key: "sugars_100g", unit: "g" },
      { label: "Fibre", key: "fiber_100g", unit: "g" },
      { label: "Proteine", key: "proteins_100g", unit: "g" },
      { label: "Sale", key: "salt_100g", unit: "g" },
    ];

    return (
      <View style={styles.nutritionSection}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted, marginBottom: 10 }]}>Valori Nutrizionali (per 100g/100ml)</Text>
        {nutritionFields.map(field => {
          const value = getNutrimentValue(field.key);
          if (value === undefined || value === null) return null; // Non mostrare la riga se il valore non è disponibile
          return (
            <View key={field.key} style={styles.nutritionRow}>
              <Text style={[styles.nutritionLabel, { color: colors.text }]}>{field.label}</Text>
              <Text style={[styles.nutritionValue, { color: colors.textMuted }]}>{formatNutritionValue(value as number, field.unit)}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderAiDetailSection = (
    title: string,
    items: string[] | Array<{title: string, detail: string}> | undefined,
    categoryKey: string,
    isProConList: boolean = false
  ) => {
    if (!items || items.length === 0 || (items.length === 1 && typeof items[0] === 'string' && items[0].toLowerCase().includes("non disponibile"))) {
      return null;
    }

    return (
      <View style={styles.aiSubSection}>
        <Text style={[styles.aiSubSectionTitle, { color: colors.text }]}>{title}</Text>
        {items.map((item, index) => {
          const itemKey = `${categoryKey}-${index}`; 
          const isExpanded = !!expandedItems[itemKey];

          if (isProConList && typeof item === 'object' && item.title && item.detail) {
            return (
              <React.Fragment key={itemKey}>
                <TouchableOpacity
                  style={[styles.aiListItemButton, { borderBottomColor: isExpanded ? 'transparent' : colors.borderFaint }]}
                  onPress={() => toggleItemExpansion(itemKey)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.aiListItemTitle, { color: colors.text }]} numberOfLines={3}>{item.title}</Text>
                  <Ionicons name={isExpanded ? "chevron-down" : "chevron-forward"} size={20} color={colors.primary} />
                </TouchableOpacity>
                {isExpanded && (
                  <View style={styles.aiListItemDetailView}>
                     <Text style={[styles.aiListItemDetailText, { color: colors.textMuted }]}>{item.detail}</Text>
                  </View>
                )}
              </React.Fragment>
            );
          } else if (typeof item === 'string') {
            return (
              <Text key={itemKey} style={[styles.aiTextListItem, { color: colors.text }]}>
                • {item}
              </Text>
            );
          }
          return null;
        })}
      </View>
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    centered: {
      justifyContent: "center",
      alignItems: "center",
    },
    header: {
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 10,
      position: 'relative',
    },
    productImage: {
      width: 180,
      height: 180,
      borderRadius: 12,
      marginBottom: 15,
    },
    productImagePlaceholder: {
      width: 180,
      height: 180,
      borderRadius: 12,
      marginBottom: 15,
      justifyContent: "center",
      alignItems: "center",
    },
    titleContainer: {
      alignItems: 'center',
      marginBottom: 10,
      paddingHorizontal: 10,
    },
    productName: {
      fontSize: 24,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 2,
    },
    brandName: {
      fontSize: 16,
      textAlign: "center",
    },
    favoriteButton: {
      position: 'absolute',
      top: 15,
      right: 15,
      padding: 8,
    },
    shareButton: {
      position: 'absolute',
      top: 15,
      left: 15,
      padding: 8,
    },
    scoresContainer: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingVertical: 10,
      paddingHorizontal: 15,
      marginBottom: 10,
      alignItems: 'flex-start',
    },
    scoreItem: {
      alignItems: "center",
      flex: 1,
      paddingHorizontal: 5,
    },
    scoreLabel: {
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 6,
    },
    scoreBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      minWidth: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    scoreText: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "bold",
    },
    scoreDescription: {
      fontSize: 11,
      textAlign: 'center',
    },
    aiLoadingContainer: {
      alignItems: "center",
      paddingVertical: 30,
    },
    aiLoadingText: {
      marginTop: 12,
      fontSize: 16,
    },
    aiAnalysisContainer: {
      marginHorizontal: 12,
      marginVertical: 10,
      padding: 15,
      borderRadius: 12,
    },
    aiMainTitle: {
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 18,
      textAlign: 'center',
    },
    aiCategorySection: {
      marginBottom: 20,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1.5,
    },
    aiCategoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    aiCategoryTitle: {
      fontSize: 19,
      fontWeight: 'bold',
      marginLeft: 8,
    },
    indicatorContainer: {
      alignItems: 'center',
      marginVertical: 12,
    },
    aiSummary: {
      fontSize: 14,
      fontStyle: 'italic',
      marginBottom: 12,
      lineHeight: 20,
    },
    aiSubSection: {
      marginBottom: 12,
      marginTop: 5,
    },
    aiSubSectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 8,
    },
    aiListItemButton: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
    },
    aiListItemTitle: {
      fontSize: 15,
      flex: 1, 
      marginRight: 8, 
    },
    aiListItemDetailView: {
      paddingVertical: 10,
      paddingHorizontal: 5,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderFaint,
      backgroundColor: colors.background,
    },
    aiListItemDetailText: {
      fontSize: 14,
      lineHeight: 20,
    },
    aiTextListItem: {
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 6,
      paddingLeft: 5,
    },
    nutritionSection: {
      padding: 15,
      borderRadius: 8,
      marginBottom: 10,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 10,
    },
    nutritionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 5,
    },
    nutritionLabel: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    nutritionValue: {
      fontSize: 14,
    },
  })

  if (loadingInitialData) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 10, color: colors.text }}>Caricamento dati prodotto...</Text>
      </View>
    );
  }

  if (error) {
    return <EmptyState title="Errore" message={error} icon="alert-circle-outline" />;
  }

  if (!displayProductInfo) {
    return <EmptyState title="Prodotto non trovato" message="Impossibile caricare i dettagli del prodotto." icon="help-circle-outline" />;
  }

  const productName = 'product_name' in displayProductInfo ? displayProductInfo.product_name : (displayProductInfo as ProductRecord).product_name;
  const brandName = 'brands' in displayProductInfo ? displayProductInfo.brands : (displayProductInfo as ProductRecord).brand;
  const imageUrl = 'image_url' in displayProductInfo && displayProductInfo.image_url ? displayProductInfo.image_url :
                   'product_image' in displayProductInfo && displayProductInfo.product_image ? displayProductInfo.product_image : undefined;

  const nutritionGrade = 'nutrition_grades' in displayProductInfo ? displayProductInfo.nutrition_grades : (displayProductInfo as ProductRecord).nutrition_grade;
  
  // Semplificato l'accesso a ecoscore_grade, dato che ora dovrebbe essere sempre disponibile
  // direttamente su displayProductInfo se presente (sia come RawProductData che come ProductRecord)
  const currentEcoScoreGrade = displayProductInfo?.ecoscore_grade;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.productImage} resizeMode="contain" />
        ) : (
          <View style={[styles.productImagePlaceholder, { backgroundColor: colors.borderFaint }]}>
            <Ionicons name="camera-outline" size={80} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.titleContainer}>
          <Text style={[styles.productName, { color: colors.text }]}>{productName || "Nome non disponibile"}</Text>
          <Text style={[styles.brandName, { color: colors.textMuted }]}>{brandName || "Marca non disponibile"}</Text>
        </View>
        <TouchableOpacity onPress={handleToggleFavorite} style={styles.favoriteButton} disabled={savingFavorite}>
          <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={28} color={isFavorite ? colors.primary : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleShareProduct} style={styles.shareButton}>
          <Ionicons name="share-social-outline" size={28} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.scoresContainer}>
        {nutritionGrade && (
          <View style={styles.scoreItem}>
            <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>Nutri-Score</Text>
            <View style={[styles.scoreBadge, { backgroundColor: getNutritionGradeColor(nutritionGrade) }]}>
              <Text style={styles.scoreText}>{nutritionGrade.toUpperCase()}</Text>
            </View>
            <Text style={[styles.scoreDescription, {color: colors.textMuted}]}>{getNutritionGradeLabel(nutritionGrade)}</Text>
          </View>
        )}
        {currentEcoScoreGrade && (
          <View style={styles.scoreItem}>
            <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>Eco-Score</Text>
            <View style={[styles.scoreBadge, { backgroundColor: getEcoScoreColor(currentEcoScoreGrade) }]}>
              <Text style={styles.scoreText}>{currentEcoScoreGrade.toUpperCase()}</Text>
            </View>
            <Text style={[styles.scoreDescription, {color: colors.textMuted}]}>{getEcoScoreLabel(currentEcoScoreGrade)}</Text>
          </View>
        )}
      </View>
      
      {isAiLoading && (
        <View style={styles.aiLoadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.aiLoadingText, { color: colors.text }]}>Analisi AI in corso...</Text>
        </View>
      )}

      {/* Tabella Nutrizionale */} 
      {renderNutritionTable()} 

      {aiAnalysis && (
        <View style={[styles.aiAnalysisContainer, { backgroundColor: colors.card, shadowColor: 'rgba(0,0,0,0.1)' }]}>
          <Text style={[styles.aiMainTitle, { color: colors.text }]}>Analisi Approfondita AI</Text>
          
          <View style={[styles.aiCategorySection, {borderColor: colors.border}]}>
            <View style={styles.aiCategoryHeader}>
                <Ionicons name="heart-circle-outline" size={28} color={colors.primary} />
                <Text style={[styles.aiCategoryTitle, { color: colors.primary }]}>Salute</Text>
            </View>
            {aiAnalysis.healthScore !== undefined && (
                <View style={styles.indicatorContainer}>
                    <HealthScoreIndicator score={aiAnalysis.healthScore} />
                </View>
            )}
            {aiAnalysis.analysis && <Text style={[styles.aiSummary, { color: colors.textMuted }]}>{aiAnalysis.analysis}</Text>}
            {renderAiDetailSection("Aspetti Positivi", aiAnalysis.pros, 'pro-health', true)}
            {renderAiDetailSection("Aspetti Negativi", aiAnalysis.cons, 'con-health', true)}
            {renderAiDetailSection("Raccomandazioni", aiAnalysis.recommendations, 'rec-health')}
          </View>

          <View style={[styles.aiCategorySection, {borderColor: colors.border}]}>
             <View style={styles.aiCategoryHeader}>
                <Ionicons name="leaf-outline" size={26} color={'#2E7D32'} />
                <Text style={[styles.aiCategoryTitle, { color: '#2E7D32' }]}>Sostenibilità</Text>
            </View>
            {aiAnalysis.sustainabilityScore !== undefined && (
                <View style={styles.indicatorContainer}>
                    <SustainabilityScoreIndicator score={aiAnalysis.sustainabilityScore} />
                </View>
            )}
            {aiAnalysis.sustainabilityAnalysis && <Text style={[styles.aiSummary, { color: colors.textMuted }]}>{aiAnalysis.sustainabilityAnalysis}</Text>}
            {renderAiDetailSection("Aspetti Positivi", aiAnalysis.sustainabilityPros, 'pro-sustainability', true)}
            {renderAiDetailSection("Aspetti Negativi", aiAnalysis.sustainabilityCons, 'con-sustainability', true)}
            {renderAiDetailSection("Raccomandazioni", aiAnalysis.sustainabilityRecommendations, 'rec-sustainability')}
          </View>
        </View>
      )}

    </ScrollView>
  );
};

export default ProductDetailScreen;

