# Cycle Trader - Telegram Mini App

![Cycle Trader Logo](public/images/logo.png)

## 📱 Project Overview

Cycle Trader is a full-stack, production-ready Telegram Mini App that enables cryptocurrency trading with real-time signals, portfolio management, and performance tracking. Built with Next.js (TypeScript) and MongoDB, it integrates with cryptocurrency exchanges (Binance and BTCC) to provide a seamless trading experience directly within Telegram.

### Key Features

- 🔐 Telegram Web App authentication
- 📊 Real-time BUY/SELL signal system
- 💰 Portfolio and capital management
- 📈 Cycle tracking with visual indicators
- 💹 PnL (Profit and Loss) tracking
- 🏆 Leaderboard with performance metrics
- 👑 Admin panel for signal management
- 📱 Mobile-first, responsive design
- 🔄 WebSocket real-time updates
- 🧮 Multiple buy accumulation for position building
- 🤖 Telegram Bot integration

### Architecture Overview

![Architecture Diagram](public/images/architecture.png)

Cycle Trader follows a modern, scalable architecture:

- **Frontend**: Next.js App Router with React Server Components
- **Backend**: Next.js API Routes with MongoDB
- **Real-time**: Socket.io for WebSockets
- **Authentication**: JWT-based with Telegram verification
- **Data Storage**: MongoDB for persistence
- **Deployment**: Vercel for hosting
- **Integration**: Telegram Bot API and Mini App

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- MongoDB instance
- Telegram Bot (created via BotFather)
- Binance and/or BTCC API credentials (for testing)

### Environment Variables

Create a `.env.local` file with the following variables:

