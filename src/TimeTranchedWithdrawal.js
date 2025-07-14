const _ = require('lodash');

/**
 * Time-Tranched Fungible Withdrawal System
 * 
 * This system implements a structured withdrawal mechanism using time-tranched tokens
 * for a queued withdrawal protocol. Users can only redeem capital at fixed points
 * during the year (every 3 months), but can unlock early liquidity via tradable
 * time-specific tokens.
 */
class TimeTranchedWithdrawal {
    constructor() {
        // Redemption points: months 3, 6, 9, 12
        this.redemptionPoints = [3, 6, 9, 12];
        
        // Withdrawal windows: 6-3 months before each redemption point
        this.withdrawalWindows = [
            { start: 0, end: 3, redemptionMonth: 3 },   // W1-T tokens
            { start: 3, end: 6, redemptionMonth: 6 },   // W2-T tokens
            { start: 6, end: 9, redemptionMonth: 9 },   // W3-T tokens
            { start: 9, end: 12, redemptionMonth: 12 }  // W4-T tokens
        ];
        
        // Token balances for each user
        this.userBalances = new Map();
        
        // Time-tranched token balances for each user
        this.timeTranchedBalances = new Map();
        
        // Total locked capital
        this.totalLockedCapital = 0;
        
        // Current month (0-11)
        this.currentMonth = 0;
        
        // Redemption rates at each point (can be customized)
        this.redemptionRates = {
            3: 1.0,   // 100% redemption rate at month 3
            6: 1.0,   // 100% redemption rate at month 6
            9: 1.0,   // 100% redemption rate at month 9
            12: 1.0   // 100% redemption rate at month 12
        };
    }

    /**
     * Calculate the discount curve value for a time-tranched token
     * @param {number} monthsToRedemption - Months until redemption
     * @param {number} totalWindowMonths - Total months in the withdrawal window
     * @returns {number} - Discount value (0.8 to 1.0)
     */
    calculateDiscountCurve(monthsToRedemption, totalWindowMonths = 3) {
        // Linear interpolation from 0.8 to 1.0
        const progress = (totalWindowMonths - monthsToRedemption) / totalWindowMonths;
        return 0.8 + (0.2 * progress);
    }

    /**
     * Get the current discount value for a specific token type
     * @param {number} tokenType - Token type (1-4)
     * @returns {number} - Current discount value
     */
    getCurrentDiscountValue(tokenType) {
        const window = this.withdrawalWindows[tokenType - 1];
        const monthsToRedemption = window.redemptionMonth - this.currentMonth;
        
        if (monthsToRedemption <= 0) {
            return 1.0; // At or past redemption time
        }
        
        return this.calculateDiscountCurve(monthsToRedemption);
    }

    /**
     * Deposit tokens into the withdrawal queue
     * @param {string} userId - User identifier
     * @param {number} amount - Amount of tokens to deposit
     * @param {number} tokenType - Token type (1-4) based on current month
     * @returns {Object} - Result of the deposit operation
     */
    deposit(userId, amount, tokenType = null) {
        if (amount <= 0) {
            throw new Error('Deposit amount must be positive');
        }

        // Determine token type based on current month if not specified
        if (!tokenType) {
            tokenType = this.getCurrentTokenType();
        }

        if (tokenType < 1 || tokenType > 4) {
            throw new Error('Invalid token type. Must be 1-4');
        }

        // Check if we're in the correct withdrawal window
        const window = this.withdrawalWindows[tokenType - 1];
        if (this.currentMonth < window.start || this.currentMonth >= window.end) {
            throw new Error(`Cannot mint W${tokenType}-T tokens outside of withdrawal window ${window.start}-${window.end}`);
        }

        // Calculate discount value
        const discountValue = this.getCurrentDiscountValue(tokenType);
        const timeTranchedAmount = amount / discountValue;

        // Update balances
        this.updateUserBalance(userId, -amount);
        this.updateTimeTranchedBalance(userId, tokenType, timeTranchedAmount);
        this.totalLockedCapital += amount;

        return {
            success: true,
            userId,
            depositedAmount: amount,
            timeTranchedAmount,
            tokenType,
            discountValue,
            currentMonth: this.currentMonth
        };
    }

    /**
     * Get the current token type based on the current month
     * @returns {number} - Token type (1-4)
     */
    getCurrentTokenType() {
        for (let i = 0; i < this.withdrawalWindows.length; i++) {
            const window = this.withdrawalWindows[i];
            if (this.currentMonth >= window.start && this.currentMonth < window.end) {
                return i + 1;
            }
        }
        throw new Error('Not in any withdrawal window');
    }

    /**
     * Redeem time-tranched tokens for underlying tokens
     * @param {string} userId - User identifier
     * @param {number} amount - Amount of time-tranched tokens to redeem
     * @param {number} tokenType - Token type (1-4)
     * @returns {Object} - Result of the redemption operation
     */
    redeem(userId, amount, tokenType) {
        if (amount <= 0) {
            throw new Error('Redemption amount must be positive');
        }

        if (tokenType < 1 || tokenType > 4) {
            throw new Error('Invalid token type. Must be 1-4');
        }

        // Check if user has enough tokens
        const userTokens = this.getTimeTranchedBalance(userId, tokenType);
        if (userTokens < amount) {
            throw new Error(`Insufficient W${tokenType}-T tokens. Available: ${userTokens}, Requested: ${amount}`);
        }

        const window = this.withdrawalWindows[tokenType - 1];
        let redemptionAmount;

        if (this.currentMonth >= window.redemptionMonth) {
            // Past redemption time - redeem at committed rate
            redemptionAmount = amount * this.redemptionRates[window.redemptionMonth];
        } else {
            // Before redemption time - redeem at current curve rate
            const discountValue = this.getCurrentDiscountValue(tokenType);
            redemptionAmount = amount * discountValue;
        }

        // Update balances
        this.updateTimeTranchedBalance(userId, tokenType, -amount);
        this.updateUserBalance(userId, redemptionAmount);
        this.totalLockedCapital -= redemptionAmount;

        return {
            success: true,
            userId,
            redeemedAmount: redemptionAmount,
            timeTranchedAmount: amount,
            tokenType,
            currentMonth: this.currentMonth,
            isPastRedemption: this.currentMonth >= window.redemptionMonth
        };
    }

