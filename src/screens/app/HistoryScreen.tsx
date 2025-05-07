"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
} from "react-native"
import { useTheme } from "../../contexts/ThemeContext"
import { useAuth } from "../../contexts/AuthContext"
import { Ionicons } from "@expo/vector-icons"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { CompositeScreenProps } from "@react-navigation/native"
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs"
import type { AppStackParamList, MainTabsParamList } from "../../navigation"
import { getScannedProducts, deleteScannedProduct } from "../../services/api"
import ProductCard from "../../components/ProductCard"
import EmptyState from "../../components/EmptyState"
import SearchBar from "../../components/SearchBar"
import FilterChip from "../../components/FilterChip"
import { formatDate } from "../../utils/formatters"

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, "History">,
  NativeStackScreenProps<AppStackParamList>
>

interface ScannedProduct {
  id: string
  barcode: string
  product_name: string
  product_image: string
  brand: string
  nutrition_grade: string
  health_score?: number
  sustainability_score?: number
  scanned_at: string
}

// Definizione dei filtri disponibili
const NUTRITION_GRADES = ["a", "b", "c", "d", "e"]
const HEALTH_SCORE_RANGES = [
  { label: "Eccellente (80-100)", min: 80, max: 100 },
  { label: "Buono (60-79)", min: 60, max: 79 },
  { label: "Medio (40-59)", min: 40, max: 59 },
  { label: "Scarso (20-39)", min: 20, max: 39 },
  { label: "Pessimo (0-19)", min: 0, max: 19 },
]
const SUSTAINABILITY_SCORE_RANGES = [
  { label: "Eccellente (80-100)", min: 80, max: 100 },
  { label: "Buono (60-79)", min: 60, max: 79 },
  { label: "Medio (40-59)", min: 40, max: 59 },
  { label: "Scarso (20-39)", min: 20, max: 39 },
  { label: "Pessimo (0-19)", min: 0, max: 19 },
]

