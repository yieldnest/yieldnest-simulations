const BUFFER_TARGET_PERCENTAGE = 0.10; // 10% buffer target
const WITHDRAWAL_DELAY_DAYS = 15;

class AsyncWithdrawalVault {
  constructor(initialBalance) {
    this.balance = initialBalance;
    this.pendingWithdrawals = []; // Array of {amount, completionDay}
  }

  requestWithdrawal(amount, currentDay) {
    if (amount <= this.balance) {
      this.balance -= amount;
      this.pendingWithdrawals.push({
        amount,
        completionDay: currentDay + WITHDRAWAL_DELAY_DAYS
      });
      return true;
    }
    return false;
  }

  processCompletedWithdrawals(currentDay) {
    const completed = this.pendingWithdrawals.filter(w => w.completionDay <= currentDay);
    this.pendingWithdrawals = this.pendingWithdrawals.filter(w => w.completionDay > currentDay);
    return completed.reduce((sum, w) => sum + w.amount, 0);
  }
}

class MetaVault {
  constructor(vault1InitialBalance, vault2InitialBalance) {
    const totalInitial = vault1InitialBalance + vault2InitialBalance;
    const initialBufferAmount = totalInitial * BUFFER_TARGET_PERCENTAGE;
    
    // Reduce initial vault balances to account for buffer
    const adjustedVault1Balance = vault1InitialBalance - (initialBufferAmount / 2);
    const adjustedVault2Balance = vault2InitialBalance - (initialBufferAmount / 2);
    
    this.vault1 = new AsyncWithdrawalVault(adjustedVault1Balance);
    this.vault2 = new AsyncWithdrawalVault(adjustedVault2Balance);
    this.buffer = initialBufferAmount;
    this.totalAssets = totalInitial;
  }

  getTargetBuffer() {
    return this.totalAssets * BUFFER_TARGET_PERCENTAGE;
  }

  processDay(currentDay) {
    // Process completed withdrawals from both vaults
    const completed1 = this.vault1.processCompletedWithdrawals(currentDay);
    const completed2 = this.vault2.processCompletedWithdrawals(currentDay);
    
    this.buffer += completed1 + completed2;
    
    // Request new withdrawals if buffer is below target
    const targetBuffer = this.getTargetBuffer();
    if (this.buffer < targetBuffer) {
      const needed = targetBuffer - this.buffer;
      
      // Calculate pending withdrawals from each vault
      const vault1Pending = this.vault1.pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);
      const vault2Pending = this.vault2.pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);
      
      // Adjust needed amount based on what's already in flight
      const adjustedNeeded = Math.max(0, needed - vault1Pending - vault2Pending);
      const perVault = adjustedNeeded / 2;
      
      if (perVault > 0) {
        this.vault1.requestWithdrawal(perVault, currentDay);
        this.vault2.requestWithdrawal(perVault, currentDay);
      }
    }

    return {
      currentBuffer: this.buffer,
      targetBuffer,
      vault1Balance: this.vault1.balance,
      vault2Balance: this.vault2.balance,
      vault1PendingWithdrawals: [...this.vault1.pendingWithdrawals],
      vault2PendingWithdrawals: [...this.vault2.pendingWithdrawals]
    };
  }

  handleDeposit(amount) {
    const targetBuffer = this.getTargetBuffer();
    const bufferDeficit = Math.max(0, targetBuffer - this.buffer);
    
    // Use part of deposit to fill buffer if needed
    if (bufferDeficit > 0) {
      const amountForBuffer = Math.min(bufferDeficit, amount * BUFFER_TARGET_PERCENTAGE);
      this.buffer += amountForBuffer;
      amount -= amountForBuffer;
    }
    
    // Split remaining amount between vaults
    const perVault = amount / 2;
    this.vault1.balance += perVault;
    this.vault2.balance += perVault;
    this.totalAssets += amount;
  }

  handleWithdrawal(amount) {
    if (amount <= this.buffer) {
      this.buffer -= amount;
      this.totalAssets -= amount;
      return true;
    }
    return false;
  }
}

// Example usage
const metaVault = new MetaVault(1000000, 1000000); // 1M in each vault
let currentDay = 0;

// Simulate 30 days with random deposits and withdrawals
// Store data points for visualization
const dataPoints = [];

