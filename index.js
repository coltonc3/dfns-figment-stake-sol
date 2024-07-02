require('dotenv').config()
const { DfnsApiClient } = require('@dfns/sdk')
const { DfnsWallet } = require('@dfns/lib-solana')
const { AsymmetricKeySigner } = require('@dfns/sdk-keysigner')
const { Transaction } = require('@solana/web3.js')
const axios = require('axios')
const HEADERS = { 
  headers: {
    'x-api-key': process.env.FIGMENT_API_KEY
  }
}
const stakeAmount = 0.01
const figmentApiUrl = 'https://api.figment.io/flows'
const validatorAddress = 'GkqYQysEGmuL6V2AJoNnWZUz2ZBGWhzQXsJiXm2CLKAN'

const initDfnsWallet = async (walletId) => {
  const signer = new AsymmetricKeySigner({
    credId: process.env.DFNS_CRED_ID,
    privateKey: process.env.DFNS_PRIVATE_KEY,
  })

  const dfnsClient = new DfnsApiClient({
    appId: process.env.DFNS_APP_ID,
    authToken: process.env.DFNS_AUTH_TOKEN,
    baseUrl: process.env.DFNS_API_URL,
    signer,
  })

  return DfnsWallet.init({ walletId, dfnsClient })
}

const createFlow = async () => {
  const res = await axios.post(figmentApiUrl, {
    protocol: 'solana',
    network: 'devnet',
    operation: 'staking'
  }, HEADERS)

  return res.data.id
}

const createStakeAccount = async (flowId, amount, fundingAccount) => {
  const res = await axios.put(`${figmentApiUrl}/${flowId}/next`, {
    name: 'create_new_stake_account',
    inputs: {
      funding_account_pubkey: fundingAccount,
      amount: amount
    }
  }, HEADERS)

  return res.data.data.create_stake_account_transaction.raw
}

const signWithDfns = async (dfnsWallet, unsignedTransaction) => {
  const formattedUnsignedTransaction = Transaction.from(Buffer.from(unsignedTransaction, 'hex'))
  const signedTransaction = await dfnsWallet.signTransaction(formattedUnsignedTransaction)

  return signedTransaction.serialize().toString('hex')
}

const broadcastTx = async (signedTx, flowId, action, txType) => {
  console.log(`broadcasting ${txType.replaceAll('_', ' ')}`)

  let flow = await axios.put(`${figmentApiUrl}/${flowId}/next`, {
    name: action,
    inputs: {
      transaction_payload: signedTx
    }
  }, HEADERS)

  while(flow.data.data[txType].status != 'confirmed') {
    flow = await getFlow(flowId)
  }

  return flow.data.data[txType].hash
}

const getFlow = async (flowId) => {
  return await axios.get(`${figmentApiUrl}/${flowId}`, HEADERS)
}

const delegate = async (flowId, validatorAddress) => {
  const res = await axios.put(`${figmentApiUrl}/${flowId}/next`, {
    name: 'create_delegate_tx',
    inputs: {
      validator_address: validatorAddress
    }
  }, HEADERS)

  return res.data.data.delegate_transaction.raw
}

const main = async () => {
  const dfnsWallet = await initDfnsWallet(process.env.AUTHORITY_WALLET_ID)

  const flowId = await createFlow()
  console.log('created flow')
  const unsignedCreateStakeAccountTx = await createStakeAccount(flowId, stakeAmount, dfnsWallet.publicKey)
  console.log('created unsigned stake account transaction')
  const signedCreateStakeAccountTx = await signWithDfns(dfnsWallet, unsignedCreateStakeAccountTx)
  console.log('signed stake account transaction')
  const createStakeAccountHash = await broadcastTx(signedCreateStakeAccountTx, flowId, 'sign_stake_account_tx', 'create_stake_account_transaction')
  console.log('broadcasted stake account transaction')
  console.log(`stake account transaction hash: ${createStakeAccountHash}`)
  const unsignedDelegateTx = await delegate(flowId, validatorAddress)
  console.log('created unsigned delegate transaction')
  const signedDelegateTx = await signWithDfns(dfnsWallet, unsignedDelegateTx)
  console.log('signed delegate transaction')
  const delegateHash = await broadcastTx(signedDelegateTx, flowId, 'sign_delegate_tx', 'delegate_transaction')
  console.log('broadcasted delegate transaction')
  console.log(`delegate transaction hash: ${delegateHash}`)
}

main()