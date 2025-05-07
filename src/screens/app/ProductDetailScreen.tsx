"use client"

import type React from "react"
import { useState, useEffect } from "react"
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
} from "react-native"
import { useTheme } from "../../contexts/ThemeContext"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { AppStackParamList } from "../../navigation"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../../contexts/AuthContext"
import { fetchProductByBarcode, saveProductToHistory } from "../../services/api"
import EmptyState from "../../components/EmptyState"
import { formatNutritionValue, getNutritionGradeLabel, getEcoScoreLabel } from "../../utils/formatters"
import HealthScoreIndicator from "../../components/HealthScoreIndicator"
import SustainabilityScoreIndicator from "../../components/SustainabilityScoreIndicator"

type Props = NativeStackScreenProps<AppStackParamList, "ProductDetail">

const ProductDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { barcode } = route.params
  const [product, setProduct] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<"health" | "sustainability">("health")
  const { colors } = useTheme()
  const { user } = useAuth()

  useEffect(() => {
    fetchProductData()
  }, [barcode])

  const fetchProductData = async () => {
    setLoading(true)
    setError(null)
    try {
      const productData = await fetchProductByBarcode(barcode)
      setProduct(productData)
    } catch (err) {
      console.error("Errore nel recupero dei dati del prodotto:", err)
      setError(
        err instanceof Error ? err.message : "Si è verificato un errore durante il recupero dei dati del prodotto.",
      )
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProduct = async () => {
    if (!product || !user) return

    setSaving(true)
    try {
      await saveProductToHistory(user.id, product)
      Alert.alert("Successo", "Prodotto salvato nella cronologia.")
    } catch (error) {
      Alert.alert(
        "Errore",
        error instanceof Error ? error.message : "Si è verificato un errore durante il salvataggio del prodotto.",
      )
    } finally {
      setSaving(false)
    }
  }

  const handleShareProduct = async () => {
    if (!product) return

    try {
      let message = `Ho trovato questo prodotto con FoodScanner: ${product.product_name} di ${product.brands}.`

      if (product.nutrition_grades) {
        message += ` Nutri-Score: ${product.nutrition_grades.toUpperCase()}.`
      }

      if (product.geminiAnalysis?.healthScore) {
        message += ` Punteggio Salute: ${product.geminiAnalysis.healthScore}/100.`
      }

      if (product.geminiAnalysis?.sustainabilityScore) {
        message += ` Punteggio Sostenibilità: ${product.geminiAnalysis.sustainabilityScore}/100.`
      }

      await Share.share({ message })
    } catch (error) {
      console.error("Errore nella condivisione:", error)
    }
  }

  const getNutritionGradeColor = (grade: string) => {
    switch (grade?.toLowerCase()) {
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

  const getEcoScoreColor = (grade: string) => {
    switch (grade?.toLowerCase()) {
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

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    imageContainer: {
      alignItems: "center",
      marginBottom: 24,
    },
    productImage: {
      width: 200,
      height: 200,
      resizeMode: "contain",
      borderRadius: 8,
    },
    noImageContainer: {
      width: 200,
      height: 200,
      backgroundColor: colors.card,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    noImageText: {
      color: colors.text,
      fontSize: 14,
    },
    productName: {
      fontSize: 24,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 8,
    },
    brandText: {
      fontSize: 16,
      color: colors.text,
      marginBottom: 8,
    },
    barcodeText: {
      fontSize: 14,
      color: colors.text + "80",
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 10,
      marginTop: 20,
    },
    nutritionGradeContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 20,
    },
    nutritionGradeLabel: {
      fontSize: 16,
      color: colors.text,
      marginRight: 10,
    },
    nutritionGrade: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    nutritionGradeText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "bold",
    },
    nutritionGradeDescription: {
      marginLeft: 10,
      fontSize: 14,
      color: colors.text + "80",
    },
    ecoScoreContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 20,
    },
    ecoScoreLabel: {
      fontSize: 16,
      color: colors.text,
      marginRight: 10,
    },
    ecoScoreGrade: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    ecoScoreText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "bold",
    },
    ecoScoreDescription: {
      marginLeft: 10,
      fontSize: 14,
      color: colors.text + "80",
    },
    ingredientsText: {
      fontSize: 14,
      color: colors.text,
      lineHeight: 20,
    },
    nutrientsContainer: {
      marginTop: 10,
    },
    nutrientRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    nutrientName: {
      fontSize: 14,
      color: colors.text,
    },
    nutrientValue: {
      fontSize: 14,
      color: colors.text,
      fontWeight: "bold",
    },
    actionsContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 30,
      marginBottom: 20,
    },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 15,
      alignItems: "center",
      flex: 1,
      marginRight: 10,
      flexDirection: "row",
      justifyContent: "center",
    },
    saveButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "bold",
      marginLeft: 8,
    },
    shareButton: {
      backgroundColor: colors.card,
      borderRadius: 8,
      padding: 15,
      alignItems: "center",
      width: 50,
      justifyContent: "center",
    },
    scoreContainer: {
      alignItems: "center",
      marginVertical: 20,
      padding: 15,
      backgroundColor: colors.card,
      borderRadius: 12,
    },
    scoresRow: {
      flexDirection: "row",
      justifyContent: "space-around",
      width: "100%",
      marginBottom: 15,
    },
    tabsContainer: {
      flexDirection: "row",
      marginBottom: 15,
      borderRadius: 8,
      overflow: "hidden",
      backgroundColor: colors.border + "40",
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: "center",
    },
    activeTab: {
      backgroundColor: colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: "500",
    },
    activeTabText: {
      color: "#FFFFFF",
    },
    analysisContainer: {
      marginTop: 10,
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 15,
    },
    analysisText: {
      fontSize: 14,
      color: colors.text,
      lineHeight: 20,
      marginBottom: 15,
    },
    listTitle: {
      fontSize: 16,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 8,
    },
    listItem: {
      flexDirection: "row",
      marginBottom: 6,
    },
    listItemBullet: {
      width: 20,
      alignItems: "center",
    },
    listItemText: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      lineHeight: 20,
    },
    infoRow: {
      flexDirection: "row",
      marginBottom: 8,
    },
    infoLabel: {
      fontSize: 14,
      color: colors.text + "80",
      width: 120,
    },
    infoValue: {
      fontSize: 14,
      color: colors.text,
      flex: 1,
    },
  })

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Errore"
        message={error}
        actionLabel="Riprova"
        onAction={fetchProductData}
      />
    )
  }

  if (!product) {
    return (
      <EmptyState
        icon="search-outline"
        title="Prodotto non trovato"
        message="Nessun dato disponibile per questo prodotto."
        actionLabel="Torna alla Home"
        onAction={() => navigation.navigate("MainTabs", { screen: "Home" })}
      />
    )
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.imageContainer}>
          {product.image_url ? (
            <Image source={{ uri: product.image_url }} style={styles.productImage} />
          ) : (
            <View style={styles.noImageContainer}>
              <Ionicons name="image-outline" size={50} color={colors.text} />
              <Text style={styles.noImageText}>Immagine non disponibile</Text>
            </View>
          )}
        </View>

        <Text style={styles.productName}>{product.product_name}</Text>
        <Text style={styles.brandText}>{product.brands}</Text>
        <Text style={styles.barcodeText}>Codice a barre: {product.code}</Text>

        {/* Punteggi di salute e sostenibilità */}
        {product.geminiAnalysis && (
          <View style={styles.scoreContainer}>
            <View style={styles.scoresRow}>
              <HealthScoreIndicator score={product.geminiAnalysis.healthScore} size="medium" />
              <SustainabilityScoreIndicator score={product.geminiAnalysis.sustainabilityScore} size="medium" />
            </View>

            <View style={styles.tabsContainer}>
              <TouchableOpacity
                style={[styles.tab, activeTab === "health" && styles.activeTab]}
                onPress={() => setActiveTab("health")}
              >
                <Text style={[styles.tabText, activeTab === "health" && styles.activeTabText]}>Salute</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === "sustainability" && styles.activeTab]}
                onPress={() => setActiveTab("sustainability")}
              >
                <Text style={[styles.tabText, activeTab === "sustainability" && styles.activeTabText]}>
                  Sostenibilità
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === "health" ? (
              <View style={styles.analysisContainer}>
                <Text style={styles.analysisText}>{product.geminiAnalysis.analysis}</Text>

                {product.geminiAnalysis.pros.length > 0 && (
                  <>
                    <Text style={styles.listTitle}>Aspetti positivi:</Text>
                    {product.geminiAnalysis.pros.map((pro: string, index: number) => (
                      <View key={`pro-${index}`} style={styles.listItem}>
                        <View style={styles.listItemBullet}>
                          <Ionicons name="checkmark-circle" size={16} color="#1E8F4E" />
                        </View>
                        <Text style={styles.listItemText}>{pro}</Text>
                      </View>
                    ))}
                  </>
                )}

                {product.geminiAnalysis.cons.length > 0 && (
                  <>
                    <Text style={[styles.listTitle, { marginTop: 10 }]}>Aspetti negativi:</Text>
                    {product.geminiAnalysis.cons.map((con: string, index: number) => (
                      <View key={`con-${index}`} style={styles.listItem}>
                        <View style={styles.listItemBullet}>
                          <Ionicons name="close-circle" size={16} color="#FF0000" />
                        </View>
                        <Text style={styles.listItemText}>{con}</Text>
                      </View>
                    ))}
                  </>
                )}

                {product.geminiAnalysis.recommendations.length > 0 && (
                  <>
                    <Text style={[styles.listTitle, { marginTop: 10 }]}>Raccomandazioni:</Text>
                    {product.geminiAnalysis.recommendations.map((rec: string, index: number) => (
                      <View key={`rec-${index}`} style={styles.listItem}>
                        <View style={styles.listItemBullet}>
                          <Ionicons name="information-circle" size={16} color="#2196F3" />
                        </View>
                        <Text style={styles.listItemText}>{rec}</Text>
                      </View>
                    ))}
                  </>
                )}
              </View>
            ) : (
              <View style={styles.analysisContainer}>
                <Text style={styles.analysisText}>{product.geminiAnalysis.sustainabilityAnalysis}</Text>

                {product.geminiAnalysis.sustainabilityPros.length > 0 && (
                  <>
                    <Text style={styles.listTitle}>Aspetti positivi:</Text>
                    {product.geminiAnalysis.sustainabilityPros.map((pro: string, index: number) => (
                      <View key={`sus-pro-${index}`} style={styles.listItem}>
                        <View style={styles.listItemBullet}>
                          <Ionicons name="checkmark-circle" size={16} color="#1E8F4E" />
                        </View>
                        <Text style={styles.listItemText}>{pro}</Text>
                      </View>
                    ))}
                  </>
                )}

                {product.geminiAnalysis.sustainabilityCons.length > 0 && (
                  <>
                    <Text style={[styles.listTitle, { marginTop: 10 }]}>Aspetti negativi:</Text>
                    {product.geminiAnalysis.sustainabilityCons.map((con: string, index: number) => (
                      <View key={`sus-con-${index}`} style={styles.listItem}>
                        <View style={styles.listItemBullet}>
                          <Ionicons name="close-circle" size={16} color="#FF0000" />
                        </View>
                        <Text style={styles.listItemText}>{con}</Text>
                      </View>
                    ))}
                  </>
                )}

                {product.geminiAnalysis.sustainabilityRecommendations.length > 0 && (
                  <>
                    <Text style={[styles.listTitle, { marginTop: 10 }]}>Raccomandazioni:</Text>
                    {product.geminiAnalysis.sustainabilityRecommendations.map((rec: string, index: number) => (
                      <View key={`sus-rec-${index}`} style={styles.listItem}>
                        <View style={styles.listItemBullet}>
                          <Ionicons name="information-circle" size={16} color="#2196F3" />
                        </View>
                        <Text style={styles.listItemText}>{rec}</Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Informazioni aggiuntive sulla sostenibilità */}
                {(product.packaging || product.origins || product.labels) && (
                  <>
                    <Text style={[styles.listTitle, { marginTop: 15 }]}>Informazioni aggiuntive:</Text>

                    {product.packaging && (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Imballaggio:</Text>
                        <Text style={styles.infoValue}>{product.packaging}</Text>
                      </View>
                    )}

                    {product.origins && (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Origine:</Text>
                        <Text style={styles.infoValue}>{product.origins}</Text>
                      </View>
                    )}

                    {product.labels && (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Certificazioni:</Text>
                        <Text style={styles.infoValue}>{product.labels}</Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {/* Nutri-Score */}
        <View style={styles.nutritionGradeContainer}>
          <Text style={styles.nutritionGradeLabel}>Nutri-Score:</Text>
          <View style={[styles.nutritionGrade, { backgroundColor: getNutritionGradeColor(product.nutrition_grades) }]}>
            <Text style={styles.nutritionGradeText}>{product.nutrition_grades.toUpperCase() || "?"}</Text>
          </View>
          <Text style={styles.nutritionGradeDescription}>{getNutritionGradeLabel(product.nutrition_grades)}</Text>
        </View>

        {/* Eco-Score se disponibile */}
        {product.ecoscore_grade && (
          <View style={styles.ecoScoreContainer}>
            <Text style={styles.ecoScoreLabel}>Eco-Score:</Text>
            <View style={[styles.ecoScoreGrade, { backgroundColor: getEcoScoreColor(product.ecoscore_grade) }]}>
              <Text style={styles.ecoScoreText}>{product.ecoscore_grade.toUpperCase()}</Text>
            </View>
            <Text style={styles.ecoScoreDescription}>{getEcoScoreLabel(product.ecoscore_grade)}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Valori nutrizionali (per 100g)</Text>
        <View style={styles.nutrientsContainer}>
          <View style={styles.nutrientRow}>
            <Text style={styles.nutrientName}>Energia</Text>
            <Text style={styles.nutrientValue}>{formatNutritionValue(product.nutriments.energy_100g, "kcal")}</Text>
          </View>
          <View style={styles.nutrientRow}>
            <Text style={styles.nutrientName}>Grassi</Text>
            <Text style={styles.nutrientValue}>{formatNutritionValue(product.nutriments.fat_100g, "g")}</Text>
          </View>
          {product.nutriments.saturated_fat_100g !== undefined && (
            <View style={styles.nutrientRow}>
              <Text style={styles.nutrientName}>Grassi saturi</Text>
              <Text style={styles.nutrientValue}>
                {formatNutritionValue(product.nutriments.saturated_fat_100g, "g")}
              </Text>
            </View>
          )}
          <View style={styles.nutrientRow}>
            <Text style={styles.nutrientName}>Carboidrati</Text>
            <Text style={styles.nutrientValue}>{formatNutritionValue(product.nutriments.carbohydrates_100g, "g")}</Text>
          </View>
          {product.nutriments.sugars_100g !== undefined && (
            <View style={styles.nutrientRow}>
              <Text style={styles.nutrientName}>Zuccheri</Text>
              <Text style={styles.nutrientValue}>{formatNutritionValue(product.nutriments.sugars_100g, "g")}</Text>
            </View>
          )}
          <View style={styles.nutrientRow}>
            <Text style={styles.nutrientName}>Proteine</Text>
            <Text style={styles.nutrientValue}>{formatNutritionValue(product.nutriments.proteins_100g, "g")}</Text>
          </View>
          <View style={styles.nutrientRow}>
            <Text style={styles.nutrientName}>Sale</Text>
            <Text style={styles.nutrientValue}>{formatNutritionValue(product.nutriments.salt_100g, "g")}</Text>
          </View>
          {product.nutriments.fiber_100g !== undefined && (
            <View style={styles.nutrientRow}>
              <Text style={styles.nutrientName}>Fibre</Text>
              <Text style={styles.nutrientValue}>{formatNutritionValue(product.nutriments.fiber_100g, "g")}</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Ingredienti</Text>
        <Text style={styles.ingredientsText}>{product.ingredients_text}</Text>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveProduct} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="bookmark-outline" size={24} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Salva nella cronologia</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareButton} onPress={handleShareProduct}>
            <Ionicons name="share-social-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}

export default ProductDetailScreen
