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
  ScrollView,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { useTheme } from "../../contexts/ThemeContext"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import { Ionicons } from "@expo/vector-icons"
import StatisticCard from "../../components/StatisticCard"
import SettingsItem from "../../components/SettingsItem"
import * as ImagePicker from "expo-image-picker"
import { decode } from "base64-js"

interface Profile {
  id: string
  username: string | null
  email: string
  avatar_url: string | null
}

interface UserStats {
  totalScanned: number
  favoriteNutritionGrade: string
  mostScannedBrand: string
  lastScanDate: string
}

const ProfileScreen: React.FC = () => {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [username, setUsername] = useState("")
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const { user, signOut } = useAuth()
  const { colors, isDarkMode, toggleTheme } = useTheme()

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    const day = date.getDate().toString().padStart(2, "0")
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  useEffect(() => {
    if (user) {
      fetchProfile()
      fetchUserStats()
    }
  }, [user])

  const fetchProfile = async () => {
    try {
      setLoading(true)
      if (!user) return

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, email, avatar_url")
        .eq("id", user.id)
        .single()

      if (error) {
        console.error("Errore nel recupero del profilo:", error)
      } else if (data) {
        setProfile(data)
        setUsername(data.username || "")
      }
    } catch (error) {
      console.error("Errore nel recupero del profilo:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUserStats = async () => {
    try {
      if (!user) return

      // Ottieni il numero totale di prodotti scannerizzati
      const { count: totalScanned, error: countError } = await supabase
        .from("scanned_products")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)

      if (countError) throw countError

      // Ottieni tutti i nutrition_grade e brand
      const { data: allData, error: allDataError } = await supabase
        .from("scanned_products")
        .select("nutrition_grade, brand")
        .eq("user_id", user.id)

      if (allDataError) throw allDataError

      // Raggruppa nutrition_grade in JS
      const nutritionCounts: Record<string, number> = {}
      const brandCounts: Record<string, number> = {}
      allData?.forEach(item => {
        if (item.nutrition_grade) {
          nutritionCounts[item.nutrition_grade] = (nutritionCounts[item.nutrition_grade] || 0) + 1
        }
        if (item.brand) {
          brandCounts[item.brand] = (brandCounts[item.brand] || 0) + 1
        }
      })
      const sortedNutrition = Object.entries(nutritionCounts).sort((a, b) => b[1] - a[1])
      const sortedBrand = Object.entries(brandCounts).sort((a, b) => b[1] - a[1])
      const favoriteNutritionGrade = sortedNutrition.length > 0 ? sortedNutrition[0][0].toUpperCase() : "N/A"
      const mostScannedBrand = sortedBrand.length > 0 ? sortedBrand[0][0] : "N/A"

      // Ottieni la data dell'ultima scansione
      const { data: lastScanData, error: lastScanError } = await supabase
        .from("scanned_products")
        .select("scanned_at")
        .eq("user_id", user.id)
        .order("scanned_at", { ascending: false })
        .limit(1)

      if (lastScanError) throw lastScanError

      setStats({
        totalScanned: totalScanned || 0,
        favoriteNutritionGrade,
        mostScannedBrand,
        lastScanDate: lastScanData && lastScanData.length > 0 ? lastScanData[0].scanned_at : "N/A",
      })
    } catch (error) {
      console.error("Errore nel recupero delle statistiche:", error)
    }
  }

  const updateProfile = async () => {
    try {
      setUpdating(true)
      if (!user) return

      const { error } = await supabase.from("profiles").update({ username }).eq("id", user.id)

      if (error) {
        Alert.alert("Errore", "Si è verificato un errore durante l'aggiornamento del profilo.")
      } else {
        Alert.alert("Successo", "Profilo aggiornato con successo.")
        fetchProfile()
        setEditModalVisible(false)
      }
    } catch (error) {
      console.error("Errore nell'aggiornamento del profilo:", error)
      Alert.alert("Errore", "Si è verificato un errore durante l'aggiornamento del profilo.")
    } finally {
      setUpdating(false)
    }
  }

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      })

      if (!result.canceled && result.assets && result.assets[0].base64) {
        await uploadAvatar(result.assets[0].base64)
      }
    } catch (error) {
      console.error("Errore nella selezione dell'immagine:", error)
      Alert.alert("Errore", "Si è verificato un errore durante la selezione dell'immagine.")
    }
  }

  const uploadAvatar = async (base64Image: string) => {
    try {
      setUploadingAvatar(true)
      if (!user) return

      const fileName = `avatar-${user.id}-${Date.now()}.jpg`
      const contentType = "image/jpeg"
      const data = decode(base64Image)

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, data, { contentType, upsert: true })

      if (uploadError) {
        throw uploadError
      }

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName)

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: urlData.publicUrl })
        .eq("id", user.id)

      if (updateError) {
        throw updateError
      }

      Alert.alert("Successo", "Immagine del profilo aggiornata con successo.")
      fetchProfile()
    } catch (error) {
      console.error("Errore nel caricamento dell'avatar:", error)
      Alert.alert("Errore", "Si è verificato un errore durante il caricamento dell'immagine.")
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSignOut = async () => {
    Alert.alert("Conferma logout", "Sei sicuro di voler uscire?", [
      { text: "Annulla", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: signOut },
    ])
  }

  const handleDeleteAccount = () => {
    Alert.alert(
      "Elimina account",
      "Sei sicuro di voler eliminare il tuo account? Questa azione è irreversibile e tutti i tuoi dati verranno persi.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true)
              if (!user) return

              // Elimina il profilo (la cascata eliminerà anche i prodotti scannerizzati)
              const { error } = await supabase.from("profiles").delete().eq("id", user.id)

              if (error) throw error

              // Logout
              await signOut()
              Alert.alert("Account eliminato", "Il tuo account è stato eliminato con successo.")
            } catch (error) {
              console.error("Errore nell'eliminazione dell'account:", error)
              Alert.alert("Errore", "Si è verificato un errore durante l'eliminazione dell'account.")
              setLoading(false)
            }
          },
        },
      ],
    )
  }

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
      alignItems: "center",
      marginBottom: 24,
    },
    avatarContainer: {
      position: "relative",
      marginBottom: 16,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.card,
    },
    editAvatarButton: {
      position: "absolute",
      bottom: 0,
      right: 0,
      backgroundColor: colors.primary,
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.background,
    },
    avatarPlaceholder: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.card,
      justifyContent: "center",
      alignItems: "center",
    },
    username: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 4,
    },
    email: {
      fontSize: 16,
      color: colors.text + "80",
    },
    editButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      marginTop: 12,
    },
    editButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "bold",
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 16,
    },
    statsContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
    settingsContainer: {
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 8,
    },
    modalContainer: {
      flex: 1,
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    modalContent: {
      backgroundColor: colors.background,
      margin: 20,
      borderRadius: 12,
      padding: 20,
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 16,
    },
    inputContainer: {
      marginBottom: 20,
    },
    label: {
      fontSize: 16,
      marginBottom: 8,
      color: colors.text,
    },
    input: {
      backgroundColor: colors.card,
      borderRadius: 8,
      padding: 15,
      fontSize: 16,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
    },
    modalButtonsContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    cancelButton: {
      backgroundColor: colors.card,
      borderRadius: 8,
      padding: 12,
      alignItems: "center",
      flex: 1,
      marginRight: 8,
    },
    cancelButtonText: {
      color: colors.text,
      fontSize: 16,
    },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 12,
      alignItems: "center",
      flex: 1,
      marginLeft: 8,
    },
    saveButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "bold",
    },
  })

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={50} color={colors.text + "60"} />
              </View>
            )}
            <TouchableOpacity style={styles.editAvatarButton} onPress={pickImage} disabled={uploadingAvatar}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.username}>{profile?.username || "Utente"}</Text>
          <Text style={styles.email}>{profile?.email}</Text>
          <TouchableOpacity style={styles.editButton} onPress={() => setEditModalVisible(true)}>
            <Text style={styles.editButtonText}>Modifica Profilo</Text>
          </TouchableOpacity>
        </View>

        {stats && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Le tue statistiche</Text>
            <View style={styles.statsContainer}>
              <StatisticCard
                title="Prodotti Scannerizzati"
                value={stats.totalScanned}
                icon="barcode-outline"
                color={colors.primary}
              />
              <StatisticCard
                title="Nutri-Score Preferito"
                value={stats.favoriteNutritionGrade}
                icon="nutrition-outline"
                color="#7AC547"
              />
              <StatisticCard
                title="Marca Più Scannerizzata"
                value={stats.mostScannedBrand}
                icon="pricetag-outline"
                color="#FF9800"
              />
              <StatisticCard
                title="Ultima Scansione"
                value={stats.lastScanDate !== "N/A" ? formatDate(stats.lastScanDate) : "N/A"}
                icon="time-outline"
                color="#2196F3"
              />
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Impostazioni</Text>
          <View style={styles.settingsContainer}>
            <SettingsItem
              title="Tema Scuro"
              icon="moon-outline"
              type="toggle"
              value={isDarkMode}
              onToggle={toggleTheme}
              onPress={() => {}}
            />
            <SettingsItem
              title="Informazioni App"
              icon="information-circle-outline"
              type="link"
              onPress={() => Alert.alert("FoodScanner", "Versione 1.0.0\n© 2023 FoodScanner")}
            />
            <SettingsItem
              title="Termini e Condizioni"
              icon="document-text-outline"
              type="link"
              onPress={() => Alert.alert("Termini e Condizioni", "I termini e le condizioni dell'app.")}
            />
            <SettingsItem
              title="Privacy Policy"
              icon="shield-checkmark-outline"
              type="link"
              onPress={() => Alert.alert("Privacy Policy", "La privacy policy dell'app.")}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.settingsContainer}>
            <SettingsItem
              title="Logout"
              icon="log-out-outline"
              iconColor={colors.error}
              type="button"
              onPress={handleSignOut}
            />
            <SettingsItem
              title="Elimina Account"
              icon="trash-outline"
              iconColor={colors.error}
              type="button"
              onPress={handleDeleteAccount}
              destructive
            />
          </View>
        </View>
      </View>

      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Modifica Profilo</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                placeholder="Inserisci un username"
                placeholderTextColor={colors.text + "80"}
                value={username}
                onChangeText={setUsername}
              />
            </View>
            <View style={styles.modalButtonsContainer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setUsername(profile?.username || "")
                  setEditModalVisible(false)
                }}
              >
                <Text style={styles.cancelButtonText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={updateProfile} disabled={updating}>
                {updating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Salva</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  )
}

export default ProfileScreen
