const CryptoFactory = require('sawtooth-sdk/signing').CryptoFactory;
const createContext = require('sawtooth-sdk/signing').createContext;
const cbor          = require('cbor');
const createHash    = require('crypto').createHash;
const protobuf      = require('sawtooth-sdk').protobuf;
const request       = require('request');

class Sawtooth {

    constructor() {
        this.signer         = this.generatePrivateKey();
        this.payloadBytes   = this.encodePayload();
        this.transaction    = this.createTransaction();
    }

    generatePrivateKey() {
        const context       = createContext('secp256k1');
        const privateKey    = context.newRandomPrivateKey();
        const signer        = new CryptoFactory(context).newSigner(privateKey);

        return signer;
    }

    encodePayload() {
        const payload = {
            Verb: 'set',
            Name: 'foo',
            Value: 42,
            Keki: 'keki'
        };

        const payloadBytes = cbor.encode(payload);

        return payloadBytes;
    }

    createTransactionHeader() {
        const transactionHeaderBytes = protobuf.TransactionHeader.encode({
            familyName: 'intkey',
            familyVersion: '1.0',
            inputs: ['1cf1266e282c41be5e4254d8820772c5518a2c5a8c0c7f7eda19594a7eb539453e1ed7'],
            outputs: ['1cf1266e282c41be5e4254d8820772c5518a2c5a8c0c7f7eda19594a7eb539453e1ed7'],
            signerPublicKey: this.signer.getPublicKey().asHex(),
            // In this example, we're signing the batch with the same private key,
            // but the batch can be signed by another party, in which case, the
            // public key will need to be associated with that key.
            batcherPublicKey: this.signer.getPublicKey().asHex(),
            // In this example, there are no dependencies.  This list should include
            // an previous transaction header signatures that must be applied for
            // this transaction to successfully commit.
            // For example,
            // dependencies: ['540a6803971d1880ec73a96cb97815a95d374cbad5d865925e5aa0432fcf1931539afe10310c122c5eaae15df61236079abbf4f258889359c4d175516934484a'],
            dependencies: [],
            payloadSha512: createHash('sha512').update(this.payloadBytes).digest('hex')
        }).finish();

        return transactionHeaderBytes;
    }

    createTransaction() {
        const transactionHeaderBytes = this.createTransactionHeader();
        const signature = this.signer.sign(transactionHeaderBytes);

        const transaction = protobuf.Transaction.create({
            header: transactionHeaderBytes,
            headerSignature: signature,
            payload: this.payloadBytes
        });

        return transaction;
    }


    createBatchHeader() {
        const transactions = [this.transaction];
        const batchHeaderBytes = protobuf.BatchHeader.encode({
                signerPublicKey: this.signer.getPublicKey().asHex(),
                transactionIds: transactions.map((txn) => txn.headerSignature),
            }).finish();

        return batchHeaderBytes;
    }

    createBatch() {

        const transactions = [this.transaction];
        const batchHeaderBytes = this.createBatchHeader();
        const signature = this.signer.sign(batchHeaderBytes);

        const batch = protobuf.Batch.create({
            header: batchHeaderBytes,
            headerSignature: signature,
            transactions: transactions
        });

        const batchListBytes = protobuf.BatchList.encode({
            batches: [batch]
        }).finish();

        return batchListBytes;
    }
}

let sawTooth = new Sawtooth();
let batchListBytes = sawTooth.createBatch();

request.post({
    url: 'http://localhost:8008/batches',
    body: batchListBytes,
    headers: {'Content-Type': 'application/octet-stream'}
}, (err, response) => {
    if(err) return console.log(err);
console.log(response.body);
});