"use client"

import type React from "react"
import { createContext, useContext, useState } from "react"
import { useColorScheme } from "react-native"
import { lightColors, darkColors, type Colors } from "../theme/colors"

type ThemeContextType = {
  isDarkMode: boolean
  toggleTheme: () => void
  colors: Colors
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const deviceTheme = useColorScheme()
  const [isDarkMode, setIsDarkMode] = useState(deviceTheme === "dark")

  const toggleTheme = () => {
    setIsDarkMode((prev) => !prev)
  }

  const colors = isDarkMode ? darkColors : lightColors

  return <ThemeContext.Provider value={{ isDarkMode, toggleTheme, colors }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error("useTheme deve essere usato all'interno di un ThemeProvider")
  }
  return context
}
