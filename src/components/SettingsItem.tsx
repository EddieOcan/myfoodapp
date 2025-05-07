"use client"

import type React from "react"
import { View, Text, StyleSheet, TouchableOpacity, Switch } from "react-native"
import { useTheme } from "../contexts/ThemeContext"
import { Ionicons } from "@expo/vector-icons"

interface SettingsItemProps {
  title: string
  icon: keyof typeof Ionicons.glyphMap
  iconColor?: string
  type: "toggle" | "button" | "link"
  value?: boolean
  onPress: () => void
  onToggle?: (value: boolean) => void
  destructive?: boolean
}

const SettingsItem: React.FC<SettingsItemProps> = ({
  title,
  icon,
  iconColor,
  type,
  value,
  onPress,
  onToggle,
  destructive = false,
}) => {
  const { colors } = useTheme()
  const textColor = destructive ? colors.error : colors.text

  const styles = StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: (iconColor || colors.primary) + "20",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    content: {
      flex: 1,
    },
    title: {
      fontSize: 16,
      color: textColor,
    },
    rightContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
  })

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} disabled={type === "toggle" && onToggle !== undefined}>
      <View style={[styles.iconContainer, { backgroundColor: (iconColor || colors.primary) + "20" }]}>
        <Ionicons name={icon} size={18} color={iconColor || colors.primary} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.rightContainer}>
        {type === "toggle" && onToggle && (
          <Switch
            value={value}
            onValueChange={onToggle}
            trackColor={{ false: colors.border, true: colors.primary + "80" }}
            thumbColor={value ? colors.primary : "#f4f3f4"}
          />
        )}
        {type === "link" && <Ionicons name="chevron-forward" size={20} color={colors.text + "60"} />}
      </View>
    </TouchableOpacity>
  )
}

export default SettingsItem
