const _ = require('lodash');

/**
 * Base Agent Class
 * 
 * Abstract base class for all simulation agents
 */
class BaseAgent {
    constructor(id, initialBalance, timeTranchedSystem, dex) {
        this.id = id;
        this.initialBalance = initialBalance;
        this.timeTranchedSystem = timeTranchedSystem;
        this.dex = dex;
        this.strategy = 'base';
        this.tradeHistory = [];
        this.profitLoss = 0;
        
        // Initialize balance
        this.timeTranchedSystem.updateUserBalance(this.id, initialBalance);
    }

    /**
     * Get current portfolio value
     * @returns {Object} - Portfolio breakdown
     */
    getPortfolioValue() {
        const tokenBalance = this.timeTranchedSystem.getUserBalance(this.id);
        const timeTranchedBalances = this.timeTranchedSystem.getAllTimeTranchedBalances(this.id);
        
        let totalTimeTranchedValue = 0;
        const tokenValues = {};
        
        for (let tokenType = 1; tokenType <= 4; tokenType++) {
            const amount = timeTranchedBalances[tokenType] || 0;
            const currentValue = this.timeTranchedSystem.getCurrentDiscountValue(tokenType);
            const value = amount * currentValue;
            
            tokenValues[tokenType] = {
                amount,
                currentValue,
                totalValue: value
            };
            
            totalTimeTranchedValue += value;
        }
        
        return {
            tokenBalance,
            timeTranchedBalances,
            timeTranchedValue: totalTimeTranchedValue,
            tokenValues,
            totalPortfolioValue: tokenBalance + totalTimeTranchedValue,
            profitLoss: (tokenBalance + totalTimeTranchedValue) - this.initialBalance
        };
    }

    /**
     * Record a trade
     * @param {Object} trade - Trade details
     */
    recordTrade(trade) {
        this.tradeHistory.push({
            ...trade,
            timestamp: Date.now(),
            portfolioValue: this.getPortfolioValue().totalPortfolioValue
        });
    }

    /**
     * Execute agent actions for the current month
     * @param {number} currentMonth - Current month (0-11)
     */
    executeActions(currentMonth) {
        // Override in subclasses
        throw new Error('executeActions must be implemented in subclasses');
    }

    /**
     * Get agent statistics
     * @returns {Object} - Agent statistics
     */
    getStats() {
        const portfolio = this.getPortfolioValue();
        return {
            id: this.id,
            strategy: this.strategy,
            initialBalance: this.initialBalance,
            currentBalance: portfolio.tokenBalance,
            timeTranchedValue: portfolio.timeTranchedValue,
            totalPortfolioValue: portfolio.totalPortfolioValue,
            profitLoss: portfolio.profitLoss,
            profitLossPercentage: (portfolio.profitLoss / this.initialBalance) * 100,
            totalTrades: this.tradeHistory.length
        };
    }
}

/**
 * Conservative Agent
 * 
 * Deposits tokens and holds until redemption
 */
class ConservativeAgent extends BaseAgent {
    constructor(id, initialBalance, timeTranchedSystem, dex) {
        super(id, initialBalance, timeTranchedSystem, dex);
        this.strategy = 'conservative';
        this.depositProbability = 0.3; // 30% chance to deposit each month
        this.maxDepositPercentage = 0.2; // Max 20% of balance per deposit
    }

    executeActions(currentMonth) {
        // Random chance to deposit
        if (Math.random() < this.depositProbability) {
            const balance = this.timeTranchedSystem.getUserBalance(this.id);
            if (balance > 0) {
                const maxDeposit = balance * this.maxDepositPercentage;
                const depositAmount = Math.random() * maxDeposit;
                
                try {
                    const result = this.timeTranchedSystem.deposit(this.id, depositAmount);
                    this.recordTrade({
                        type: 'deposit',
                        amount: depositAmount,
                        tokenType: result.tokenType,
                        discountValue: result.discountValue
                    });
                } catch (error) {
                    // Ignore errors (e.g., not in withdrawal window)
                }
            }
        }
    }
}

/**
 * Arbitrage Agent
 * 
 * Seeks profit opportunities through discount arbitrage
 */
class ArbitrageAgent extends BaseAgent {
    constructor(id, initialBalance, timeTranchedSystem, dex) {
        super(id, initialBalance, timeTranchedSystem, dex);
        this.strategy = 'arbitrage';
        this.minProfitThreshold = 0.05; // 5% minimum profit threshold
        this.maxPositionSize = 0.3; // Max 30% of portfolio in single position
    }

