// lib/schemas/activity-log-schema.ts
import mongoose, { Model } from "mongoose";

// Schema for activity log entries
const activityLogSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now,
    required: true
  },
  action: { 
    type: String, 
    required: true,
    enum: [
      "BUY_ATTEMPT",
      "BUY_SUCCESS",
      "BUY_FAILURE",
      "SELL_ATTEMPT",
      "SELL_SUCCESS",
      "SELL_FAILURE",
      "AUTO_BUY_ATTEMPT",
      "AUTO_BUY_SUCCESS",
      "AUTO_BUY_FAILURE",
      "AUTO_SELL_ATTEMPT",
      "AUTO_SELL_SUCCESS",
      "AUTO_SELL_FAILURE",
      "SIGNAL_RECEIVED",
      "SIGNAL_EXPIRED",
      "SIGNAL_SKIPPED",
      "ERROR"
    ]
  },
  token: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    required: true,
    enum: ["success", "failure", "pending"]
  },
  details: { 
    type: String 
  },
  price: { 
    type: Number 
  },
  amount: { 
    type: Number 
  },
  errorMessage: { 
    type: String 
  },
  signalId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Signal" 
  },
  tradeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Trade" 
  },
  updatedAt: { 
    type: Date,
    default: Date.now
  }
});

let ActivityLog: Model<any>;

// Robustly define the ActivityLog model
if (mongoose && typeof mongoose.models === 'object' && mongoose.models !== null) {
  ActivityLog = mongoose.models.ActivityLog || mongoose.model("ActivityLog", activityLogSchema);
} else {
  console.warn(
    "mongoose.models is not an object or mongoose is not fully initialized when defining ActivityLog model. mongoose object:", 
    mongoose, 
    "mongoose.models:", 
    mongoose ? mongoose.models : "mongoose is undefined"
  );
  // Fallback: attempt to define the model directly.
  // This might throw an OverwriteModelError if the model gets registered by another means later,
  // or fail if 'mongoose.model' itself is not functional (e.g., if 'mongoose' is not the real Mongoose object).
  try {
    ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
  } catch (e: any) {
    console.error("Fallback mongoose.model(\"ActivityLog\", ...) failed:", e);
    // Propagate a more informative error if the fallback fails.
    throw new Error(`Critical error: Unable to define ActivityLog model due to problematic Mongoose state. Original error: ${e.message}`);
  }
}

// Ensure the model is defined
if (!ActivityLog) {
  // This case should ideally not be reached if the above logic is sound.
  // It indicates a failure in both the primary and fallback model definition attempts.
  throw new Error("ActivityLog model could not be defined. Check Mongoose setup and previous console warnings/errors.");
}

// Export as default
export default ActivityLog;