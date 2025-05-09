"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  FlatList,
} from "react-native"
import { useTheme } from "../../contexts/ThemeContext"
import { Ionicons } from "@expo/vector-icons"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { CompositeScreenProps } from "@react-navigation/native"
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs"
import type { AppStackParamList, MainTabsParamList } from "../../navigation"
import BarcodeScannerView from "../../components/BarcodeScannerView"
import PhotoCameraView from "../../components/PhotoCameraView"
import {
  saveProductAndManageHistory,
  getScanHistory,
  uploadProductImage,
  generateVisualScanBarcode,
  handleBarcodeScan,
  type ProcessedProductInfo,
  type DisplayableHistoryProduct,
  type RawProductData,
} from "../../services/api"
import { analyzeImageWithGeminiVision, type GeminiAnalysisResult } from "../../services/gemini"
import ProductCard from "../../components/ProductCard"
import { useAuth } from "../../contexts/AuthContext"
import * as FileSystem from "expo-file-system"
import AppText from "../../components/AppText"
import { typography } from "../../theme/typography"

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, "Home">,
  NativeStackScreenProps<AppStackParamList>
>

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const [scanning, setScanning] = useState(false)
  const [isTakingPhoto, setIsTakingPhoto] = useState(false)
  const [visualAnalysisLoading, setVisualAnalysisLoading] = useState(false)
  const [manualBarcode, setManualBarcode] = useState("")
  const [loading, setLoading] = useState(false)
  const [recentProducts, setRecentProducts] = useState<DisplayableHistoryProduct[]>([])
  const { colors } = useTheme()
  const { user } = useAuth()

  const failedBarcodeForVisualRef = useRef<string | null>(null)

  const reloadRecentProducts = useCallback(async () => {
    if (!user) {
      setRecentProducts([])
      return
    }
    console.log("[HOME] Ricaricamento prodotti recenti per utente:", user.id)
    try {
      const history = await getScanHistory(user.id)
      setRecentProducts(history)
      console.log(`[HOME] Prodotti recenti aggiornati: ${history.length} elementi.`)
    } catch (e) {
      console.error("[HOME ERROR] Errore ricaricando prodotti recenti:", e)
      setRecentProducts([])
    }
  }, [user])

  useEffect(() => {
    if (user) {
      reloadRecentProducts()
    }
  }, [user, reloadRecentProducts])

  const navigateToDetail = (
    productRecordId: string,
    initialProductData?: RawProductData | null,
    aiAnalysisResult?: GeminiAnalysisResult | null,
  ) => {
    navigation.navigate("ProductDetail", {
      productRecordId: productRecordId,
      initialProductData: initialProductData,
      aiAnalysisResult: aiAnalysisResult,
    })
    reloadRecentProducts()
  }

  const processBarcodeScan = async (barcode: string) => {
    if (!user) {
      Alert.alert("Login Richiesto", "Devi effettuare il login per scansionare e salvare prodotti.")
      setLoading(false)
      return
    }
    setLoading(true)
    console.log(`[HOME - PROCESS BARCODE] Avvio processo per barcode: ${barcode} con userId: ${user.id}`)

    try {
      const result: ProcessedProductInfo = await handleBarcodeScan(barcode, user.id)

      if (result.source === "error") {
        console.error(`[HOME - PROCESS BARCODE ERROR] Errore da handleBarcodeScan: ${result.errorMessage}`)
        Alert.alert(
          "Errore Processamento",
          result.errorMessage || "Si è verificato un errore sconosciuto durante il processamento.",
        )
      } else if (result.source === "not_found_off") {
        console.log(
          `[HOME - PROCESS BARCODE] Barcode ${barcode} non trovato su OpenFoodFacts (tramite handleBarcodeScan).`,
        )
        failedBarcodeForVisualRef.current = barcode
        Alert.alert(
          "Prodotto Non Trovato",
          result.errorMessage ||
            `Il codice a barre ${barcode} non è stato trovato. Vuoi provare ad analizzarlo scattando una foto?`,
          [
            {
              text: "Annulla",
              style: "cancel",
              onPress: () => {
                failedBarcodeForVisualRef.current = null
              },
            },
            {
              text: "Scatta Foto",
              onPress: () => {
                setIsTakingPhoto(true) // Attiva la modalità foto
              },
            },
          ],
        )
      } else if (result.dbProduct?.id) {
        console.log(
          `[HOME - PROCESS BARCODE] Prodotto ${barcode} (source: ${result.source}) processato con ID: ${result.dbProduct.id}. Navigazione...`,
        )
        navigateToDetail(result.dbProduct.id, result.productData, result.aiAnalysis)
      } else {
        console.error(
          `[HOME - PROCESS BARCODE UNEXPECTED] Risultato inatteso da handleBarcodeScan per ${barcode}:`,
          result,
        )
        Alert.alert("Errore Inatteso", "Impossibile ottenere i dettagli del prodotto dopo l'analisi.")
      }
    } catch (error: any) {
      console.error(`[HOME - PROCESS BARCODE CRITICAL ERROR] Errore critico processando ${barcode}:`, error)
      Alert.alert("Errore Critico", error.message || "Si è verificato un errore grave durante la ricerca del prodotto.")
    } finally {
      setLoading(false)
    }
  }

  const processVisualScan = async (imageUri: string) => {
    if (!user) {
      Alert.alert("Login Richiesto", "Devi effettuare il login per analizzare e salvare prodotti.")
      return
    }
    setVisualAnalysisLoading(true)
    console.log(`[PROCESS VISUAL] Avvio analisi per immagine locale: ${imageUri}`)

    try {
      // 1. Leggi l'immagine e convertila in base64
      const imageBase64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      })
      console.log(`[PROCESS VISUAL] Immagine locale convertita in base64 (lunghezza: ${imageBase64.length})`)

      // Determina il mimeType (semplice inferenza dall'estensione)
      let mimeType = "image/jpeg" // Default
      if (imageUri.endsWith(".png")) {
        mimeType = "image/png"
      } else if (imageUri.endsWith(".webp")) {
        mimeType = "image/webp"
      }
      console.log(`[PROCESS VISUAL] MimeType inferito: ${mimeType}`)

      // 2. Analizza l'immagine con Gemini Vision (usando base64)
      const productNameHint = failedBarcodeForVisualRef.current
        ? `prodotto con barcode ${failedBarcodeForVisualRef.current}`
        : "Prodotto da foto"
      const visualAiAnalysis = await analyzeImageWithGeminiVision(imageBase64, mimeType, productNameHint)

      if (!visualAiAnalysis) {
        Alert.alert("Errore Analisi AI Visiva", "Impossibile analizzare l'immagine del prodotto.")
        setVisualAnalysisLoading(false)
        return
      }
      console.log(`[PROCESS VISUAL] Analisi AI Visiva completata.`)

      // 3. Se l'analisi AI ha successo, carica l'immagine su Supabase
      console.log(`[PROCESS VISUAL] Analisi AI OK. Inizio upload immagine ${imageUri} su Supabase.`)
      const uploadedImageUrl = await uploadProductImage(user.id, imageUri)
      if (!uploadedImageUrl) {
        Alert.alert("Errore Upload", "Impossibile caricare l'immagine del prodotto dopo l'analisi.")
        setVisualAnalysisLoading(false)
        return
      }
      console.log(`[PROCESS VISUAL] Immagine caricata su Supabase: ${uploadedImageUrl}`)

      // 4. Prepara i dati e salva tutto
      const visualBarcode = generateVisualScanBarcode()

      const rawDataForVisual: RawProductData = {
        code: visualBarcode,
        product_name: visualAiAnalysis.productNameFromVision || "Prodotto (da foto)",
        brands: visualAiAnalysis.brandFromVision || "Sconosciuta",
        image_url: uploadedImageUrl, // Usa l'URL pubblico appena caricato
        ingredients_text: "",
        nutriments: {},
        nutrition_grades: "",
        ecoscore_grade: "",
        categories: visualAiAnalysis.productNameFromVision
          ? `Scansione Visiva, ${visualAiAnalysis.productNameFromVision}`
          : "Scansione Visiva",
        labels: "",
        origins: "",
        packaging: "",
      }

      const savedProductRecord = await saveProductAndManageHistory(
        user.id,
        visualBarcode,
        rawDataForVisual,
        visualAiAnalysis,
        uploadedImageUrl, // Passa l'URL pubblico a saveProductAndManageHistory
        true,
      )

      if (savedProductRecord && savedProductRecord.id) {
        console.log(`[PROCESS VISUAL] Prodotto da foto salvato con ID: ${savedProductRecord.id}. Navigazione...`)
        navigateToDetail(savedProductRecord.id, rawDataForVisual, visualAiAnalysis)
      } else {
        Alert.alert("Errore Salvataggio", "Impossibile salvare il prodotto analizzato visivamente.")
      }
    } catch (error: any) {
      console.error(`[PROCESS VISUAL ERROR] Errore durante l'analisi visiva:`, error)
      Alert.alert("Errore Inatteso", error.message || "Si è verificato un errore durante l'analisi visiva.")
    } finally {
      setVisualAnalysisLoading(false)
      failedBarcodeForVisualRef.current = null
    }
  }

  const handleBarCodeScanned = (barcode: string) => {
    setScanning(false)
    processBarcodeScan(barcode)
  }

  const handlePhotoTaken = (uri: string | undefined) => {
    setIsTakingPhoto(false)
    if (uri) {
      console.log("[HOME] Foto scattata, URI:", uri)
      processVisualScan(uri)
    } else {
      console.log("[HOME] Scatto foto annullato o fallito.")
      failedBarcodeForVisualRef.current = null
    }
  }

  const handleManualSearch = () => {
    if (!manualBarcode.trim()) {
      Alert.alert("Input Mancante", "Inserisci un codice a barre da cercare.")
      return
    }
    processBarcodeScan(manualBarcode.trim())
    setManualBarcode("")
  }

  const renderRecentProduct = ({ item }: { item: DisplayableHistoryProduct }) => (
    <ProductCard
      productName={item.product_name || "Nome non disponibile"}
      brand={item.brand || "Marca non disponibile"}
      imageUrl={item.product_image}
      nutritionGrade={item.nutrition_grade}
      healthScore={item.health_score}
      sustainabilityScore={item.sustainability_score}
      onPress={() => {
        if (item.id) {
          navigation.navigate("ProductDetail", { productRecordId: item.id })
        } else {
          Alert.alert("Errore", "ID prodotto non valido per visualizzare i dettagli.")
        }
      }}
    />
  )

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContentContainer: {
      flexGrow: 1,
    },
    header: {
      paddingHorizontal: 24,
      paddingTop: Platform.OS === "ios" ? 60 : 40,
      paddingBottom: 16,
    },
    greeting: {
      fontSize: 28,
      fontWeight: "bold",
      letterSpacing: -0.5,
    },
    subGreeting: {
      opacity: 0.8,
    },
    scanActionsContainer: {
      marginTop: 24,
      paddingHorizontal: 24,
    },
    actionButtonsContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    actionButton: {
      width: "48%",
      height: 120,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
      padding: 16,
    },
    actionButtonIcon: {
      marginBottom: 12,
    },
    actionButtonText: {
      fontSize: 16,
      fontWeight: "600",
      textAlign: "center",
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
      marginBottom: 32,
    },
    searchInput: {
      flex: 1,
      height: 56,
      borderRadius: 12,
      paddingHorizontal: 16,
      fontSize: 16,
      marginRight: 12,
    },
    searchButton: {
      width: 56,
      height: 56,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    recentProductsSection: {
      paddingLeft: 24,
      paddingTop: 8,
      paddingBottom: 24,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    sectionTitle: {
      letterSpacing: -0.3,
    },
    sectionIcon: {
      marginRight: 8,
    },
    recentProductsList: {
      paddingRight: 24,
    },
    emptyStateText: {
      textAlign: "center",
      paddingVertical: 24,
      paddingHorizontal: 24,
      opacity: 0.7,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.3)",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
    },
    loadingText: {
      marginTop: 12,
    },
    bottomSpacer: {
      height: 80,
    },
  })

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AppText variant="h1" style={[styles.greeting, { color: colors.text, fontFamily: typography.h1.fontFamily }]}>
            Ciao, {user?.email ? user.email.split("@")[0] : "Ospite"}
          </AppText>
          <AppText variant="body" style={[styles.subGreeting, { color: colors.text, fontFamily: typography.body.fontFamily }]}>Scopri cosa c'è nel tuo cibo oggi</AppText>
        </View>

        <View style={styles.scanActionsContainer}>
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primary + "15" }]}
              onPress={() => setScanning(true)}
              disabled={loading || visualAnalysisLoading}
              activeOpacity={0.7}
            >
              <View style={styles.actionButtonIcon}>
                <Ionicons name="barcode-outline" size={36} color={colors.primary} />
              </View>
              <AppText variant="button" style={[styles.actionButtonText, { color: colors.text, fontFamily: typography.button.fontFamily }]}>Scansiona Barcode</AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.secondary + "15" }]}
              onPress={() => setIsTakingPhoto(true)}
              disabled={loading || visualAnalysisLoading}
              activeOpacity={0.7}
            >
              <View style={styles.actionButtonIcon}>
                <Ionicons name="camera-outline" size={36} color={colors.secondary} />
              </View>
              <AppText variant="button" style={[styles.actionButtonText, { color: colors.text, fontFamily: typography.button.fontFamily }]}>Analizza Foto</AppText>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <TextInput
              style={[
                styles.searchInput,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder="Inserisci barcode manualmente"
              placeholderTextColor={colors.textMuted}
              value={manualBarcode}
              onChangeText={setManualBarcode}
              keyboardType="default"
              onSubmitEditing={handleManualSearch}
              returnKeyType="search"
              editable={!loading && !visualAnalysisLoading}
            />
            <TouchableOpacity
              onPress={handleManualSearch}
              style={[styles.searchButton, { backgroundColor: colors.primary }]}
              disabled={loading || visualAnalysisLoading}
              activeOpacity={0.8}
            >
              <Ionicons name="search" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.recentProductsSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time-outline" size={24} color={colors.primary} style={styles.sectionIcon} />
            <AppText variant="h3" style={[styles.sectionTitle, { color: colors.text, fontFamily: typography.h3.fontFamily }]}>Scansionati di Recente</AppText>
          </View>

          {recentProducts.length > 0 ? (
            <FlatList
              data={recentProducts}
              renderItem={renderRecentProduct}
              keyExtractor={(item) => item.history_id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentProductsList}
            />
          ) : !user ? (
            <AppText style={[styles.emptyStateText, { color: colors.textMuted, fontFamily: typography.body.fontFamily }]}>
              Effettua il login per vedere la tua cronologia.
            </AppText>
          ) : (
            <AppText style={[styles.emptyStateText, { color: colors.textMuted, fontFamily: typography.body.fontFamily }]}>
              Nessun prodotto scansionato di recente. Inizia ora!
            </AppText>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {(loading || visualAnalysisLoading) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <AppText style={[styles.loadingText, { color: "#FFFFFF", fontFamily: typography.bodyMedium.fontFamily }]}>{loading ? "Ricerca prodotto..." : "Analisi immagine..."}</AppText>
        </View>
      )}

      {scanning && (
        <Modal
          animationType="slide"
          transparent={false}
          visible={scanning}
          onRequestClose={() => {
            setScanning(false)
            failedBarcodeForVisualRef.current = null
          }}
        >
          <BarcodeScannerView
            onScan={handleBarCodeScanned}
            onClose={() => {
              setScanning(false)
              failedBarcodeForVisualRef.current = null
            }}
          />
        </Modal>
      )}

      {isTakingPhoto && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={isTakingPhoto}
          onRequestClose={() => {
            setIsTakingPhoto(false)
            failedBarcodeForVisualRef.current = null
          }}
        >
          <PhotoCameraView onPhotoTaken={handlePhotoTaken} />
        </Modal>
      )}
    </KeyboardAvoidingView>
  )
}

export default HomeScreen
