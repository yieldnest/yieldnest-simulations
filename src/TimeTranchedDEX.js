const _ = require('lodash');

/**
 * Time-Tranched DEX (Decentralized Exchange)
 * 
 * A specialized DEX for trading time-tranched tokens (Wn-T) on a secondary market.
 * Enables users to buy and sell time-tranched tokens before their redemption date.
 */
class TimeTranchedDEX {
    constructor(timeTranchedSystem) {
        this.timeTranchedSystem = timeTranchedSystem;
        
        // Order book for each token type
        this.orderBooks = {
            1: { bids: [], asks: [] },
            2: { bids: [], asks: [] },
            3: { bids: [], asks: [] },
            4: { bids: [], asks: [] }
        };
        
        // Trade history
        this.tradeHistory = [];
        
        // Market makers for liquidity
        this.marketMakers = new Map();
        
        // Trading fees (0.1%)
        this.tradingFee = 0.001;
    }

    /**
     * Place a buy order (bid)
     * @param {string} userId - User identifier
     * @param {number} tokenType - Token type (1-4)
     * @param {number} amount - Amount of tokens to buy
     * @param {number} maxPrice - Maximum price willing to pay per token
     * @returns {Object} - Order result
     */
    placeBuyOrder(userId, tokenType, amount, maxPrice) {
        if (amount <= 0 || maxPrice <= 0) {
            throw new Error('Amount and price must be positive');
        }

        if (tokenType < 1 || tokenType > 4) {
            throw new Error('Invalid token type. Must be 1-4');
        }

        const order = {
            id: this.generateOrderId(),
            userId,
            tokenType,
            amount,
            maxPrice,
            type: 'bid',
            timestamp: Date.now(),
            filled: 0,
            status: 'active'
        };

        this.orderBooks[tokenType].bids.push(order);
        this.orderBooks[tokenType].bids.sort((a, b) => b.maxPrice - a.maxPrice); // Highest bid first

        // Try to match with existing asks
        this.matchOrders(tokenType);

        return {
            success: true,
            orderId: order.id,
            order: order
        };
    }

    /**
     * Place a sell order (ask)
     * @param {string} userId - User identifier
     * @param {number} tokenType - Token type (1-4)
     * @param {number} amount - Amount of tokens to sell
     * @param {number} minPrice - Minimum price willing to accept per token
     * @returns {Object} - Order result
     */
    placeSellOrder(userId, tokenType, amount, minPrice) {
        if (amount <= 0 || minPrice <= 0) {
            throw new Error('Amount and price must be positive');
        }

        if (tokenType < 1 || tokenType > 4) {
            throw new Error('Invalid token type. Must be 1-4');
        }

        // Check if user has enough tokens to sell
        const userTokens = this.timeTranchedSystem.getTimeTranchedBalance(userId, tokenType);
        if (userTokens < amount) {
            throw new Error(`Insufficient W${tokenType}-T tokens. Available: ${userTokens}, Requested: ${amount}`);
        }

        const order = {
            id: this.generateOrderId(),
            userId,
            tokenType,
            amount,
            minPrice,
            type: 'ask',
            timestamp: Date.now(),
            filled: 0,
            status: 'active'
        };

        this.orderBooks[tokenType].asks.push(order);
        this.orderBooks[tokenType].asks.sort((a, b) => a.minPrice - b.minPrice); // Lowest ask first

        // Try to match with existing bids
        this.matchOrders(tokenType);

        return {
            success: true,
            orderId: order.id,
            order: order
        };
    }

    /**
     * Match orders for a specific token type
     * @param {number} tokenType - Token type (1-4)
     */
    matchOrders(tokenType) {
        const orderBook = this.orderBooks[tokenType];
        
        while (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
            const bestBid = orderBook.bids[0];
            const bestAsk = orderBook.asks[0];

            // Check if orders can be matched
            if (bestBid.maxPrice >= bestAsk.minPrice) {
                const tradeAmount = Math.min(
                    bestBid.amount - bestBid.filled,
                    bestAsk.amount - bestAsk.filled
                );

                if (tradeAmount > 0) {
                    // Execute trade at ask price (price-time priority)
                    const tradePrice = bestAsk.minPrice;
                    
                    this.executeTrade(bestBid, bestAsk, tradeAmount, tradePrice);
                    
                    // Update order fills
                    bestBid.filled += tradeAmount;
                    bestAsk.filled += tradeAmount;

                    // Remove filled orders
                    if (bestBid.filled >= bestBid.amount) {
                        bestBid.status = 'filled';
                        orderBook.bids.shift();
                    }
                    if (bestAsk.filled >= bestAsk.amount) {
                        bestAsk.status = 'filled';
                        orderBook.asks.shift();
                    }
                } else {
                    break;
                }
            } else {
                break; // No more matches possible
            }
        }
    }

    /**
     * Execute a trade between two orders
     * @param {Object} bidOrder - Buy order
     * @param {Object} askOrder - Sell order
     * @param {number} amount - Trade amount
     * @param {number} price - Trade price
     */
    executeTrade(bidOrder, askOrder, amount, price) {
        const buyer = bidOrder.userId;
        const seller = askOrder.userId;
        const tokenType = bidOrder.tokenType;

        // Calculate fees
        const buyerFee = amount * price * this.tradingFee;
        const sellerFee = amount * price * this.tradingFee;
        const totalCost = amount * price + buyerFee;

        // Transfer tokens
        this.timeTranchedSystem.updateTimeTranchedBalance(seller, tokenType, -amount);
        this.timeTranchedSystem.updateTimeTranchedBalance(buyer, tokenType, amount);

        // Transfer payment
        this.timeTranchedSystem.updateUserBalance(buyer, -totalCost);
        this.timeTranchedSystem.updateUserBalance(seller, amount * price - sellerFee);

        // Record trade
        const trade = {
            id: this.generateTradeId(),
            buyer,
            seller,
            tokenType,
            amount,
            price,
            buyerFee,
            sellerFee,
            timestamp: Date.now()
        };

        this.tradeHistory.push(trade);

        console.log(`Trade executed: ${amount} W${tokenType}-T tokens at ${price} T each`);
    }

