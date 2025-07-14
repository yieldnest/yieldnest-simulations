const TimeTranchedWithdrawal = require('./TimeTranchedWithdrawal');
const TimeTranchedDEX = require('./TimeTranchedDEX');
const { AgentFactory } = require('./SimulationAgents');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const fs = require('fs');
const path = require('path');

/**
 * Time-Tranched Withdrawal Simulation
 * 
 * This simulation demonstrates the time-tranched fungible withdrawal system
 * with various agent strategies and market dynamics.
 */
class TimeTranchedSimulation {
    constructor() {
        this.timeTranchedSystem = new TimeTranchedWithdrawal();
        this.dex = new TimeTranchedDEX(this.timeTranchedSystem);
        this.agents = [];
        this.simulationData = [];
        this.monthlyStats = [];
        
        // Simulation configuration
        this.config = {
            totalMonths: 12,
            initialAgentBalance: 1000,
            agentTypes: [
                { type: 'conservative', count: 3 },
                { type: 'arbitrage', count: 2 },
                { type: 'liquidity_provider', count: 2 },
                { type: 'momentum', count: 2 },
                { type: 'opportunistic', count: 1 }
            ]
        };
    }

    /**
     * Initialize the simulation with agents
     */
    initialize() {
        console.log('🚀 Initializing Time-Tranched Withdrawal Simulation...\n');
        
        // Create agents
        let agentId = 1;
        for (const agentConfig of this.config.agentTypes) {
            for (let i = 0; i < agentConfig.count; i++) {
                const agent = AgentFactory.createAgent(
                    agentConfig.type,
                    `agent_${agentId}`,
                    this.config.initialAgentBalance,
                    this.timeTranchedSystem,
                    this.dex
                );
                this.agents.push(agent);
                agentId++;
            }
        }

        console.log(`📊 Created ${this.agents.length} agents:`);
        for (const agentConfig of this.config.agentTypes) {
            console.log(`   - ${agentConfig.count}x ${agentConfig.type} agents`);
        }
        console.log(`💰 Initial balance per agent: ${this.config.initialAgentBalance} T\n`);
    }

    /**
     * Run the simulation for the specified number of months
     */
    async run() {
        console.log('🔄 Starting simulation...\n');

        for (let month = 0; month < this.config.totalMonths; month++) {
            console.log(`📅 Month ${month + 1}/${this.config.totalMonths} (Month ${month} in system)`);
            
            // Execute agent actions
            for (const agent of this.agents) {
                agent.executeActions(month);
            }

            // Collect monthly statistics
            const monthlyStat = this.collectMonthlyStats(month);
            this.monthlyStats.push(monthlyStat);

            // Log monthly summary
            this.logMonthlySummary(monthlyStat);

            // Advance to next month
            if (month < this.config.totalMonths - 1) {
                this.timeTranchedSystem.advanceMonth();
            }
        }

        console.log('\n✅ Simulation completed!\n');
        
        // Generate final report
        await this.generateFinalReport();
    }

    /**
     * Collect statistics for the current month
     * @param {number} month - Current month
     * @returns {Object} - Monthly statistics
     */
    collectMonthlyStats(month) {
        const systemStats = this.timeTranchedSystem.getSystemStats();
        const dexStats = this.dex.getDEXStats();
        const agentStats = this.agents.map(agent => agent.getStats());

        return {
            month,
            systemStats,
            dexStats,
            agentStats,
            timestamp: Date.now()
        };
    }

