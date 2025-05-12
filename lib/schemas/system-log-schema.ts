// lib/schemas/system-log-schema.ts
import mongoose, { Model, Document } from "mongoose";

/**
 * System Log Schema for tracking background processes and events
 * Used for monitoring signal syncs, cron jobs, and system-level events
 */
const systemLogSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ["cron", "api", "error", "auth", "system"], 
    required: true 
  },
  action: { 
    type: String, 
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now, 
    required: true 
  },
  details: { 
    type: mongoose.Schema.Types.Mixed 
  },
  success: { 
    type: Boolean, 
    default: true 
  },
  duration: { 
    type: Number // Duration in milliseconds
  },
  error: { 
    type: String // Error message if applicable
  }
});

// Create an index on timestamp for faster querying of recent logs
systemLogSchema.index({ timestamp: -1 });
// Create compound index on type and action for filtering
systemLogSchema.index({ type: 1, action: 1 });

// Create and export model if it doesn't already exist
// export const SystemLog = mongoose.models.SystemLog || mongoose.model("SystemLog", systemLogSchema);

let SystemLog: Model<SystemLogDocument>;

// Robustly define the SystemLog model
if (mongoose && typeof mongoose.models === 'object' && mongoose.models !== null) {
  SystemLog = mongoose.models.SystemLog || mongoose.model<SystemLogDocument>("SystemLog", systemLogSchema);
} else {
  console.warn(
    "mongoose.models is not an object or mongoose is not fully initialized when defining SystemLog model. mongoose object:", 
    mongoose, 
    "mongoose.models:", 
    mongoose ? mongoose.models : "mongoose is undefined"
  );
  // Fallback: attempt to define the model directly.
  try {
    SystemLog = mongoose.model<SystemLogDocument>("SystemLog", systemLogSchema);
  } catch (e: any) {
    console.error("Fallback mongoose.model(\"SystemLog\", ...) failed:", e);
    throw new Error(`Critical error: Unable to define SystemLog model due to problematic Mongoose state. Original error: ${e.message}`);
  }
}

// Ensure the model is defined
if (!SystemLog) {
  throw new Error("SystemLog model could not be defined. Check Mongoose setup and previous console warnings/errors.");
}

export { SystemLog };

// Export the schema type for TypeScript
export type SystemLogDocument = Document & {
  type: "cron" | "api" | "error" | "auth" | "system";
  action: string;
  timestamp: Date;
  details?: any;
  success: boolean;
  duration?: number;
  error?: string;
};