    executeActions(currentMonth) {
        // Check for arbitrage opportunities
        for (let tokenType = 1; tokenType <= 4; tokenType++) {
            try {
                const marketPrice = this.dex.getMarketPrice(tokenType);
                const theoreticalPrice = this.timeTranchedSystem.getCurrentDiscountValue(tokenType);
                
                // If market price is significantly below theoretical price, buy
                if (marketPrice.midPrice && 
                    marketPrice.midPrice < theoreticalPrice * (1 - this.minProfitThreshold)) {
                    
                    const balance = this.timeTranchedSystem.getUserBalance(this.id);
                    const maxAmount = balance * this.maxPositionSize;
                    const buyAmount = Math.min(maxAmount, balance * 0.5);
                    
                    if (buyAmount > 0) {
                        try {
                            const result = this.dex.placeBuyOrder(
                                this.id, 
                                tokenType, 
                                buyAmount / marketPrice.midPrice, 
                                theoreticalPrice
                            );
                            
                            this.recordTrade({
                                type: 'arbitrage_buy',
                                amount: buyAmount,
                                tokenType,
                                marketPrice: marketPrice.midPrice,
                                theoreticalPrice
                            });
                        } catch (error) {
                            // Ignore errors
                        }
                    }
                }
                
                // If market price is significantly above theoretical price, sell
                if (marketPrice.midPrice && 
                    marketPrice.midPrice > theoreticalPrice * (1 + this.minProfitThreshold)) {
                    
                    const userTokens = this.timeTranchedSystem.getTimeTranchedBalance(this.id, tokenType);
                    const sellAmount = Math.min(userTokens * this.maxPositionSize, userTokens);
                    
                    if (sellAmount > 0) {
                        try {
                            const result = this.dex.placeSellOrder(
                                this.id,
                                tokenType,
                                sellAmount,
                                theoreticalPrice
                            );
                            
                            this.recordTrade({
                                type: 'arbitrage_sell',
                                amount: sellAmount,
                                tokenType,
                                marketPrice: marketPrice.midPrice,
                                theoreticalPrice
                            });
                        } catch (error) {
                            // Ignore errors
                        }
                    }
                }
            } catch (error) {
                // Ignore errors
            }
        }
    }
}

/**
 * Liquidity Provider Agent
 * 
 * Provides liquidity to the DEX by placing orders on both sides
 */
class LiquidityProviderAgent extends BaseAgent {
    constructor(id, initialBalance, timeTranchedSystem, dex) {
        super(id, initialBalance, timeTranchedSystem, dex);
        this.strategy = 'liquidity_provider';
        this.spread = 0.02; // 2% spread
        this.orderSize = 0.1; // 10% of balance per order
        this.rebalanceProbability = 0.5; // 50% chance to rebalance each month
    }

    executeActions(currentMonth) {
        // Random chance to rebalance orders
        if (Math.random() < this.rebalanceProbability) {
            // Cancel existing orders
            // (In a real implementation, we'd track order IDs)
            
            // Place new orders for each token type
            for (let tokenType = 1; tokenType <= 4; tokenType++) {
                try {
                    const theoreticalPrice = this.timeTranchedSystem.getCurrentDiscountValue(tokenType);
                    const balance = this.timeTranchedSystem.getUserBalance(this.id);
                    const orderAmount = balance * this.orderSize;
                    
                    if (orderAmount > 0) {
                        // Place bid (buy order)
                        const bidPrice = theoreticalPrice * (1 - this.spread / 2);
                        this.dex.placeBuyOrder(this.id, tokenType, orderAmount / bidPrice, bidPrice);
                        
                        // Place ask (sell order) if we have tokens
                        const userTokens = this.timeTranchedSystem.getTimeTranchedBalance(this.id, tokenType);
                        if (userTokens > 0) {
                            const askPrice = theoreticalPrice * (1 + this.spread / 2);
                            const sellAmount = Math.min(userTokens * this.orderSize, userTokens);
                            this.dex.placeSellOrder(this.id, tokenType, sellAmount, askPrice);
                        }
                        
                        this.recordTrade({
                            type: 'liquidity_provision',
                            tokenType,
                            bidPrice,
                            askPrice: theoreticalPrice * (1 + this.spread / 2)
                        });
                    }
                } catch (error) {
                    // Ignore errors
                }
            }
        }
    }
}

/**
 * Momentum Agent
 * 
 * Follows price trends and market momentum
 */
class MomentumAgent extends BaseAgent {
    constructor(id, initialBalance, timeTranchedSystem, dex) {
        super(id, initialBalance, timeTranchedSystem, dex);
        this.strategy = 'momentum';
        this.momentumWindow = 3; // Look at last 3 months
        this.momentumThreshold = 0.02; // 2% price change threshold
        this.positionSize = 0.2; // 20% of balance per position
    }

