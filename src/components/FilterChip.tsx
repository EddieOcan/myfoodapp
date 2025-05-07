"use client"

import type React from "react"
import { TouchableOpacity, Text, StyleSheet } from "react-native"
import { useTheme } from "../contexts/ThemeContext"

interface FilterChipProps {
  label: string
  selected: boolean
  onPress: () => void
}

const FilterChip: React.FC<FilterChipProps> = ({ label, selected, onPress }) => {
  const { colors } = useTheme()

  const styles = StyleSheet.create({
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      marginRight: 8,
      marginBottom: 8,
      backgroundColor: selected ? colors.primary : colors.card,
      borderWidth: 1,
      borderColor: selected ? colors.primary : colors.border,
    },
    label: {
      color: selected ? "#FFFFFF" : colors.text,
      fontSize: 14,
      fontWeight: selected ? "bold" : "normal",
    },
  })

  return (
    <TouchableOpacity style={styles.chip} onPress={onPress}>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  )
}

export default FilterChip