    /**
     * Log monthly summary
     * @param {Object} monthlyStat - Monthly statistics
     */
    logMonthlySummary(monthlyStat) {
        const { month, systemStats, dexStats } = monthlyStat;
        
        console.log(`   💰 Total locked capital: ${systemStats.totalLockedCapital.toFixed(2)} T`);
        console.log(`   👥 Active users: ${systemStats.activeTimeTranchedUsers}`);
        console.log(`   📈 DEX volume: ${dexStats.totalVolume.toFixed(2)} T`);
        console.log(`   🔄 Total trades: ${dexStats.totalTrades}`);
        
        // Show token type statistics
        for (let tokenType = 1; tokenType <= 4; tokenType++) {
            const tokenStats = systemStats.tokenTypeStats[tokenType];
            const marketPrice = dexStats.tokenTypeStats[tokenType].marketPrice;
            console.log(`   W${tokenType}-T: ${tokenStats.totalTokens.toFixed(2)} tokens, ${tokenStats.activeUsers} users, price: ${marketPrice.midPrice?.toFixed(3) || 'N/A'}`);
        }
        console.log('');
    }

    /**
     * Generate final simulation report
     */
    async generateFinalReport() {
        console.log('📊 Generating final report...\n');

        // Agent performance summary
        console.log('🏆 AGENT PERFORMANCE SUMMARY:');
        console.log('=' .repeat(80));
        
        const agentPerformance = this.agents.map(agent => {
            const stats = agent.getStats();
            return {
                id: stats.id,
                strategy: stats.strategy,
                profitLoss: stats.profitLoss,
                profitLossPercentage: stats.profitLossPercentage,
                totalTrades: stats.totalTrades
            };
        }).sort((a, b) => b.profitLossPercentage - a.profitLossPercentage);

        for (const agent of agentPerformance) {
            const emoji = agent.profitLossPercentage > 0 ? '📈' : '📉';
            console.log(`${emoji} ${agent.id} (${agent.strategy}): ${agent.profitLoss.toFixed(2)} T (${agent.profitLossPercentage.toFixed(2)}%), ${agent.totalTrades} trades`);
        }

        // System statistics
        console.log('\n📈 SYSTEM STATISTICS:');
        console.log('=' .repeat(80));
        
        const finalSystemStats = this.timeTranchedSystem.getSystemStats();
        const finalDexStats = this.dex.getDEXStats();
        
        console.log(`Total locked capital: ${finalSystemStats.totalLockedCapital.toFixed(2)} T`);
        console.log(`Total users: ${finalSystemStats.totalUsers}`);
        console.log(`Active time-tranched users: ${finalSystemStats.activeTimeTranchedUsers}`);
        console.log(`Total DEX volume: ${finalDexStats.totalVolume.toFixed(2)} T`);
        console.log(`Total DEX fees: ${finalDexStats.totalFees.toFixed(2)} T`);
        console.log(`Total trades executed: ${finalDexStats.totalTrades}`);

        // Token type breakdown
        console.log('\n🎫 TOKEN TYPE BREAKDOWN:');
        console.log('=' .repeat(80));
        
        for (let tokenType = 1; tokenType <= 4; tokenType++) {
            const tokenStats = finalSystemStats.tokenTypeStats[tokenType];
            const marketPrice = finalDexStats.tokenTypeStats[tokenType].marketPrice;
            console.log(`W${tokenType}-T: ${tokenStats.totalTokens.toFixed(2)} tokens, ${tokenStats.activeUsers} users, final price: ${marketPrice.midPrice?.toFixed(3) || 'N/A'}`);
        }

        // Generate charts
        await this.generateCharts();
    }

    /**
     * Generate visualization charts
     */
    async generateCharts() {
        console.log('\n📊 Generating charts...');

        const width = 1200;
        const height = 800;
        const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

        // Chart 1: Portfolio values over time
        const portfolioChart = await this.createPortfolioChart(chartJSNodeCanvas);
        fs.writeFileSync('portfolio-values-chart.png', portfolioChart);

        // Chart 2: Token prices over time
        const priceChart = await this.createPriceChart(chartJSNodeCanvas);
        fs.writeFileSync('token-prices-chart.png', priceChart);

        // Chart 3: System metrics over time
        const metricsChart = await this.createMetricsChart(chartJSNodeCanvas);
        fs.writeFileSync('system-metrics-chart.png', metricsChart);

        console.log('📈 Charts generated:');
        console.log('   - portfolio-values-chart.png');
        console.log('   - token-prices-chart.png');
        console.log('   - system-metrics-chart.png');
    }

