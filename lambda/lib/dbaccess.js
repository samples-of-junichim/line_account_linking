
let AWS=require('aws-sdk');

let documentClient = new AWS.DynamoDB.DocumentClient();

exports.getItemFromDb = async function(params) {
    return new Promise(function(resolve, reject) {
        documentClient.get(params, function(err, data) {
            if (err) {
                console.error("getItemFromDb: " + err);
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

exports.putItemToDb = async function(params) {
    return new Promise(function(resolve, reject) {
        documentClient.put(params, function(err, data) {
            if (err) {
                console.error("putItemToDb: " + err);
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

exports.deleteItemFromDb = async function(params) {
    return new Promise(function(resolve, reject) {
        documentClient.delete(params, function(err, data) {
            if (err) {
                console.error("deleteItemFromDb: " + err);
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

exports.queryDb = async function(params) {
    return new Promise(function(resolve, reject) {
        documentClient.query(params, function(err, data) {
            if (err) {
                console.error("queryDb: " + err);
                reject(err);
            } else {
                resolve(data);
            }
        });  
    });
}

exports.updateItem = async function(params) {
    return new Promise(function(resolve, reject) {
        documentClient.update(params, function(err, data) {
            if (err) {
                console.error("updateItem: " + err);
                reject(err);
            } else {
                resolve(data);
            }
        });  
    });
    
}

exports.batchGetItems = async function(params) {
    return new Promise(function(resolve, reject) {
        documentClient.batchGet(params, function(err, data) {
            if (err) {
                console.error("batchGetItems: " + err);
                reject(err);
            } else {
                resolve(data);
            }
        });  
    });
    
}

exports.batchWriteItems = async function(params) {
    return new Promise(function(resolve, reject) {
        documentClient.batchWrite(params, function(err, data) {
            if (err) {
                console.error("batchWriteItems: " + err);
                reject(err);
            } else {
                resolve(data);
            }
        });  
    });
    
}
