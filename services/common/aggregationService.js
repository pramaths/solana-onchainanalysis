function aggregateTransactions(transactions, address) {
  console.log('Aggregating transactions for address:', address);
  console.log('Transactions:', transactions);
    let transactionMap = new Map();
  
    transactions.forEach(tx => {
    //   const transformedTxs = transformBitcoinTransaction(tx, address);
    //   transformedTxs.forEach(transformedTx => {
        const key = tx.from_address === address ? tx.to_address : tx.from_address;
        const state = tx.from_address === address ? 'sent' : 'received';
        
        const existingTx = transactionMap.get(key);
        if (existingTx) {
          existingTx.value += tx.value;
          existingTx.transactions.push({
            block_timestamp: tx.block_timestamp || Math.random().toString(36).substring(2, 15),
            value: tx.value,
          });
        } else {
          transactionMap.set(key, {
            from_address: tx.from_address,
            to_address: tx.to_address,
            value: tx.value,
            state: state,
            transactions: [{
              block_timestamp: tx?.block_timestamp || Math.random().toString(36).substring(2, 15),
              value: tx.value,
            }],
          });
        }
      });
    // });
  
    return Array.from(transactionMap.values());
  }
  
  module.exports = {
    aggregateTransactions,
  };
  