const HistoryScreen: React.FC<Props> = ({ navigation }) => {
  const [products, setProducts] = useState<ScannedProduct[]>([])
  const [filteredProducts, setFilteredProducts] = useState<ScannedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedGrades, setSelectedGrades] = useState<string[]>([])
  const [selectedHealthRanges, setSelectedHealthRanges] = useState<number[]>([])
  const [selectedSustainabilityRanges, setSelectedSustainabilityRanges] = useState<number[]>([])
  const [activeFilterTab, setActiveFilterTab] = useState<"nutrition" | "health" | "sustainability">("nutrition")
  const { colors } = useTheme()
  const { user } = useAuth()

  useEffect(() => {
    fetchScannedProducts()
  }, [])

  useEffect(() => {
    filterProducts()
  }, [products, searchQuery, selectedGrades, selectedHealthRanges, selectedSustainabilityRanges])

  const fetchScannedProducts = async () => {
    if (!user) return

    setLoading(true)
    try {
      const data = await getScannedProducts(user.id)
      setProducts(data)
    } catch (error) {
      Alert.alert(
        "Errore",
        error instanceof Error ? error.message : "Si è verificato un errore durante il recupero dei prodotti.",
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchScannedProducts()
  }

  const handleProductPress = (barcode: string) => {
    navigation.navigate("ProductDetail", { barcode })
  }

  const handleDeleteProduct = async (id: string) => {
    try {
      await deleteScannedProduct(id)
      setProducts(products.filter((product) => product.id !== id))
      Alert.alert("Successo", "Prodotto eliminato dalla cronologia.")
    } catch (error) {
      Alert.alert(
        "Errore",
        error instanceof Error ? error.message : "Si è verificato un errore durante l'eliminazione del prodotto.",
      )
    }
  }

  const confirmDelete = (id: string) => {
    Alert.alert("Conferma eliminazione", "Sei sicuro di voler eliminare questo prodotto dalla cronologia?", [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => handleDeleteProduct(id) },
    ])
  }

  const filterProducts = useCallback(() => {
    let filtered = [...products]

    // Filtra per query di ricerca
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (product) => product.product_name.toLowerCase().includes(query) || product.brand.toLowerCase().includes(query),
      )
    }

    // Filtra per grado nutrizionale
    if (selectedGrades.length > 0) {
      filtered = filtered.filter((product) => selectedGrades.includes(product.nutrition_grade.toLowerCase()))
    }

    // Filtra per punteggio di salute
    if (selectedHealthRanges.length > 0) {
      filtered = filtered.filter((product) => {
        if (!product.health_score) return false
        return selectedHealthRanges.some((rangeIndex) => {
          const range = HEALTH_SCORE_RANGES[rangeIndex]
          return product.health_score >= range.min && product.health_score <= range.max
        })
      })
    }

    // Filtra per punteggio di sostenibilità
    if (selectedSustainabilityRanges.length > 0) {
      filtered = filtered.filter((product) => {
        if (!product.sustainability_score) return false
        return selectedSustainabilityRanges.some((rangeIndex) => {
          const range = SUSTAINABILITY_SCORE_RANGES[rangeIndex]
          return product.sustainability_score >= range.min && product.sustainability_score <= range.max
        })
      })
    }

    setFilteredProducts(filtered)
  }, [products, searchQuery, selectedGrades, selectedHealthRanges, selectedSustainabilityRanges])

  const toggleGradeFilter = (grade: string) => {
    if (selectedGrades.includes(grade)) {
      setSelectedGrades(selectedGrades.filter((g) => g !== grade))
    } else {
      setSelectedGrades([...selectedGrades, grade])
    }
  }

  const toggleHealthRangeFilter = (index: number) => {
    if (selectedHealthRanges.includes(index)) {
      setSelectedHealthRanges(selectedHealthRanges.filter((i) => i !== index))
    } else {
      setSelectedHealthRanges([...selectedHealthRanges, index])
    }
  }

  const toggleSustainabilityRangeFilter = (index: number) => {
    if (selectedSustainabilityRanges.includes(index)) {
      setSelectedSustainabilityRanges(selectedSustainabilityRanges.filter((i) => i !== index))
    } else {
      setSelectedSustainabilityRanges([...selectedSustainabilityRanges, index])
    }
  }

  const clearFilters = () => {
    setSearchQuery("")
    setSelectedGrades([])
    setSelectedHealthRanges([])
    setSelectedSustainabilityRanges([])
  }

  const renderProductItem = ({ item }: { item: ScannedProduct }) => (
    <View style={styles.productItemContainer}>
      <ProductCard
        productName={item.product_name}
        brand={item.brand}
        imageUrl={item.product_image}
        nutritionGrade={item.nutrition_grade}
        healthScore={item.health_score}
        sustainabilityScore={item.sustainability_score}
        onPress={() => handleProductPress(item.barcode)}
      />
      <View style={styles.productItemFooter}>
        <Text style={styles.dateText}>{formatDate(item.scanned_at)}</Text>
        <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item.id)}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  )

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    header: {
      marginBottom: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.text + "80",
      marginBottom: 16,
    },
    filtersContainer: {
      marginBottom: 16,
    },
    filtersRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 8,
    },
    filterLabel: {
      fontSize: 14,
      color: colors.text,
      marginBottom: 8,
    },
    clearFiltersButton: {
      flexDirection: "row",
      alignItems: "center",
    },
    clearFiltersText: {
      fontSize: 14,
      color: colors.primary,
      marginLeft: 4,
    },
    productItemContainer: {
      marginBottom: 16,
    },
    productItemFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 8,
      marginTop: 4,
    },
    dateText: {
      fontSize: 12,
      color: colors.text + "80",
    },
    deleteButton: {
      padding: 4,
    },
    emptyFiltersContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card,
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
    },
    emptyFiltersText: {
      fontSize: 14,
      color: colors.text + "80",
      marginLeft: 8,
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
  })

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon="time-outline"
        title="Nessun prodotto scannerizzato"
        message="Non hai ancora scannerizzato nessun prodotto. Inizia a scannerizzare per vedere la tua cronologia."
        actionLabel="Scansiona un prodotto"
        onAction={() => navigation.navigate("Home")}
      />
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        renderItem={renderProductItem}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.title}>La tua cronologia</Text>
              <Text style={styles.subtitle}>
                {products.length} {products.length === 1 ? "prodotto" : "prodotti"} scannerizzati
              </Text>
            </View>

            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              onClear={() => setSearchQuery("")}
              placeholder="Cerca per nome o marca..."
            />

            <View style={styles.filtersContainer}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.filterLabel}>Filtra per:</Text>
                {(selectedGrades.length > 0 ||
                  selectedHealthRanges.length > 0 ||
                  selectedSustainabilityRanges.length > 0 ||
                  searchQuery) && (
                  <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
                    <Ionicons name="close-circle-outline" size={16} color={colors.primary} />
                    <Text style={styles.clearFiltersText}>Cancella filtri</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.tabsContainer}>
                <TouchableOpacity
                  style={[styles.tab, activeFilterTab === "nutrition" && styles.activeTab]}
                  onPress={() => setActiveFilterTab("nutrition")}
                >
                  <Text style={[styles.tabText, activeFilterTab === "nutrition" && styles.activeTabText]}>
                    Nutri-Score
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, activeFilterTab === "health" && styles.activeTab]}
                  onPress={() => setActiveFilterTab("health")}
                >
                  <Text style={[styles.tabText, activeFilterTab === "health" && styles.activeTabText]}>Salute</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, activeFilterTab === "sustainability" && styles.activeTab]}
                  onPress={() => setActiveFilterTab("sustainability")}
                >
                  <Text style={[styles.tabText, activeFilterTab === "sustainability" && styles.activeTabText]}>
                    Sostenibilità
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.filtersRow}>
                  {activeFilterTab === "nutrition" &&
                    NUTRITION_GRADES.map((grade) => (
                      <FilterChip
                        key={grade}
                        label={`Nutri-Score ${grade.toUpperCase()}`}
                        selected={selectedGrades.includes(grade)}
                        onPress={() => toggleGradeFilter(grade)}
                      />
                    ))}

                  {activeFilterTab === "health" &&
                    HEALTH_SCORE_RANGES.map((range, index) => (
                      <FilterChip
                        key={`health-${index}`}
                        label={range.label}
                        selected={selectedHealthRanges.includes(index)}
                        onPress={() => toggleHealthRangeFilter(index)}
                      />
                    ))}

                  {activeFilterTab === "sustainability" &&
                    SUSTAINABILITY_SCORE_RANGES.map((range, index) => (
                      <FilterChip
                        key={`sustainability-${index}`}
                        label={range.label}
                        selected={selectedSustainabilityRanges.includes(index)}
                        onPress={() => toggleSustainabilityRangeFilter(index)}
                      />
                    ))}
                </View>
              </ScrollView>
            </View>

            {filteredProducts.length === 0 && (
              <View style={styles.emptyFiltersContainer}>
                <Ionicons name="information-circle-outline" size={20} color={colors.text + "80"} />
                <Text style={styles.emptyFiltersText}>Nessun prodotto corrisponde ai filtri selezionati</Text>
              </View>
            )}
          </>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      />
    </View>
  )
}

export default HistoryScreen
