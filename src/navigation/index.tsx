"use client"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { useAuth } from "../contexts/AuthContext"
import { useTheme } from "../contexts/ThemeContext"
import { ActivityIndicator, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"

// Schermate di autenticazione
import LoginScreen from "../screens/auth/LoginScreen"
import RegisterScreen from "../screens/auth/RegisterScreen"

// Schermate dell'app
import HomeScreen from "../screens/app/HomeScreen"
import ProfileScreen from "../screens/app/ProfileScreen"
import HistoryScreen from "../screens/app/HistoryScreen"
import ProductDetailScreen from "../screens/app/ProductDetailScreen"

// Importa i tipi necessari
import type { RawProductData } from "../services/api";
import type { GeminiAnalysisResult } from "../services/gemini";

// Definizione dei tipi per la navigazione
export type AuthStackParamList = {
  Login: undefined
  Register: undefined
}

export type AppStackParamList = {
  MainTabs: undefined
  ProductDetail: { 
    productRecordId: string;
    initialProductData?: RawProductData | null;
    aiAnalysisResult?: GeminiAnalysisResult | null;
  }
}

export type MainTabsParamList = {
  Home: undefined
  History: undefined
  Profile: undefined
}

const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const AppStack = createNativeStackNavigator<AppStackParamList>()
const MainTabs = createBottomTabNavigator<MainTabsParamList>()

const MainTabsNavigator = () => {
  const { colors } = useTheme()

  return (
    <MainTabs.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
      }}
    >
      <MainTabs.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: "Scanner",
          tabBarIcon: ({ color, size }) => <Ionicons name="barcode-outline" size={size} color={color} />,
        }}
      />
      <MainTabs.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: "Cronologia",
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <MainTabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: "Profilo",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </MainTabs.Navigator>
  )
}

const Navigation = () => {
  const { user, loading } = useAuth()
  const { colors } = useTheme()

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return user ? (
    <AppStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <AppStack.Screen name="MainTabs" component={MainTabsNavigator} options={{ headerShown: false }} />
      <AppStack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: "Dettaglio Prodotto" }} />
    </AppStack.Navigator>
  ) : (
    <AuthStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  )
}

export default Navigation
