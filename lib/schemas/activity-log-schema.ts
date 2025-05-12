// lib/schemas/activity-log-schema.ts
import mongoose from "mongoose"

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
})

// Create the ActivityLog model
const ActivityLog = mongoose.models.ActivityLog || mongoose.model("ActivityLog", activityLogSchema)

// Export as default
export default ActivityLog