// lib/schemas/system-log-schema.ts
import mongoose from "mongoose";

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
export const SystemLog = mongoose.models.SystemLog || mongoose.model("SystemLog", systemLogSchema);

// Export the schema type for TypeScript
export type SystemLogDocument = mongoose.Document & {
  type: "cron" | "api" | "error" | "auth" | "system";
  action: string;
  timestamp: Date;
  details?: any;
  success: boolean;
  duration?: number;
  error?: string;
};