// lib/db.ts - Fixed to properly export ActivityLog model
import mongoose from "mongoose"
import crypto from "crypto"
import { SystemLog, SystemLogDocument } from "./schemas/system-log-schema" // Assuming SystemLogDocument is exported
import ActivityLog from "./schemas/activity-log-schema" // Assuming ActivityLogDocument might be useful later or is part of its type

declare global {
  var mongooseConnectionCache: { conn: any; promise: any } | undefined // Renamed from mongoose
}

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://richardjzacs:c8JX2NGNgTaRU0np@cluster0.cbrup.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"

let cached = global.mongooseConnectionCache || { conn: null, promise: null } // Updated to use renamed global

if (!cached) {
  cached = global.mongooseConnectionCache = { conn: null, promise: null } // Updated to use renamed global
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

// Helper function for robust model definition
function defineModel<T extends mongoose.Document>(modelName: string, schema: mongoose.Schema): mongoose.Model<T> {
  if (mongoose && typeof mongoose.models === 'object' && mongoose.models !== null) {
    return (mongoose.models[modelName] as mongoose.Model<T>) || mongoose.model<T>(modelName, schema);
  } else {
    console.warn(
      `mongoose.models is not an object or mongoose is not fully initialized when defining ${modelName} model. mongoose object:`,
      mongoose,
      "mongoose.models:",
      mongoose ? mongoose.models : "mongoose is undefined"
    );
    try {
      return mongoose.model<T>(modelName, schema);
    } catch (e: any) {
      console.error(`Fallback mongoose.model("${modelName}", ...) failed:`, e);
      throw new Error(`Critical error: Unable to define ${modelName} model due to problematic Mongoose state. Original error: ${e.message}`);
    }
  }
}

// Define interfaces for Document types if not already available
// (These are examples, adjust them based on your actual schema definitions if needed for type safety with defineModel)
interface UserDocument extends mongoose.Document {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  authDate?: number;
  exchange?: "binance" | "btcc";
  exchangeConnected?: boolean;
  apiKey?: string;
  apiSecret?: string;
  riskLevel?: "low" | "medium" | "high";
  lastSignalTokens?: { token: string; timestamp: Date }[];
  createdAt?: Date;
  updatedAt?: Date;
  isAdmin?: boolean; 
}
interface SignalDocument extends mongoose.Document {
  type: "BUY" | "SELL";
  token: string;
  price: number;
  riskLevel: "low" | "medium" | "high";
  createdAt?: Date;
  expiresAt: Date;
  autoExecuted?: boolean;
  link?: string;
  positives?: string[];
  warnings?: string[];
  warning_count?: number;
}
interface TradeDocument extends mongoose.Document {
  userId: mongoose.Schema.Types.ObjectId;
  signalId?: mongoose.Schema.Types.ObjectId;
  cycleId?: mongoose.Schema.Types.ObjectId;
  type: "BUY" | "SELL";
  token: string;
  price: number;
  amount: number;
  status?: "pending" | "completed" | "failed";
  autoExecuted?: boolean;
  createdAt?: Date;
}
interface CycleDocument extends mongoose.Document {
  userId: mongoose.Schema.Types.ObjectId;
  token: string;
  entryTrade?: mongoose.Schema.Types.ObjectId;
  exitTrade?: mongoose.Schema.Types.ObjectId;
  state?: "entry" | "hold" | "exit" | "completed";
  entryPrice?: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercentage?: number;
  guidance?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
interface PortfolioDocument extends mongoose.Document {
  userId: mongoose.Schema.Types.ObjectId;
  totalValue?: number;
  freeCapital?: number;
  allocatedCapital?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  holdings?: {
    token?: string;
    amount?: number;
    averagePrice?: number;
    currentPrice?: number;
    value?: number;
    pnl?: number;
    pnlPercentage?: number;
  }[];
  updatedAt?: Date;
}
interface NotificationDocument extends mongoose.Document {
  userId: mongoose.Schema.Types.ObjectId;
  type: "signal" | "trade" | "cycle" | "system";
  message: string;
  read?: boolean;
  relatedId?: mongoose.Schema.Types.ObjectId;
  createdAt?: Date;
}


// Create and export models
export const models = {
  User: defineModel<UserDocument>("User", userSchema),
  Signal: defineModel<SignalDocument>("Signal", signalSchema),
  Trade: defineModel<TradeDocument>("Trade", tradeSchema),
  Cycle: defineModel<CycleDocument>("Cycle", cycleSchema),
  Portfolio: defineModel<PortfolioDocument>("Portfolio", portfolioSchema),
  Notification: defineModel<NotificationDocument>("Notification", notificationSchema),
  ActivityLog: ActivityLog, // Already robustly defined in its own file
  SystemLog: SystemLog      // Already robustly defined in its own file
};