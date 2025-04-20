import { TelegramAuthWrapper } from "@/components/telegram-auth-wrapper"
import { MainApp } from "@/components/main-app"

export default function Home() {
  return (
    <TelegramAuthWrapper>
      <MainApp />
    </TelegramAuthWrapper>
  )
}