    /**
     * Burn time-tranched tokens for underlying tokens at current curve rate
     * @param {string} userId - User identifier
     * @param {number} amount - Amount of time-tranched tokens to burn
     * @param {number} tokenType - Token type (1-4)
     * @returns {Object} - Result of the burn operation
     */
    burn(userId, amount, tokenType) {
        if (amount <= 0) {
            throw new Error('Burn amount must be positive');
        }

        if (tokenType < 1 || tokenType > 4) {
            throw new Error('Invalid token type. Must be 1-4');
        }

        const window = this.withdrawalWindows[tokenType - 1];
        
        // Can only burn before redemption time
        if (this.currentMonth >= window.redemptionMonth) {
            throw new Error(`Cannot burn W${tokenType}-T tokens after redemption time`);
        }

        // Check if user has enough tokens
        const userTokens = this.getTimeTranchedBalance(userId, tokenType);
        if (userTokens < amount) {
            throw new Error(`Insufficient W${tokenType}-T tokens. Available: ${userTokens}, Requested: ${amount}`);
        }

        // Calculate burn value at current curve rate
        const discountValue = this.getCurrentDiscountValue(tokenType);
        const burnAmount = amount * discountValue;

        // Update balances
        this.updateTimeTranchedBalance(userId, tokenType, -amount);
        this.updateUserBalance(userId, burnAmount);
        this.totalLockedCapital -= burnAmount;

        return {
            success: true,
            userId,
            burnAmount,
            timeTranchedAmount: amount,
            tokenType,
            discountValue,
            currentMonth: this.currentMonth
        };
    }

    /**
     * Advance the simulation by one month
     */
    advanceMonth() {
        this.currentMonth = (this.currentMonth + 1) % 12;
        return this.currentMonth;
    }

    /**
     * Get current month
     * @returns {number} - Current month (0-11)
     */
    getCurrentMonth() {
        return this.currentMonth;
    }

    /**
     * Get user's token balance
     * @param {string} userId - User identifier
     * @returns {number} - Token balance
     */
    getUserBalance(userId) {
        return this.userBalances.get(userId) || 0;
    }

    /**
     * Get user's time-tranched token balance
     * @param {string} userId - User identifier
     * @param {number} tokenType - Token type (1-4)
     * @returns {number} - Time-tranched token balance
     */
    getTimeTranchedBalance(userId, tokenType) {
        const userTokens = this.timeTranchedBalances.get(userId) || {};
        return userTokens[tokenType] || 0;
    }

    /**
     * Get all time-tranched balances for a user
     * @param {string} userId - User identifier
     * @returns {Object} - All time-tranched balances
     */
    getAllTimeTranchedBalances(userId) {
        return this.timeTranchedBalances.get(userId) || {};
    }

    /**
     * Update user's token balance
     * @param {string} userId - User identifier
     * @param {number} delta - Change in balance
     */
    updateUserBalance(userId, delta) {
        const currentBalance = this.getUserBalance(userId);
        this.userBalances.set(userId, currentBalance + delta);
    }

    /**
     * Update user's time-tranched token balance
     * @param {string} userId - User identifier
     * @param {number} tokenType - Token type (1-4)
     * @param {number} delta - Change in balance
     */
    updateTimeTranchedBalance(userId, tokenType, delta) {
        const userTokens = this.timeTranchedBalances.get(userId) || {};
        userTokens[tokenType] = (userTokens[tokenType] || 0) + delta;
        this.timeTranchedBalances.set(userId, userTokens);
    }

    /**
     * Get system statistics
     * @returns {Object} - System statistics
     */
    getSystemStats() {
        const stats = {
            currentMonth: this.currentMonth,
            totalLockedCapital: this.totalLockedCapital,
            totalUsers: this.userBalances.size,
            activeTimeTranchedUsers: this.timeTranchedBalances.size,
            tokenTypeStats: {}
        };

        // Calculate stats for each token type
        for (let tokenType = 1; tokenType <= 4; tokenType++) {
            let totalTokens = 0;
            let activeUsers = 0;
            
            for (const [userId, balances] of this.timeTranchedBalances) {
                if (balances[tokenType] && balances[tokenType] > 0) {
                    totalTokens += balances[tokenType];
                    activeUsers++;
                }
            }

            stats.tokenTypeStats[tokenType] = {
                totalTokens,
                activeUsers,
                currentDiscountValue: this.getCurrentDiscountValue(tokenType)
            };
        }

        return stats;
    }

    /**
     * Get all users and their balances
     * @returns {Object} - All user balances
     */
    getAllUserBalances() {
        const result = {};
        for (const [userId, balance] of this.userBalances) {
            result[userId] = {
                tokenBalance: balance,
                timeTranchedBalances: this.getAllTimeTranchedBalances(userId)
            };
        }
        return result;
    }
}

module.exports = TimeTranchedWithdrawal; 