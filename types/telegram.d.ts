// Type definitions for Telegram WebApp
// These types are based on the Telegram WebApp documentation

interface TelegramWebApp {
    initData: string
    initDataUnsafe: {
      query_id: string
      user: {
        id: number
        first_name: string
        last_name?: string
        username?: string
        language_code?: string
        photo_url?: string
      }
      auth_date: number
      hash: string
    }
    colorScheme: "light" | "dark"
    themeParams: {
      bg_color: string
      text_color: string
      hint_color: string
      link_color: string
      button_color: string
      button_text_color: string
      secondary_bg_color: string
    }
    isExpanded: boolean
    viewportHeight: number
    viewportStableHeight: number
    headerColor: string
    backgroundColor: string
    ready(): void
    expand(): void
    close(): void
    showPopup(
      params: { title?: string; message: string; buttons?: Array<{ type?: string; text: string }> },
      callback?: Function,
    ): void
    showAlert(message: string, callback?: Function): void
    showConfirm(message: string, callback?: Function): void
    enableClosingConfirmation(): void
    disableClosingConfirmation(): void
    onEvent(eventType: string, eventHandler: Function): void
    offEvent(eventType: string, eventHandler: Function): void
    sendData(data: string): void
    openLink(url: string, options?: { try_instant_view?: boolean }): void
    openTelegramLink(url: string): void
    openInvoice(url: string, callback?: Function): void
    setHeaderColor(color: string): void
    setBackgroundColor(color: string): void
    MainButton: {
      text: string
      color: string
      textColor: string
      isVisible: boolean
      isActive: boolean
      isProgressVisible: boolean
      setText(text: string): void
      onClick(callback: Function): void
      offClick(callback: Function): void
      show(): void
      hide(): void
      enable(): void
      disable(): void
      showProgress(leaveActive?: boolean): void
      hideProgress(): void
      setParams(params: {
        text?: string
        color?: string
        text_color?: string
        is_active?: boolean
        is_visible?: boolean
      }): void
    }
    BackButton: {
      isVisible: boolean
      onClick(callback: Function): void
      offClick(callback: Function): void
      show(): void
      hide(): void
    }
    HapticFeedback: {
      impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void
      notificationOccurred(type: "error" | "success" | "warning"): void
      selectionChanged(): void
    }
    CloudStorage: {
      getItem(key: string, callback?: Function): Promise<string | null>
      setItem(key: string, value: string, callback?: Function): Promise<void>
      removeItem(key: string, callback?: Function): Promise<void>
      getItems(keys: string[], callback?: Function): Promise<Record<string, string | null>>
      removeItems(keys: string[], callback?: Function): Promise<void>
      getKeys(callback?: Function): Promise<string[]>
    }
  }
  
  interface Telegram {
    WebApp: TelegramWebApp
  }
  
  // Add to the global Window interface
  interface Window {
    Telegram: Telegram
  }
  