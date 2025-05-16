import mongoose from "mongoose"
import crypto from "crypto"
import { SystemLog, SystemLogDocument } from "./schemas/system-log-schema"

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
  apiKey: { type: String }, // To be removed when apiKeyStoredExternally is true
  apiSecret: { type: String }, // To be removed when apiKeyStoredExternally is true
  apiKeyStoredExternally: { type: Boolean, default: false }, 
  proxyUserId: { type: String }, 
  autoTradeEnabled: { type: Boolean, default: true }, // Added field
  riskLevel: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  lastSignalTokens: {
    type: [
      {
        token: String,
        timestamp: Date,
      },
    ],
    default: [], // Added default value
  },
  lastTradeSync: { type: Date }, // Added field
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isAdmin: { type: Boolean, default: false },
})

const signalSchema = new mongoose.Schema({
  type: { type: String, enum: ["BUY", "SELL"], required: true },
  token: { type: String, required: true },
  price: { type: Number, required: true },
  riskLevel: { type: String, enum: ["low", "medium", "high"], required: true },
  createdAt: { type: Date, default: Date.now }, // Made createdAt required
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
  exchangeTradeId: { type: String, index: true }, // Added field
  metadata: { type: mongoose.Schema.Types.Mixed }, // Added field
  createdAt: { type: Date, default: Date.now },
})

const partialExitSchema = new mongoose.Schema({
  tradeId: { type: mongoose.Schema.Types.ObjectId, ref: "Trade", required: true },
  percentage: { type: Number, required: true },
  price: { type: Number, required: true },
  amount: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now, required: true },
}, { _id: false });

const cycleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  token: { type: String, required: true },
  entryTrade: { type: mongoose.Schema.Types.ObjectId, ref: "Trade" },
  exitTrade: { type: mongoose.Schema.Types.ObjectId, ref: "Trade" },
  state: { type: String, enum: ["entry", "hold", "exit", "completed"], default: "entry" },
  entryPrice: { type: Number, required: true }, // Made entryPrice required
  exitPrice: { type: Number },
  pnl: { type: Number },
  pnlPercentage: { type: Number },
  guidance: { type: String },
  partialExits: { type: [partialExitSchema], default: [] }, // Added partialExits field
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

const portfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  totalValue: { type: Number, default: 0 }, // Default ensures it's always present
  freeCapital: { type: Number, default: 0 },
  allocatedCapital: { type: Number, default: 0 },
  realizedPnl: { type: Number, default: 0 },
  unrealizedPnl: { type: Number, default: 0 },
  holdings: [
    {
      token: { type: String, required: true }, // Made token required
      amount: { type: Number, required: true }, // Made amount required
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

// Note: When using `_id` (which is a mongoose.Types.ObjectId) in contexts
// that expect a string (e.g., logging, URL parameters, some API payloads),
// remember to convert it using `.toString()`, e.g., `user._id.toString()`.
export interface UserDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId; 
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
  apiKeyStoredExternally?: boolean; 
  proxyUserId?: string; 
  autoTradeEnabled: boolean; 
  riskLevel: "low" | "medium" | "high"; 
  lastSignalTokens: { token: string; timestamp: Date }[]; 
  lastTradeSync?: Date; // Added property
  createdAt?: Date;
  updatedAt?: Date;
  isAdmin?: boolean; 
}
export interface SignalDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId; // Explicit _id
  type: "BUY" | "SELL";
  token: string;
  price: number;
  riskLevel: "low" | "medium" | "high";
  createdAt: Date; // Changed from optional (createdAt?: Date) to required (createdAt: Date)
  expiresAt: Date;
  autoExecuted?: boolean;
  link?: string;
  positives?: string[];
  warnings?: string[];
  warning_count?: number;
}
export interface TradeDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId; // Explicit _id
  userId: mongoose.Types.ObjectId; // Changed type
  signalId?: mongoose.Types.ObjectId; // Changed type
  cycleId?: mongoose.Types.ObjectId; // Changed type
  type: "BUY" | "SELL";
  token: string;
  price: number;
  amount: number;
  status?: "pending" | "completed" | "failed";
  autoExecuted?: boolean;
  exchangeTradeId?: string; // Added property
  metadata?: any; // Added property, consider defining a more specific type if structure is known
  createdAt?: Date;
}
export interface PartialExitDocument {
  tradeId: mongoose.Types.ObjectId;
  percentage: number;
  price: number;
  amount: number;
  timestamp: Date;
}
export interface CycleDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId; // Explicit _id
  userId: mongoose.Types.ObjectId; // Changed type
  token: string;
  entryTrade?: mongoose.Types.ObjectId; // Changed type
  exitTrade?: mongoose.Types.ObjectId; // Changed type
  state?: "entry" | "hold" | "exit" | "completed";
  entryPrice: number; // Changed from optional to required
  exitPrice?: number;
  pnl?: number;
  pnlPercentage?: number;
  guidance?: string;
  partialExits?: PartialExitDocument[]; // Added partialExits property
  createdAt?: Date;
  updatedAt?: Date;
}
export interface PortfolioDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId; // Explicit _id
  userId: mongoose.Types.ObjectId; // Changed type
  totalValue: number; // Changed from optional due to schema default
  freeCapital?: number;
  allocatedCapital?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  holdings?: {
    token: string; // Changed from optional
    amount: number; // Changed from optional
    averagePrice?: number;
    currentPrice?: number;
    value?: number;
    pnl?: number;
    pnlPercentage?: number;
  }[];
  updatedAt?: Date;
}
export interface NotificationDocument extends mongoose.Document {
  _id: mongoose.Types.ObjectId; // Explicit _id
  userId: mongoose.Types.ObjectId; // Changed type
  type: "signal" | "trade" | "cycle" | "system";
  message: string;
  read?: boolean;
  relatedId?: mongoose.Types.ObjectId; // Changed type
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
  SystemLog: SystemLog      // Already robustly defined in its own file
};