\`\`\`
# Application
NODE_ENV=development
JWT_SECRET=your-jwt-secret-key
API_SECRET_KEY=your-api-encryption-key

# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/cycle-trader

# Telegram
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
MINI_APP_URL=https://your-app-url.vercel.app
WEBHOOK_URL=https://your-app-url.vercel.app/api/telegram-webhook

# Exchange API (for testing)
BINANCE_API_KEY=your-binance-api-key
BINANCE_API_SECRET=your-binance-api-secret
BTCC_API_KEY=your-btcc-api-key
BTCC_API_SECRET=your-btcc-api-secret

# External PnL Service (optional)
EXTERNAL_PNL_API_URL=https://your-pnl-service-url.com
EXTERNAL_PNL_API_KEY=your-pnl-service-api-key
\`\`\`

### Installation

1. Clone the repository:
   \`\`\`bash
   git clone https://github.com/yourusername/cycle-trader.git
   cd cycle-trader
   \`\`\`

2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Run the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

4. Start the Telegram Bot (development mode):
   \`\`\`bash
   npm run bot:dev
   \`\`\`

## 🌐 Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy the application

### Telegram Mini App Setup

1. Create a bot with [@BotFather](https://t.me/BotFather)
2. Use the `/newapp` command to create a Mini App
3. Set the URL to your deployed Vercel application
4. Configure the bot commands:
   \`\`\`
   start - Start the bot
   trade - Open trading interface
   connect - Connect exchange
   settings - Adjust settings
   help - Show help information
   \`\`\`

### Webhook Setup (Production)

For production, set up a webhook for your Telegram Bot:

\`\`\`bash
curl -F "url=https://your-app-url.vercel.app/api/telegram-webhook" https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
\`\`\`

## 📚 API Documentation

### Authentication

- `POST /api/auth/telegram` - Authenticate with Telegram
  - Request: `{ initData: string }`
  - Response: Sets session cookie

### User

- `GET /api/user` - Get current user
- `POST /api/user/risk` - Update risk settings
  - Request: `{ riskLevel: "low" | "medium" | "high" }`

### Exchange

- `POST /api/exchange/connect` - Connect exchange
  - Request: `{ exchange: "binance" | "btcc", apiKey: string, apiSecret: string }`
- `POST /api/exchange/update` - Update exchange settings
- `POST /api/exchange/test` - Test exchange connection

### Signals

- `GET /api/signals/active` - Get active signals
- `POST /api/signals/:id/:action` - Take action on signal (accept/skip)
- `POST /api/signals/auto-execute` - Auto-execute expired signals

### Portfolio

- `GET /api/portfolio` - Get portfolio data
- `GET /api/portfolio/summary` - Get portfolio summary

### Cycles

- `GET /api/cycles/active` - Get active trading cycles

### Positions

- `GET /api/positions/active` - Get active positions

### Leaderboard

- `GET /api/leaderboard` - Get leaderboard data
- `GET /api/users/:id/trades` - Get user trades

### Admin

- `GET /api/admin/check` - Check admin status
- `GET /api/admin/users` - Get all users
- `GET /api/admin/trades` - Get all trades
- `GET /api/admin/signals` - Get all signals
- `POST /api/admin/signals` - Create new signal

### WebSocket

- `GET /api/socket` - Initialize WebSocket connection

## 🔍 Features Explanation

### Telegram Authentication

Cycle Trader uses Telegram's Mini App authentication to securely identify users. The authentication flow:

1. User opens the Mini App from Telegram
2. Telegram provides authentication data
3. The app verifies this data on the server
4. A JWT token is issued for subsequent requests

### Real-time Signal System

The signal system provides BUY/SELL recommendations:

![Signal System](public/images/signals.png)

- Signals are categorized by risk level (low, medium, high)
- Users can accept or skip signals
- Signals auto-execute after a timeout if not acted upon
- WebSockets deliver signals in real-time

### Multiple Buy Accumulation

Users can build positions incrementally:

![Position Accumulation](public/images/position.png)

- Click "Buy 10%" multiple times to accumulate a larger position
- Position tracker shows total percentage of portfolio invested
- Average entry price is calculated across multiple buys
- Visual indicators show accumulation progress

### Cycle Tracking

Trading cycles represent the complete lifecycle of a position:

![Cycle Tracking](public/images/cycles.png)

- Entry phase: Initial position establishment
- Hold phase: Monitoring and waiting for exit conditions
- Exit phase: Position liquidation
- Visual indicators show cycle state and progress

### PnL Tracking

Comprehensive profit and loss tracking:

- Realized PnL: Completed trades
- Unrealized PnL: Current positions
- Percentage-based performance metrics
- External PnL service integration (optional)

### Leaderboard

Competitive performance tracking:

![Leaderboard](public/images/leaderboard.png)

- Win/Loss ratio
- Gain/Loss percentage
- Ranking system
- Trade history view

### Admin Panel

Administrative interface for signal management:

![Admin Panel](public/images/admin.png)

- Create and manage signals
- Monitor user activity
- View trade history
- System performance metrics

### WebSocket Implementation

Real-time updates using Socket.io:

- User-specific rooms for targeted updates
- Reconnection handling
- Event-based architecture
- Zustand store for state management

### Exchange Integration

Secure integration with cryptocurrency exchanges:

- API key encryption
- Balance and portfolio fetching
- Trade execution
- Error handling and fallbacks

### Telegram Bot

Entry point for the Mini App:

- Command-based interaction
- Deep linking to specific app sections
- Webhook support for production
- Secure authentication

## 🔒 Security Considerations

### API Key Protection

- API keys are encrypted at rest using AES-256-CBC
- Separate encryption key for API credentials
- Keys are never exposed to the client

### Authentication

- JWT tokens with short expiration
- Telegram hash verification
- HTTPS-only communication
- Secure, HTTP-only cookies

### Input Validation

- Server-side validation for all inputs
- Rate limiting on sensitive endpoints
- Input sanitization to prevent injection attacks

### Error Handling

- Generic error messages to users
- Detailed logging for debugging
- Graceful failure modes

## 🛠️ Troubleshooting

### Common Issues

#### Authentication Failures

- Ensure Telegram Mini App is opened from Telegram
- Check that JWT_SECRET is properly set
- Verify that cookies are enabled in the browser

#### Exchange Connection Issues

- Confirm API keys have correct permissions
- Check for IP restrictions on exchange API
- Verify network connectivity to exchange APIs

#### WebSocket Disconnections

- Check for network stability
- Ensure server is not overloaded
- Verify proper event handling

#### MongoDB Connection Issues

- Check MONGODB_URI is correct
- Ensure IP whitelist includes your server
- Verify database user permissions

### Debugging

- Enable detailed logging with `DEBUG=cycle-trader:*`
- Check browser console for client-side errors
- Review server logs for API issues

## 🔄 Maintenance

### Regular Tasks

- Monitor WebSocket connections
- Check exchange API status
- Review error logs
- Update dependencies
- Backup MongoDB data

### Performance Monitoring

- Track API response times
- Monitor WebSocket connection count
- Check MongoDB query performance
- Review client-side rendering performance

## 🚀 Future Enhancements

### Planned Features

1. **Advanced Trading Strategies**
   - Algorithmic trading options
   - Custom strategy builder
   - Backtesting framework

2. **Enhanced Analytics**
   - Advanced performance metrics
   - Visual trade analysis
   - Market correlation insights

3. **Social Trading**
   - Copy trading functionality
   - Social sharing of performance
   - Community discussion features

4. **Multi-Exchange Support**
   - Additional exchange integrations
   - Cross-exchange arbitrage
   - Unified portfolio view

5. **AI-Powered Recommendations**
   - Machine learning signal generation
   - Risk assessment
   - Market sentiment analysis

6. **Mobile App**
   - Native mobile applications
   - Push notifications
   - Biometric authentication

## 📋 Project Health Checklist

### Security

- [x] API key encryption
- [x] JWT authentication
- [x] Input validation
- [x] Rate limiting
- [x] HTTPS enforcement
- [x] Secure cookies
- [x] Error handling

### Performance

- [x] Optimized database queries
- [x] Client-side caching
- [x] Efficient WebSocket usage
- [x] Lazy loading of components
- [x] Image optimization
- [x] Bundle size optimization

### Scalability

- [x] Stateless authentication
- [x] Horizontal scaling support
- [x] Database indexing
- [x] Caching strategy
- [x] Asynchronous processing

### Maintenance

- [x] Comprehensive documentation
- [x] Type safety with TypeScript
- [x] Automated testing
- [x] Error logging
- [x] Dependency management

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👥 Contributors

- [Your Name](https://github.com/yourusername)

## 🙏 Acknowledgements

- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
- [Next.js](https://nextjs.org/)
- [MongoDB](https://www.mongodb.com/)
- [Socket.io](https://socket.io/)
- [shadcn/ui](https://ui.shadcn.com/)
