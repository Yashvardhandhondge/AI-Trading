// lib/db.ts - Update to include SystemLog model
import mongoose from "mongoose"
import crypto from "crypto"
import { SystemLog } from "./schemas/system-log-schema"

declare global {
  var mongoose: { conn: any; promise: any } | undefined
}

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://richardjzacs:c8JX2NGNgTaRU0np@cluster0.cbrup.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"

let cached = global.mongoose || { conn: null, promise: null }

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null }
}

export async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    }

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose
    })
  }

  cached.conn = await cached.promise
  return cached.conn
}

// Encryption functions for API keys
export function encryptApiKey(text: string, secretKey: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(secretKey, "hex"), iv)
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  return `${iv.toString("hex")}:${encrypted}`
}

export function decryptApiKey(encryptedText: string, secretKey: string): string {
  const [ivHex, encryptedHex] = encryptedText.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(secretKey, "hex"), iv)
  let decrypted = decipher.update(encryptedHex, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

// Define Mongoose schemas and models
const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  photoUrl: String,
  authDate: Number,
  exchange: { type: String, enum: ["binance", "btcc"] },
  exchangeConnected: { type: Boolean, default: false },
  apiKey: { type: String },
  apiSecret: { type: String },
  riskLevel: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  lastSignalTokens: [
    {
      token: String,
      timestamp: Date,
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isAdmin: { type: Boolean, default: false },
})

const signalSchema = new mongoose.Schema({
  type: { type: String, enum: ["BUY", "SELL"], required: true },
  token: { type: String, required: true },
  price: { type: Number, required: true },
  riskLevel: { type: String, enum: ["low", "medium", "high"], required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  autoExecuted: { type: Boolean, default: false },
  link: String,
  positives: [String],
  warnings: [String],
  warning_count: Number
})

const tradeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  signalId: { type: mongoose.Schema.Types.ObjectId, ref: "Signal" },
  cycleId: { type: mongoose.Schema.Types.ObjectId, ref: "Cycle" },
  type: { type: String, enum: ["BUY", "SELL"], required: true },
  token: { type: String, required: true },
  price: { type: Number, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
  autoExecuted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
})

const cycleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  token: { type: String, required: true },
  entryTrade: { type: mongoose.Schema.Types.ObjectId, ref: "Trade" },
  exitTrade: { type: mongoose.Schema.Types.ObjectId, ref: "Trade" },
  state: { type: String, enum: ["entry", "hold", "exit", "completed"], default: "entry" },
  entryPrice: { type: Number },
  exitPrice: { type: Number },
  pnl: { type: Number },
  pnlPercentage: { type: Number },
  guidance: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

const portfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  totalValue: { type: Number, default: 0 },
  freeCapital: { type: Number, default: 0 },
  allocatedCapital: { type: Number, default: 0 },
  realizedPnl: { type: Number, default: 0 },
  unrealizedPnl: { type: Number, default: 0 },
  holdings: [
    {
      token: String,
      amount: Number,
      averagePrice: Number,
      currentPrice: Number,
      value: Number,
      pnl: Number,
      pnlPercentage: Number,
    },
  ],
  updatedAt: { type: Date, default: Date.now },
})

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["signal", "trade", "cycle", "system"], required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  relatedId: { type: mongoose.Schema.Types.ObjectId },
  createdAt: { type: Date, default: Date.now },
})

// Create and export models
export const models = {
  User: mongoose.models.User || mongoose.model("User", userSchema),
  Signal: mongoose.models.Signal || mongoose.model("Signal", signalSchema),
  Trade: mongoose.models.Trade || mongoose.model("Trade", tradeSchema),
  Cycle: mongoose.models.Cycle || mongoose.model("Cycle", cycleSchema),
  Portfolio: mongoose.models.Portfolio || mongoose.model("Portfolio", portfolioSchema),
  Notification: mongoose.models.Notification || mongoose.model("Notification", notificationSchema),
  SystemLog: SystemLog // Include our new SystemLog model
}