for (let day = 0; day < 30; day++) {
  currentDay = day;
  
  // Random chance of deposit or withdrawal
  const action = Math.random();
  if (action < 0.6) { // 60% chance of deposit
    const depositAmount = Math.random() * 100000; // Random deposit up to 100k
    metaVault.handleDeposit(depositAmount);
    console.log(`Day ${day}: Deposited ${depositAmount.toFixed(2)}`);
  } else { // 40% chance of withdrawal
    const maxWithdrawal = metaVault.buffer; // Can only withdraw what's in buffer
    const withdrawalAmount = Math.random() * maxWithdrawal;
    const success = metaVault.handleWithdrawal(withdrawalAmount);
    console.log(`Day ${day}: Withdrawal ${success ? 'succeeded' : 'failed'} for ${withdrawalAmount.toFixed(2)}`);
  }

  const state = metaVault.processDay(currentDay);
  
  // Store data point for this day
  dataPoints.push({
    day,
    buffer: state.currentBuffer,
    targetBuffer: state.targetBuffer,
    vault1Balance: state.vault1Balance,
    vault2Balance: state.vault2Balance,
    vault1PendingTotal: state.vault1PendingWithdrawals.reduce((sum, w) => sum + w.amount, 0),
    vault2PendingTotal: state.vault2PendingWithdrawals.reduce((sum, w) => sum + w.amount, 0)
  });

  // Print daily state
  console.log('\n===========================================');
  console.log(`Buffer: ${state.currentBuffer.toFixed(2)} (Target: ${state.targetBuffer.toFixed(2)})`);
  console.log(`Vault 1 Balance: ${state.vault1Balance.toFixed(2)}`);
  console.log(`Vault 2 Balance: ${state.vault2Balance.toFixed(2)}`);
  console.log(`Vault 1 Pending Withdrawals: ${dataPoints[day].vault1PendingTotal.toFixed(2)}`);
  console.log(`Vault 2 Pending Withdrawals: ${dataPoints[day].vault2PendingTotal.toFixed(2)}`);
  console.log('===========================================\n');
}

// Visual representation of data
console.log('\nSimulation Summary:');
console.log('Day | Buffer % of Target | V1 Balance | V2 Balance | V1 Pending | V2 Pending');
console.log('-'.repeat(75));

dataPoints.forEach(dp => {
  const bufferPercentage = ((dp.buffer / dp.targetBuffer) * 100).toFixed(1);
  console.log(
    `${dp.day.toString().padStart(2)} | ` +
    `${bufferPercentage.padStart(6)}% | ` +
    `${dp.vault1Balance.toFixed(0).padStart(9)} | ` +
    `${dp.vault2Balance.toFixed(0).padStart(9)} | ` +
    `${dp.vault1PendingTotal.toFixed(0).padStart(9)} | ` +
    `${dp.vault2PendingTotal.toFixed(0).padStart(9)}`
  );
});

// Create chart using Chart.js
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const width = 800;
const height = 600;
const chartCallback = (ChartJS) => {
  ChartJS.defaults.responsive = true;
  ChartJS.defaults.maintainAspectRatio = false;
};

const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, chartCallback });

const configuration = {
  type: 'line',
  data: {
    labels: dataPoints.map(dp => `Day ${dp.day}`),
    datasets: [
      {
        label: 'Buffer',
        data: dataPoints.map(dp => dp.buffer),
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      },
      {
        label: 'Target Buffer',
        data: dataPoints.map(dp => dp.targetBuffer),
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1
      },
      {
        label: 'Vault 1 Balance',
        data: dataPoints.map(dp => dp.vault1Balance),
        borderColor: 'rgb(54, 162, 235)',
        tension: 0.1
      },
      {
        label: 'Vault 2 Balance', 
        data: dataPoints.map(dp => dp.vault2Balance),
        borderColor: 'rgb(153, 102, 255)',
        tension: 0.1
      },
      {
        label: 'Vault 1 Pending',
        data: dataPoints.map(dp => dp.vault1PendingTotal),
        borderColor: 'rgb(255, 159, 64)',
        tension: 0.1
      },
      {
        label: 'Vault 2 Pending',
        data: dataPoints.map(dp => dp.vault2PendingTotal),
        borderColor: 'rgb(255, 205, 86)',
        tension: 0.1
      }
    ]
  },
  options: {
    plugins: {
      title: {
        display: true,
        text: 'Meta Vault Simulation Results'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Amount'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Day'
        }
      }
    }
  }
};

(async () => {
  const image = await chartJSNodeCanvas.renderToBuffer(configuration);
  require('fs').writeFileSync('./vault-simulation-chart.png', image);
  console.log('\nChart has been saved as vault-simulation-chart.png');
})();



