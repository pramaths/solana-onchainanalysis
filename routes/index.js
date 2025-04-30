const express = require("express");
const router = express.Router();

const ethRoutes = require("./ethereumRoutes");
const commonRoutes = require("./commonRoutes");
const solanaRoutes = require("./solanaRoutes");

const { Moralis} = require("../controllers/eth/txHashController")

const accountInfo  = async (req, res) => {
    try {
      const { address } = req.params;
      if (!address) {
        return res.status(400).json({ error: 'Address is required' });
      }
      console.log("address",address);
      const response = await Moralis.SolApi.account.getPortfolio({
        "network": "mainnet",
        "address": address,
      });
  
      const transformedData = [
        {
            address: address, // Assuming address comes from request params
            balance: response.raw.nativeBalance?.solana || "NA", // Use optional chaining and provide NA if not found
            chain: "solana",
            transactionCount: "NA", // Missing data
            firstTransactionTime: "NA", // Missing data
            lastTransactionTime: "NA", // Missing data
            totalReceived: "NA", // Missing data
            totalSent: "NA", // Missing data
            balanceSymbol: "SOL" // Solana's native token symbol
        }
    ];
    
      res.status(200).json(transformedData);
    } catch (error) {
      console.error('Error fetching account info:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
router.get('/crypto/:address/SOL', accountInfo);
router.use('/sol', solanaRoutes);
router.use('/crypto', commonRoutes);
router.use('/', ethRoutes);


module.exports = router;