    executeActions(currentMonth) {
        // Get recent trades to calculate momentum
        for (let tokenType = 1; tokenType <= 4; tokenType++) {
            try {
                const recentTrades = this.dex.getRecentTrades(tokenType, 10);
                
                if (recentTrades.length >= 2) {
                    const oldestPrice = recentTrades[recentTrades.length - 1].price;
                    const newestPrice = recentTrades[0].price;
                    const priceChange = (newestPrice - oldestPrice) / oldestPrice;
                    
                    const balance = this.timeTranchedSystem.getUserBalance(this.id);
                    const positionAmount = balance * this.positionSize;
                    
                    // If positive momentum, buy
                    if (priceChange > this.momentumThreshold && positionAmount > 0) {
                        const marketPrice = this.dex.getMarketPrice(tokenType);
                        if (marketPrice.midPrice) {
                            this.dex.placeBuyOrder(
                                this.id,
                                tokenType,
                                positionAmount / marketPrice.midPrice,
                                marketPrice.midPrice * 1.01 // Slight premium
                            );
                            
                            this.recordTrade({
                                type: 'momentum_buy',
                                amount: positionAmount,
                                tokenType,
                                priceChange,
                                marketPrice: marketPrice.midPrice
                            });
                        }
                    }
                    
                    // If negative momentum, sell
                    if (priceChange < -this.momentumThreshold) {
                        const userTokens = this.timeTranchedSystem.getTimeTranchedBalance(this.id, tokenType);
                        const sellAmount = Math.min(userTokens * this.positionSize, userTokens);
                        
                        if (sellAmount > 0) {
                            const marketPrice = this.dex.getMarketPrice(tokenType);
                            if (marketPrice.midPrice) {
                                this.dex.placeSellOrder(
                                    this.id,
                                    tokenType,
                                    sellAmount,
                                    marketPrice.midPrice * 0.99 // Slight discount
                                );
                                
                                this.recordTrade({
                                    type: 'momentum_sell',
                                    amount: sellAmount,
                                    tokenType,
                                    priceChange,
                                    marketPrice: marketPrice.midPrice
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                // Ignore errors
            }
        }
    }
}

/**
 * Opportunistic Agent
 * 
 * Takes advantage of early redemption and burn opportunities
 */
class OpportunisticAgent extends BaseAgent {
    constructor(id, initialBalance, timeTranchedSystem, dex) {
        super(id, initialBalance, timeTranchedSystem, dex);
        this.strategy = 'opportunistic';
        this.burnThreshold = 0.15; // 15% profit threshold for burning
        this.earlyRedemptionThreshold = 0.1; // 10% profit threshold for early redemption
    }

    executeActions(currentMonth) {
        // Check for burn opportunities
        for (let tokenType = 1; tokenType <= 4; tokenType++) {
            try {
                const userTokens = this.timeTranchedSystem.getTimeTranchedBalance(this.id, tokenType);
                if (userTokens > 0) {
                    const currentValue = this.timeTranchedSystem.getCurrentDiscountValue(tokenType);
                    const originalValue = 0.8; // Assuming tokens were bought at 0.8
                    
                    // If current value is significantly higher than original, consider burning
                    if (currentValue > originalValue * (1 + this.burnThreshold)) {
                        const burnAmount = userTokens * 0.5; // Burn half of holdings
                        
                        try {
                            const result = this.timeTranchedSystem.burn(this.id, burnAmount, tokenType);
                            this.recordTrade({
                                type: 'burn',
                                amount: burnAmount,
                                tokenType,
                                burnValue: result.burnAmount,
                                currentValue
                            });
                        } catch (error) {
                            // Ignore errors
                        }
                    }
                    
                    // Check for early redemption opportunities
                    const window = this.timeTranchedSystem.withdrawalWindows[tokenType - 1];
                    if (currentMonth >= window.redemptionMonth) {
                        // Past redemption time, redeem at face value
                        const redeemAmount = userTokens * 0.3; // Redeem 30% of holdings
                        
                        try {
                            const result = this.timeTranchedSystem.redeem(this.id, redeemAmount, tokenType);
                            this.recordTrade({
                                type: 'early_redemption',
                                amount: redeemAmount,
                                tokenType,
                                redemptionValue: result.redeemedAmount,
                                isPastRedemption: result.isPastRedemption
                            });
                        } catch (error) {
                            // Ignore errors
                        }
                    }
                }
            } catch (error) {
                // Ignore errors
            }
        }
    }
}

/**
 * Agent Factory
 * 
 * Creates different types of agents
 */
class AgentFactory {
    static createAgent(type, id, initialBalance, timeTranchedSystem, dex) {
        switch (type) {
            case 'conservative':
                return new ConservativeAgent(id, initialBalance, timeTranchedSystem, dex);
            case 'arbitrage':
                return new ArbitrageAgent(id, initialBalance, timeTranchedSystem, dex);
            case 'liquidity_provider':
                return new LiquidityProviderAgent(id, initialBalance, timeTranchedSystem, dex);
            case 'momentum':
                return new MomentumAgent(id, initialBalance, timeTranchedSystem, dex);
            case 'opportunistic':
                return new OpportunisticAgent(id, initialBalance, timeTranchedSystem, dex);
            default:
                throw new Error(`Unknown agent type: ${type}`);
        }
    }

    static getAvailableTypes() {
        return ['conservative', 'arbitrage', 'liquidity_provider', 'momentum', 'opportunistic'];
    }
}

module.exports = {
    BaseAgent,
    ConservativeAgent,
    ArbitrageAgent,
    LiquidityProviderAgent,
    MomentumAgent,
    OpportunisticAgent,
    AgentFactory
}; 