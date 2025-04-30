const express = require("express");
const router = express.Router();
const vybeApi = require('@api/vybe-api');
const helius = require('helius-sdk')
const { processGraphData } = require("../serializers/processGraphdata");
const { aggregateTransactions } = require("../services/common/aggregationService");
const axios = require('axios');

vybeApi.auth(process.env.VYBE_TOKEN);

const MAX_LAYERS = 5;
const MAX_TRANSACTIONS = 100;
const BATCH_DELAY = 5000; 


const GetTopHolders = async (req, res) => {
  try {
    const { mint } = req.query;
    if (!mint) {
      return res.status(400).json({ error: 'Mint address is required' });
    }
    const response = await vybeApi.get_top_holders({ mintAddress: mint });
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error fetching top holders:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getTokenTraders = async (req, res) => {
  try {
    const { mint } = req.query;
    if (!mint) {
      return res.status(400).json({ error: 'Mint address is required' });
    }
    let page = 1;
    const senderMap = new Map();

    while (page <= 1) {
      const response = await vybeApi.get_token_transfers({ mintAddress: mint, page: page });
      const simplified = (response.data.transfers).map(tx => ({
        sender: tx.senderAddress,
        receiver: tx.receiverAddress,
        amount: tx.amount,
        valueUsd: Number(tx.valueUsd) // Ensure valueUsd is a number
      }));

      simplified.forEach(tx => {
        if (!senderMap.has(tx.sender)) {
          senderMap.set(tx.sender, new Map());
        }
        const receiverMap = senderMap.get(tx.sender);

        if (!receiverMap.has(tx.receiver)) {
          receiverMap.set(tx.receiver, { amount: 0, valueUsd: 0 });
        }
        const receiverData = receiverMap.get(tx.receiver);

        receiverData.amount += tx.amount;
        receiverData.valueUsd += tx.valueUsd;
      });

      page++;
    }

    // 1. Collect all unique addresses and transaction counts
    const nodeStats = {}; // address -> { count, totalAmount }
    const edges = [];

    senderMap.forEach((receiverMap, sender) => {
      if (!nodeStats[sender]) nodeStats[sender] = { count: 0, totalAmount: 0 };
      receiverMap.forEach((data, receiver) => {
        // Only include edges where valueUsd is at least 1
        if (data.valueUsd >= 1) {
          edges.push({
            from: sender,
            to: receiver,
            amount: data.amount,
            valueUsd: data.valueUsd
          });
        }

        nodeStats[sender].count += 1;
        nodeStats[sender].totalAmount += data.amount;

        if (!nodeStats[receiver]) nodeStats[receiver] = { count: 0, totalAmount: 0 };
        nodeStats[receiver].count += 1;
        nodeStats[receiver].totalAmount += data.amount;
      });
    });

    function getRandomColor() {
      return '#' + Math.floor(Math.random()*16777215).toString(16);
    }

    // Find max for scaling
    const minSize = 100, maxSize = 500;

    const nodes = Object.entries(nodeStats).map(([address, stats]) => ({
      id: address,
      label: address,
      color: getRandomColor(),
      size: minSize + (maxSize - minSize) * stats.valueUsd
    }));

    // 3. Prepare the graph object
    const graph = {
      nodes,
      edges
    };

    res.status(200).json(graph);
  } catch (error) {
    console.error('Error fetching token traders:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}


const accountInfo  = async (req, res) => {
  try {
    const { address } = req.params; 
    if (!address) {
      return res.status(400).json({ error: 'Address parameter is required' });
    }

    const response = await Moralis.SolApi.account.getPortfolio({
      network: "mainnet",
      address,
    });

    const transformedData = [
      {
        address: address, 
        balance: response.raw.nativeBalance?.solana || "NA", 
        chain: "solana",
        transactionCount: "NA", 
        firstTransactionTime: "NA", 
        lastTransactionTime: "NA", 
        totalReceived: "NA", 
        totalSent: "NA", 
        balanceSymbol: "SOL" 
      }
    ];

    res.status(200).json(transformedData);

  } catch (e) {
    console.error("Error fetching account portfolio:", e.message); 
    res.status(500).json({ error: e.message || 'Failed to fetch account portfolio' });
  }
}

async function getHeliusTransactions(address) {
  const apiKey = process.env.HELIUS_API_KEY;
  try {
    const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&&type=TRANSFER`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
      },
    });
    if (!response.ok) throw new Error('Failed to fetch transactions');
    const transactions = await response.json();

    const data = transactions.flatMap(tx =>
      (tx.nativeTransfers)
        .filter(t => (t.fromUserAccount === address || t.toUserAccount === address) && (t.amount /1e9) > 0.0001 )
        .map(t => ({
          from_address: t.fromUserAccount,
          to_address: t.toUserAccount,
          value: t.amount / 1e9,
        }))
    );
    console.log("data",data);

    const aggregatedTransactions = aggregateTransactions(data, address);
    const graphData = processGraphData(aggregatedTransactions, address, "SOL");
    return {
      results: {
      transactions: transactions,
      aggregatedTransactions: aggregatedTransactions,
      graphdata: graphData,
      }
    };
  } catch (error) {
    console.error('Error in getHeliusTransactions:', error);
    throw new Error('Failed to fetch or process transactions');
  }
}

async function getWalletTransactions(address) {
  const apiKey = process.env.HELIUS_API_KEY;
  try {
    const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&&type=TRANSFER`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
      },
    });
    if (!response.ok) throw new Error('Failed to fetch transactions');
    const transactions = await response.json();

    const data = transactions.flatMap(tx =>
      (tx.nativeTransfers)
        .filter(t => (t.fromUserAccount === address || t.toUserAccount === address) && (t.amount /1e9) > 0.0001 )
        .map(t => ({
          from_address: t.fromUserAccount,
          to_address: t.toUserAccount,
          value: t.amount / 1e9,
        }))
    );
    console.log("data",data);
    return data;
  } catch (error) {
    console.error('Error in getHeliusTransactions:', error);
    throw new Error('Failed to fetch or process transactions');
  }
}

const transactions = async (req, res) => {
  try {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }
    const response = await getHeliusTransactions(address);
    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}


async function getAllTransactionsControllers(req, res) {
  const rootAddress = req.params.address;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const sendSSE = (data) => {
    if (data) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  sendSSE({
    type: "info",
    message: "Starting multi-layer transaction stream...",
  });

  try {
    console.time("processAddressLayer");
    const processedAddresses = new Set();
    await processAddressLayer(
      rootAddress,
      0,
      MAX_LAYERS,
      processedAddresses,
      sendSSE,
    );
    console.timeEnd("processAddressLayer");
    console.log("Processing completed, sending close event");

    sendSSE({ type: "close", message: "Stream completed" });
  } catch (error) {
    console.error(error);
    console.error("Error in getAllTransactionsControllers:", error);

    sendSSE({ type: "error", message: "Internal Server Error" });
  } finally {
    console.log("Ending response");
    setTimeout(() => {
      res.end();
    }, 10000);
  }
}

async function processAddressLayer(
  address,
  currentLayer,
  maxLayers,
  processedAddresses,
  sendSSE
) {
  if (currentLayer >= maxLayers || processedAddresses.has(address)) {
    return;
  }
  processedAddresses.add(address); 

  sendSSE({
    type: "info",
    message: `Processing layer ${currentLayer + 1}, address: ${address}`,
  });

  let totalTransactions = 0;
  const uniqueAddresses = new Set();

  const transactions = await getWalletTransactions(
    address,
  );

  if (transactions && transactions.length > 0) {
    const aggregatedTransactions = aggregateTransactions(
      transactions,
      address
    );

    const filteredTransactions = aggregatedTransactions.filter((tx) => {
      return tx.value >= 0.0001 ;
    });
    console.log('filteredTransactions', filteredTransactions);
    const graphData = processGraphData(
      filteredTransactions,
      address,
    );
    console.log('graphData', graphData);
    totalTransactions += transactions.length;

    sendSSE({
      type: "transactions",
      layerNumber: currentLayer + 1,
      address: address,
      transactions: aggregatedTransactions,
      aggregateTransactions: filteredTransactions,
      graphdata: graphData,
      totalProcessed: filteredTransactions.length,
      timestamp: new Date().toISOString(),
    });

    filteredTransactions.forEach((tx) => {
      if (tx.from_address !== address) uniqueAddresses.add(tx.from_address);
      if (tx.to_address !== address) uniqueAddresses.add(tx.to_address);
    });
  }

  const nextLayerAddresses = Array.from(uniqueAddresses).slice(0, 2); 
  if (currentLayer < maxLayers - 1 && nextLayerAddresses.length > 0) {
    await processNextLayer(
      nextLayerAddresses,
      currentLayer + 1,
      maxLayers,
      processedAddresses,
      sendSSE
    );
  }
}

async function processNextLayer(
  addresses,
  currentLayer,
  maxLayers,
  processedAddresses,
  sendSSE
) {
  const addressesToProcess = addresses.filter(
    (addr) => !processedAddresses.has(addr)
  );

  const processAddress = async (address) => {
    const transactions = await getWalletTransactions(
      address,
    );
    const aggregatedTransactions = aggregateTransactions(
      transactions,
      address
    );
   
    const filteredTransactions = aggregatedTransactions.filter((tx) => {
      return tx.value >= 0.0001 ;
    });
    const graphData = processGraphData(
      filteredTransactions,
      address
    );
    console.log('graphData', graphData);
    sendSSE({
      type: "transactions",
      layerNumber: currentLayer + 1,
      address: address,
      transactions: aggregatedTransactions,
      aggregateTransactions: filteredTransactions,
      graphdata: graphData,
      totalProcessed: filteredTransactions.length,
      timestamp: new Date().toISOString(),
    });

    processedAddresses.add(address);

    return filteredTransactions.reduce((acc, tx) => {
      if (tx.from_address !== address) acc.add(tx.from_address);
      if (tx.to_address !== address) acc.add(tx.to_address);
      return acc;
    }, new Set());
  };

  const results = await Promise.all(addressesToProcess.map(processAddress));

  const nextLayerAddresses = Array.from(
    new Set(results.flatMap((set) => Array.from(set)))
  ).slice(0, 2);

  if (currentLayer < maxLayers - 1) {
    await processNextLayer(
      nextLayerAddresses,
      currentLayer + 1,
      maxLayers,
      processedAddresses,
      sendSSE
    );
  }
}



router.get('/top-holders', GetTopHolders);
router.get('/token-traders', getTokenTraders);
router.get('/account-info/:address', accountInfo);
router.get('/address/:address', transactions);
router.get('/address/:address/outgoing', transactions);
router.get("/stream/transactions/:address", getAllTransactionsControllers);



module.exports = router;