    /**
     * Create portfolio values chart
     */
    async createPortfolioChart(chartJSNodeCanvas) {
        const labels = this.monthlyStats.map(stat => `Month ${stat.month + 1}`);
        
        const datasets = this.agents.map(agent => {
            const values = this.monthlyStats.map(stat => {
                const agentStat = stat.agentStats.find(a => a.id === agent.id);
                return agentStat ? agentStat.totalPortfolioValue : 0;
            });

            return {
                label: `${agent.id} (${agent.strategy})`,
                data: values,
                borderWidth: 2,
                fill: false
            };
        });

        const configuration = {
            type: 'line',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Agent Portfolio Values Over Time'
                    },
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Portfolio Value (T)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Month'
                        }
                    }
                }
            }
        };

        return await chartJSNodeCanvas.renderToBuffer(configuration);
    }

    /**
     * Create token prices chart
     */
    async createPriceChart(chartJSNodeCanvas) {
        const labels = this.monthlyStats.map(stat => `Month ${stat.month + 1}`);
        
        const datasets = [];
        for (let tokenType = 1; tokenType <= 4; tokenType++) {
            const prices = this.monthlyStats.map(stat => {
                const marketPrice = stat.dexStats.tokenTypeStats[tokenType].marketPrice;
                return marketPrice.midPrice || stat.systemStats.tokenTypeStats[tokenType].currentDiscountValue;
            });

            datasets.push({
                label: `W${tokenType}-T Price`,
                data: prices,
                borderWidth: 2,
                fill: false
            });
        }

        const configuration = {
            type: 'line',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Token Prices Over Time'
                    },
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: 'Price (T)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Month'
                        }
                    }
                }
            }
        };

        return await chartJSNodeCanvas.renderToBuffer(configuration);
    }

    /**
     * Create system metrics chart
     */
    async createMetricsChart(chartJSNodeCanvas) {
        const labels = this.monthlyStats.map(stat => `Month ${stat.month + 1}`);
        
        const lockedCapital = this.monthlyStats.map(stat => stat.systemStats.totalLockedCapital);
        const dexVolume = this.monthlyStats.map(stat => stat.dexStats.totalVolume);
        const activeUsers = this.monthlyStats.map(stat => stat.systemStats.activeTimeTranchedUsers);

        const configuration = {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Locked Capital (T)',
                        data: lockedCapital,
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        borderWidth: 2,
                        fill: false,
                        yAxisID: 'y'
                    },
                    {
                        label: 'DEX Volume (T)',
                        data: dexVolume,
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        borderWidth: 2,
                        fill: false,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Active Users',
                        data: activeUsers,
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        borderWidth: 2,
                        fill: false,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'System Metrics Over Time'
                    },
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Value (T)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Number of Users'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Month'
                        }
                    }
                }
            }
        };

        return await chartJSNodeCanvas.renderToBuffer(configuration);
    }

    /**
     * Save simulation data to JSON file
     */
    saveSimulationData() {
        const data = {
            config: this.config,
            monthlyStats: this.monthlyStats,
            finalAgentStats: this.agents.map(agent => agent.getStats()),
            finalSystemStats: this.timeTranchedSystem.getSystemStats(),
            finalDexStats: this.dex.getDEXStats()
        };

        fs.writeFileSync('simulation-results.json', JSON.stringify(data, null, 2));
        console.log('💾 Simulation data saved to simulation-results.json');
    }
}

/**
 * Main execution function
 */
async function main() {
    try {
        const simulation = new TimeTranchedSimulation();
        
        // Initialize simulation
        simulation.initialize();
        
        // Run simulation
        await simulation.run();
        
        // Save data
        simulation.saveSimulationData();
        
        console.log('\n🎉 Simulation completed successfully!');
        console.log('📁 Check the generated files for detailed results and charts.');
        
    } catch (error) {
        console.error('❌ Simulation failed:', error);
        process.exit(1);
    }
}

// Run the simulation if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = TimeTranchedSimulation; 