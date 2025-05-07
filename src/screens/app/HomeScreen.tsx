"use client"

import type React from "react"
import { useState, useEffect } from "react"
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
} from "react-native"
import { useTheme } from "../../contexts/ThemeContext"
import { Ionicons } from "@expo/vector-icons"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { CompositeScreenProps } from "@react-navigation/native"
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs"
import type { AppStackParamList, MainTabsParamList } from "../../navigation"
import BarcodeScannerView from "../../components/BarcodeScannerView"
import { fetchProductByBarcode } from "../../services/api"
import ProductCard from "../../components/ProductCard"

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, "Home">,
  NativeStackScreenProps<AppStackParamList>
>

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const [scanning, setScanning] = useState(false)
  const [manualBarcode, setManualBarcode] = useState("")
  const [loading, setLoading] = useState(false)
  const [recentProduct, setRecentProduct] = useState<{
    barcode: string
    name: string
    brand: string
    image: string
    nutritionGrade: string
  } | null>(null)
  const { colors } = useTheme()

  useEffect(() => {
    // Qui potremmo caricare l'ultimo prodotto scannerizzato dall'utente
    // Per ora lo lascio vuoto
  }, [])

  const handleBarCodeScanned = (barcode: string) => {
    setScanning(false)
    searchProduct(barcode)
  }

  const searchProduct = async (barcode: string) => {
    try {
      setLoading(true)
      const product = await fetchProductByBarcode(barcode)

      // Salva il prodotto recente per mostrarlo nella UI
      setRecentProduct({
        barcode: product.code,
        name: product.product_name,
        brand: product.brands,
        image: product.image_url,
        nutritionGrade: product.nutrition_grades,
      })

      // Naviga alla pagina di dettaglio
      navigation.navigate("ProductDetail", { barcode })
    } catch (error) {
      Alert.alert("Errore", error instanceof Error ? error.message : "Si è verificato un errore")
    } finally {
      setLoading(false)
    }
  }

  const handleManualSearch = () => {
    if (!manualBarcode || manualBarcode.trim() === "") {
      Alert.alert("Errore", "Inserisci un codice a barre valido")
      return
    }

    searchProduct(manualBarcode.trim())
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
      flexGrow: 1,
    },
    content: {
      flex: 1,
      padding: 20,
    },
    header: {
      marginBottom: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.text + "80",
    },
    scanButtonContainer: {
      marginBottom: 24,
    },
    scanButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
    },
    scanButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "bold",
      marginLeft: 8,
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 24,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      color: colors.text + "80",
      paddingHorizontal: 10,
      fontSize: 14,
    },
    inputContainer: {
      marginBottom: 16,
    },
    label: {
      fontSize: 16,
      marginBottom: 8,
      color: colors.text,
    },
    input: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
    },
    searchButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
    },
    searchButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "bold",
      marginLeft: 8,
    },
    recentContainer: {
      marginTop: 24,
    },
    recentTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 16,
    },
  })

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.scrollView} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Scansiona un prodotto</Text>
            <Text style={styles.subtitle}>Scopri cosa c'è nei tuoi alimenti</Text>
          </View>

          <View style={styles.scanButtonContainer}>
            <TouchableOpacity style={styles.scanButton} onPress={() => setScanning(true)}>
              <Ionicons name="barcode-outline" size={24} color="#FFFFFF" />
              <Text style={styles.scanButtonText}>Scansiona Codice a Barre</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OPPURE</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Inserisci manualmente il codice a barre</Text>
            <TextInput
              style={styles.input}
              placeholder="Es. 8001505005707"
              placeholderTextColor={colors.text + "80"}
              value={manualBarcode}
              onChangeText={setManualBarcode}
              keyboardType="numeric"
            />
          </View>

          <TouchableOpacity style={styles.searchButton} onPress={handleManualSearch} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="search-outline" size={24} color="#FFFFFF" />
                <Text style={styles.searchButtonText}>Cerca Prodotto</Text>
              </>
            )}
          </TouchableOpacity>

          {recentProduct && (
            <View style={styles.recentContainer}>
              <Text style={styles.recentTitle}>Prodotto recente</Text>
              <ProductCard
                productName={recentProduct.name}
                brand={recentProduct.brand}
                imageUrl={recentProduct.image}
                nutritionGrade={recentProduct.nutritionGrade}
                onPress={() => navigation.navigate("ProductDetail", { barcode: recentProduct.barcode })}
              />
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <BarcodeScannerView onScan={handleBarCodeScanned} onClose={() => setScanning(false)} />
      </Modal>
    </KeyboardAvoidingView>
  )
}

export default HomeScreen
