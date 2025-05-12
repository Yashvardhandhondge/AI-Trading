// lib/activity-log-service.ts
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"

interface LogActivityParams {
  userId: string | any;
  action: string;
  token: string;
  status: "success" | "failure" | "pending";
  details?: string;
  price?: number;
  amount?: number;
  errorMessage?: string;
  signalId?: string;
  tradeId?: string;
}

/**
 * Service for managing bot activity logs
 */
export class ActivityLogService {
  /**
   * Record a new activity in the log
   */
  static async recordActivity(params: LogActivityParams) {
    try {
      await connectToDatabase()
      
      // Validate status
      if (!["success", "failure", "pending"].includes(params.status)) {
        throw new Error(`Invalid status: ${params.status}. Must be 'success', 'failure', or 'pending'`)
      }
      
      // Create new log entry
      const newLog = await models.ActivityLog.create({
        userId: params.userId,
        timestamp: new Date(),
        action: params.action,
        token: params.token,
        status: params.status,
        details: params.details || "",
        price: params.price,
        amount: params.amount,
        errorMessage: params.errorMessage,
        signalId: params.signalId,
        tradeId: params.tradeId
      })
      
      logger.info(`Recorded activity log: ${params.action} ${params.token} (${params.status})`, {
        context: "ActivityLog",
        userId: params.userId
      })
      
      return newLog
    } catch (error) {
      logger.error(`Error recording activity log: ${error instanceof Error ? error.message : "Unknown error"}`)
      throw error
    }
  }
  
  /**
   * Update an existing activity log entry
   */
  static async updateActivity(id: string, updates: Partial<LogActivityParams>) {
    try {
      await connectToDatabase()
      
      const updatedLog = await models.ActivityLog.findByIdAndUpdate(
        id,
        { ...updates, updatedAt: new Date() },
        { new: true } // Return the updated document
      )
      
      if (!updatedLog) {
        throw new Error(`Activity log with ID ${id} not found`)
      }
      
      logger.info(`Updated activity log: ${id}`, {
        context: "ActivityLog",
        updates
      })
      
      return updatedLog
    } catch (error) {
      logger.error(`Error updating activity log: ${error instanceof Error ? error.message : "Unknown error"}`)
      throw error
    }
  }
  
  /**
   * Mark a pending activity as completed with success or failure
   */
  static async completeActivity(id: string, successful: boolean, errorMessage?: string) {
    try {
      await connectToDatabase()
      
      const updates = {
        status: successful ? "success" : "failure",
        errorMessage: successful ? undefined : (errorMessage || "Unknown error")
      }
      
      const completedLog = await models.ActivityLog.findByIdAndUpdate(
        id,
        { ...updates, updatedAt: new Date() },
        { new: true }
      )
      
      if (!completedLog) {
        throw new Error(`Activity log with ID ${id} not found`)
      }
      
      logger.info(`Completed activity log: ${id} (${updates.status})`, {
        context: "ActivityLog"
      })
      
      return completedLog
    } catch (error) {
      logger.error(`Error completing activity log: ${error instanceof Error ? error.message : "Unknown error"}`)
      throw error
    }
  }
  
  /**
   * Get recent activities for a user
   */
  static async getUserActivities(userId: string | any, limit = 20, offset = 0) {
    try {
      await connectToDatabase()
      
      const activities = await models.ActivityLog.find({ userId })
        .sort({ timestamp: -1 }) // Most recent first
        .skip(offset)
        .limit(limit)
      
      return activities
    } catch (error) {
      logger.error(`Error fetching user activities: ${error instanceof Error ? error.message : "Unknown error"}`)
      throw error
    }
  }
}

// Export the activity log service
export default ActivityLogService