    /**
     * Cancel an order
     * @param {string} userId - User identifier
     * @param {string} orderId - Order ID to cancel
     * @returns {Object} - Cancellation result
     */
    cancelOrder(userId, orderId) {
        for (const tokenType in this.orderBooks) {
            const orderBook = this.orderBooks[tokenType];
            
            // Check bids
            const bidIndex = orderBook.bids.findIndex(order => 
                order.id === orderId && order.userId === userId
            );
            if (bidIndex !== -1) {
                const order = orderBook.bids[bidIndex];
                order.status = 'cancelled';
                orderBook.bids.splice(bidIndex, 1);
                return { success: true, orderId, status: 'cancelled' };
            }

            // Check asks
            const askIndex = orderBook.asks.findIndex(order => 
                order.id === orderId && order.userId === userId
            );
            if (askIndex !== -1) {
                const order = orderBook.asks[askIndex];
                order.status = 'cancelled';
                orderBook.asks.splice(askIndex, 1);
                return { success: true, orderId, status: 'cancelled' };
            }
        }

        throw new Error('Order not found or not owned by user');
    }

    /**
     * Get order book for a token type
     * @param {number} tokenType - Token type (1-4)
     * @returns {Object} - Order book
     */
    getOrderBook(tokenType) {
        if (tokenType < 1 || tokenType > 4) {
            throw new Error('Invalid token type. Must be 1-4');
        }

        return {
            tokenType,
            bids: this.orderBooks[tokenType].bids.filter(order => order.status === 'active'),
            asks: this.orderBooks[tokenType].asks.filter(order => order.status === 'active')
        };
    }

    /**
     * Get market price for a token type (mid-price)
     * @param {number} tokenType - Token type (1-4)
     * @returns {Object} - Market price information
     */
    getMarketPrice(tokenType) {
        const orderBook = this.getOrderBook(tokenType);
        const bestBid = orderBook.bids[0];
        const bestAsk = orderBook.asks[0];

        let midPrice = null;
        let spread = null;

        if (bestBid && bestAsk) {
            midPrice = (bestBid.maxPrice + bestAsk.minPrice) / 2;
            spread = bestAsk.minPrice - bestBid.maxPrice;
        } else if (bestBid) {
            midPrice = bestBid.maxPrice;
        } else if (bestAsk) {
            midPrice = bestAsk.minPrice;
        }

        // Fallback to theoretical price based on discount curve
        if (!midPrice) {
            midPrice = this.timeTranchedSystem.getCurrentDiscountValue(tokenType);
        }

        return {
            tokenType,
            midPrice,
            bestBid: bestBid ? bestBid.maxPrice : null,
            bestAsk: bestAsk ? bestAsk.minPrice : null,
            spread,
            theoreticalPrice: this.timeTranchedSystem.getCurrentDiscountValue(tokenType)
        };
    }

    /**
     * Get recent trades for a token type
     * @param {number} tokenType - Token type (1-4)
     * @param {number} limit - Number of trades to return
     * @returns {Array} - Recent trades
     */
    getRecentTrades(tokenType, limit = 50) {
        return this.tradeHistory
            .filter(trade => trade.tokenType === tokenType)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    /**
     * Add a market maker for liquidity
     * @param {string} marketMakerId - Market maker identifier
     * @param {Object} config - Market maker configuration
     */
    addMarketMaker(marketMakerId, config) {
        this.marketMakers.set(marketMakerId, {
            id: marketMakerId,
            config,
            active: true
        });
    }

    /**
     * Remove a market maker
     * @param {string} marketMakerId - Market maker identifier
     */
    removeMarketMaker(marketMakerId) {
        this.marketMakers.delete(marketMakerId);
    }

    /**
     * Generate a unique order ID
     * @returns {string} - Order ID
     */
    generateOrderId() {
        return `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate a unique trade ID
     * @returns {string} - Trade ID
     */
    generateTradeId() {
        return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get DEX statistics
     * @returns {Object} - DEX statistics
     */
    getDEXStats() {
        const stats = {
            totalTrades: this.tradeHistory.length,
            totalVolume: 0,
            totalFees: 0,
            activeOrders: 0,
            tokenTypeStats: {}
        };

        // Calculate volume and fees
        for (const trade of this.tradeHistory) {
            stats.totalVolume += trade.amount * trade.price;
            stats.totalFees += trade.buyerFee + trade.sellerFee;
        }

        // Count active orders
        for (const tokenType in this.orderBooks) {
            const orderBook = this.orderBooks[tokenType];
            const activeBids = orderBook.bids.filter(order => order.status === 'active').length;
            const activeAsks = orderBook.asks.filter(order => order.status === 'active').length;
            
            stats.activeOrders += activeBids + activeAsks;
            
            stats.tokenTypeStats[tokenType] = {
                activeBids,
                activeAsks,
                marketPrice: this.getMarketPrice(parseInt(tokenType))
            };
        }

        return stats;
    }

    /**
     * Clear all orders (for testing/reset)
     */
    clearOrders() {
        for (const tokenType in this.orderBooks) {
            this.orderBooks[tokenType].bids = [];
            this.orderBooks[tokenType].asks = [];
        }
    }
}

module.exports = TimeTranchedDEX; 