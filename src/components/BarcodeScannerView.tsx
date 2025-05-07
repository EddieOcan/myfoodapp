"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import { useTheme } from "../contexts/ThemeContext"
import { Ionicons } from "@expo/vector-icons"

interface BarcodeScannerViewProps {
  onScan: (barcode: string) => void
  onClose: () => void
}

const BarcodeScannerView: React.FC<BarcodeScannerViewProps> = ({ onScan, onClose }) => {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [torch, setTorch] = useState(false)
  const { colors } = useTheme()

  useEffect(() => {
    if (!permission) {
      requestPermission()
    }
  }, [permission])

  const hasPermission = permission?.granted ?? null

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return
    setScanned(true)
    onScan(data)
  }

  const toggleTorch = () => {
    setTorch(!torch)
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#000",
    },
    camera: {
      flex: 1,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      alignItems: "center",
    },
    scanArea: {
      width: 250,
      height: 250,
      borderWidth: 2,
      borderColor: colors.primary,
      borderRadius: 16,
      backgroundColor: "transparent",
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#000",
    },
    permissionContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
      padding: 20,
    },
    permissionText: {
      color: colors.text,
      fontSize: 16,
      textAlign: "center",
      marginBottom: 20,
    },
    permissionButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 15,
      alignItems: "center",
    },
    permissionButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "bold",
    },
    controlsContainer: {
      position: "absolute",
      bottom: 40,
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "space-around",
      padding: 20,
    },
    controlButton: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
    },
    closeButton: {
      position: "absolute",
      top: 40,
      right: 20,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
    },
    scanText: {
      position: "absolute",
      bottom: 150,
      left: 0,
      right: 0,
      textAlign: "center",
      color: "#FFFFFF",
      fontSize: 16,
      backgroundColor: "rgba(0,0,0,0.6)",
      padding: 10,
    },
  })

  if (hasPermission === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (hasPermission === false) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          È necessario concedere l'accesso alla fotocamera per utilizzare lo scanner.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={onClose}>
          <Text style={styles.permissionButtonText}>Chiudi</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8'],
        }}
        facing={"back"}
        flash={torch ? "on" : "off"}
      />

      <View style={styles.overlay}>
        <View style={styles.scanArea} />
      </View>

      <Text style={styles.scanText}>Posiziona il codice a barre all'interno del riquadro</Text>

      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Ionicons name="close" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={styles.controlsContainer}>
        <TouchableOpacity style={styles.controlButton} onPress={toggleTorch}>
          <Ionicons name={torch ? "flash" : "flash-off"} size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default BarcodeScannerView
