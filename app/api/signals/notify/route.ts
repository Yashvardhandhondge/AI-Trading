// app/api/signals/notify/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase, models } from "@/lib/db";
import { enhancedNotificationService } from "@/lib/enhanced-notification-service";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const { signalId } = await request.json();
    
    if (!signalId) {
      return NextResponse.json({ error: "Signal ID is required" }, { status: 400 });
    }
    
    // Connect to database
    await connectToDatabase();
    
    // Get signal details
    const signal = await models.Signal.findById(signalId);
    
    if (!signal) {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }
    
    // Find users who should receive this signal
    const eligibleUsers = await findEligibleUsers(signal);
    
    logger.info(
      `Found ${eligibleUsers.length} eligible users for ${signal.type} signal on ${signal.token}`,
      { context: "SignalNotifier", data: { signal: `${signal.type}_${signal.token}` } }
    );
    
    // Send notifications to eligible users
    let successCount = 0;
    
    for (const user of eligibleUsers) {
      try {
        // Check if the user has already received a notification for this signal
        const existingNotification = await models.Notification.findOne({
          userId: user._id,
          relatedId: signal._id,
          type: "signal"
        });
        
        if (existingNotification) {
          logger.debug(`User ${user._id} already notified about signal ${signal._id}`, { 
            context: "SignalNotifier" 
          });
          continue;
        }
        
        // Create notification message with precise expiration time
        const expirationTime = new Date(signal.expiresAt);
        const minutes = Math.floor((expirationTime.getTime() - Date.now()) / 60000);
        
        const message = `New ${signal.type} signal for ${signal.token} at $${signal.price}. Auto-executes in ${minutes} minutes.`;
        
        // Send notification with high priority for signal notifications
        const success = await enhancedNotificationService.sendNotification({
          userId: user._id,
          type: "signal",
          message,
          relatedId: signal._id,
          priority: "high",
          data: {
            signalId: signal._id,
            signalType: signal.type,
            token: signal.token,
            price: signal.price,
            expiresAt: signal.expiresAt
          }
        });
        
        if (success) {
          successCount++;
          
          // Update user's last signal tokens for this signal type if it's a BUY
          if (signal.type === "BUY") {
            // Add to last signal tokens only if not already there
            const hasRecentSignal = user.lastSignalTokens.some(
              (item: any) =>
                item.token === signal.token &&
                new Date().getTime() - new Date(item.timestamp).getTime() < 24 * 60 * 60 * 1000
            );
            
            if (!hasRecentSignal) {
              user.lastSignalTokens.push({
                token: signal.token,
                timestamp: new Date()
              });
              await user.save();
            }
          }
        }
      } catch (userError) {
        logger.error(`Error sending notification to user ${user._id}: ${userError instanceof Error ? userError.message : "Unknown error"}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      notified: successCount,
      totalEligible: eligibleUsers.length
    });
  } catch (error) {
    logger.error(`Signal notification error: ${error instanceof Error ? error.message : "Unknown error"}`);
    return NextResponse.json({ error: "Failed to notify users" }, { status: 500 });
  }
}

/**
 * Find users eligible to receive a notification for this signal
 */
async function findEligibleUsers(signal: any): Promise<any[]> {
  try {
    // For BUY signals: filter by risk level
    if (signal.type === "BUY") {
      // Find users with matching risk level
      return await models.User.find({
        riskLevel: signal.riskLevel
      });
    } 
    // For SELL signals: only notify users who own this token
    else if (signal.type === "SELL") {
      // First, find users with connected exchanges
      const usersWithExchange = await models.User.find({ 
        exchangeConnected: true 
      });
      
      const eligibleUsers = [];
      
      // Then check each user's portfolio to see if they own the token
      for (const user of usersWithExchange) {
        const portfolio = await models.Portfolio.findOne({ userId: user._id });
        
        if (portfolio && portfolio.holdings) {
          const hasToken = portfolio.holdings.some((h: any) => 
            h.token === signal.token && h.amount > 0
          );
          
          if (hasToken) {
            eligibleUsers.push(user);
          }
        }
      }
      
      return eligibleUsers;
    }
    
    // Default case
    return [];
  } catch (error) {
    logger.error(`Error finding eligible users: ${error instanceof Error ? error.message : "Unknown error"}`);
    return [];
  }
}