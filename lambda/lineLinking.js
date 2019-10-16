
'use strict';

const dbaccess = require('./lib/dbaccess');

const dbtable = {
    nonceTable: 'LineLinkingNonce',
    registerTable: 'LineLinkingRegistered',
};

/**
 * LINEアカウント連携のため、ユーザー情報とノンスを保存する
 * API Gateway (Cognitoによる認可) 経由で呼び出される
 */
exports.preregister = async function(event) {
    console.log("start");
    console.log(JSON.stringify(event));
    
    // 受信メッセージの確認
    const body = JSON.parse(event.body);
    console.log("body: " + JSON.stringify(body));

    if (!body.nonce || !body.email) {
        handleError(null, "nonce and email must be filled.");
    }

    try {
        await putNonce(body.nonce, body.email);
    } catch(err) {
        handleError(err,"replay message failed");
    }

    const response = {
        statusCode: 200,
        headers: {"Access-Control-Allow-Origin": "*"},
        body: JSON.stringify('success'),
    };
    return response;
};

/**
 * 既に連携済みか否か確認
 * DynamoDB の読み取り権限が必要
 */
exports.isAlreadyLinked = async function(lineId) {
    try {
        let email = await getEmailById(lineId);
        if (!email) {
            console.log("アカウント未連携, lineId: " + lineId);
            return false;
        }
    } catch(err) {
        handleError(err, "isAlreadyLinked failed");
    }
    return true;
}

/**
 * アカウント連携
 * lineId とユーザー名をリンクさせる
 */
exports.register = async function(nonce, lineId) {
    let email;
    try {
        email = await getEmailByNonce(nonce);
    } catch(err) {
        handleError(err, "cannot find email by nonce: " + nonce);
    }
    if (!email) {
        handleError(err, "email is missing. nonce: " + nonce);
    }

    let param = {
        TableName: dbtable.registerTable,
        Item: {
            'lineId': lineId,
            'email': email,
        }
    };
    console.log("register param: " + JSON.stringify(param));
    return dbaccess.putItemToDb(param);
}

/**
 * アカウント連携解除
 */
exports.unregister = async function(lineId) {
    let param = {
        TableName: dbtable.registerTable,
        Key: {
            lineId: lineId,
        }
    };
    console.log("unregister param: " + JSON.stringify(param));
    return dbaccess.deleteItemFromDb(param);
}

async function putNonce(nonce, email) {
    let param = {
        TableName: dbtable.nonceTable,
        Item: {
            'nonce': nonce,
            'email': email,
        }
    };
    console.log("putNonce param: " + JSON.stringify(param));
    return dbaccess.putItemToDb(param);
}

async function getEmailByNonce(nonce) {
    let param = {
        TableName: dbtable.nonceTable,
        Key: {
            nonce: nonce,
        },
        AttributesToGet: [ // TODO 旧式 ProjecttionExpression へ変更
            'email',
        ]
    };
    console.log("getEmailByNonce param: " + JSON.stringify(param));
    return dbaccess.getItemFromDb(param)
        .then((data) => {
            console.log("getEmailByNonce data: " + JSON.stringify(data));
            if (!data.Item || !data.Item.email) {
                console.log("email not found");
                return "";
            }
            return data.Item.email;
        }).catch((err) => {
            console.log("getEmailByNonce err: " + JSON.stringify(err));
            throw err;
        });
}

async function getEmailById(lineId) {
    let param = {
        TableName: dbtable.registerTable,
        Key: {
            lineId: lineId,
        },
        AttributesToGet: [ // TODO 旧式 ProjecttionExpression へ変更
            'email',
        ]
    };
    console.log("getEmailById param: " + JSON.stringify(param));
    return dbaccess.getItemFromDb(param)
        .then((data) => {
            console.log("getEmailById data: " + JSON.stringify(data));
            if (!data.Item || !data.Item.email) {
                console.log("email not found");
                return "";
            }
            return data.Item.email;
        }).catch((err) => {
            console.log("getEmailById err: " + JSON.stringify(err));
            throw err;
        });
}


function handleError(err, base_message) {
    if (!base_message) {
        base_message = "(no message)";
    }
    if (err instanceof Error) {
        console.error(base_message + ": " + err.name + ", " + err.message);
        throw err;
    } else {
        let msg = base_message + (!err ? "" : ": " + JSON.stringify(err));
        console.error(msg);
        throw new Error(msg);
    }
}