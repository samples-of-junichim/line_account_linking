
'use strict';

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// LINE API
const BASE_URL = "https://api.line.me/v2/bot/"
const REPLY_URL = BASE_URL + "message/reply";
const LINK_TOKEN_REQUEST_URL = BASE_URL + "user/";
const LINK_TOKEN_REQUEST_URL_SUFFIX = "/linkToken"

// 独自ログイン画面
const MY_LOGIN_URL = "http://ログイン画面のURL";
const LINK_TOKEN_PARAM_KEY= "linkToken"

const request = require("request-promise");
const crypto = require("crypto");
const linking = require("./lineLinking");

/**
 * LINE Webhook からの呼び出し関数
 */
exports.handler = async (event) => {
    console.log("start");
    console.log(JSON.stringify(event));
    
    // メッセージチェック
    const body_str = event.body;
    const signiture = event.headers["X-Line-Signature"];

    if (! isValidMessage(body_str, signiture)) {
        console.warn("message is invalid");
        throw new Error("message is inivalid. maybe falsification.");
    }

    // 受信メッセージの確認
    const body = JSON.parse(body_str);
    console.log("body: " + JSON.stringify(body));

    // イベントでの振り分け
    const evt = body.events[0]; // TODO 複数イベントへの対応
    switch (evt.type) {
        case "follow":
            console.log("ユーザーがフォローしました: " + evt.source.userId);
            break;
        case "unfollow":
            // TODO アカウント連携解除
            console.log("ユーザーがブロックしました: " + evt.source.userId);
            break;
        case "postback":
            // TODO リッチメニューからの呼び出し
            break;
        case "message":
            // 連携済みか否か確認?
            // LINEアカウント連携の確認
            let result;
            try {
                result = await linking.isAlreadyLinked(evt.source.userId);
            } catch(err) {
                handleError(err, "cannot check already linked or not");
            }
            console.log("アカウント連携済み: " + result);

            if (result) {
                if (evt.message.type === 'text' && evt.message.text === "解除") {
                    // 連携解除
                    try {
                        await linking.unregister(evt.source.userId);

                        await accountLinkingMessage(evt.replyToken, "アカウント連携を解除しました");
                        console.log("アカウント連携解除: " + evt.source.userId);
                    } catch(err) {
                        handleError(err,"unregister failed");
                    }
                } else {
                    // 返信
                    try {
                        await repeatMessage(evt.replyToken, evt.message);
                    } catch (err) {
                        handleError(err,"replay message failed");
                    }
                }
            } else {
                // 連携するようにメッセージを返信
                try {
                    let linkToken = await requestLinkToken(ACCESS_TOKEN, evt.source.userId);
                    console.log("linkToken: " + linkToken);
                    await sendLinkMessage(evt.replyToken, linkToken);
                } catch(err) {
                    handleError(err,"request linkToken failed");
                }

            }
            break;
        case "accountLink":
            console.log("アカウント連携、ユーザー: " + evt.source.userId);
            console.log("アカウント連携、成否: " + evt.link.result);

            if (evt.link.result === "ok") {
                try {
                    // DynamoDB への登録
                    await linking.register(evt.link.nonce, evt.source.userId);

                    // メッセージ送信
                    await accountLinkingMessage(evt.replyToken, "アカウント連携が完了しました");
                } catch(err) {
                    handleError(err,"failed register to DynamoDB");
                }
            } else {
                // 連携失敗
                try {
                    // メッセージ送信
                    await accountLinkingMessage(evt.replyToken, "アカウント連携が失敗しました。もう一度やり直してください。");
                } catch(err) {
                    handleError(err,"failed account linking");
                }
            }
            break;
        default:
            console.log("未対応イベント発生: " + evt.type);
    }

    const response = {
        statusCode: 200,
        body: JSON.stringify('success'),
    };
    return response;
};


function isValidMessage(body, signiture) {
    const hmac = crypto.createHmac("sha256", CHANNEL_SECRET);
    hmac.update(body);
    const str = hmac.digest('base64');

    console.log("message body: " + body);
    console.log("message hmac: " + str);
    console.log("signiture   : " + signiture);

    return str === signiture;
}

async function repeatMessage(replyToken, postMessage) {
    console.log("repeatMessage start");
    console.log("replyToken: " + JSON.stringify(replyToken));
    console.log("message: " + JSON.stringify(postMessage));
    
    // 返信文作成
    let messages = [];
    let msg;
    switch (postMessage.type) {
        case "text":
            msg = {
                "type": "text",
                "text": "鸚鵡返し: " + postMessage.text,
            }
            break;
        case "image":
        case "video":
        case "audio":
        case "file":
        case "location":
            msg = {
                "type": "text",
                "text": "ごめんなさい。よくわかんないです。",
            }
            break;
        case "sticker":
            msg = {
                "type": "text",
                "text": "スタンプありがとう",
            }
            break;
        default:
    }
    messages.push(msg);

    // 返信処理
    try {
        await replyMessage(ACCESS_TOKEN, replyToken, messages);
    } catch(err) {
        handleError(err, "replyMessage exception occured");
    }
};

async function sendLinkMessage(replyToken, linkToken) {

    // 返信文作成
    let messages = [];
    let msg = {
        "type": "template",
        "altText": "Account Link",
        "template": {
            "type": "buttons",
            "text": "アカウントの連携",
            "actions": [{
                "type": "uri",
                "label": "アカウント連携",
                "uri": MY_LOGIN_URL + "?" + LINK_TOKEN_PARAM_KEY + "=" + linkToken,
            }],
        },
    };
    messages.push(msg);

    // 返信処理
    try {
        await replyMessage(ACCESS_TOKEN, replyToken, messages);
    } catch(err) {
        handleError(err, "replyMessage exception occured");
    }
}
async function accountLinkingMessage(replyToken, msgText) {
    console.log("completeRegisterMessage start");
    console.log("replyToken: " + JSON.stringify(replyToken));
    
    // 返信文作成
    let messages = [];
    let msg = {
        "type": "text",
        "text": msgText,
    };
    messages.push(msg);

    // 返信処理
    try {
        await replyMessage(ACCESS_TOKEN, replyToken, messages);
    } catch(err) {
        handleError(err, "replyMessage exception occured");
    }
};

async function replyMessage(channelAccessToken, replyToken, messages) {
    const headers = {
        "Content-type": "application/json; charset=UTF-8",
        "Authorization": "Bearer " + channelAccessToken
    };
    const options = {
        url : REPLY_URL,
        method : "POST",
        headers : headers,
        json : {
            "replyToken": replyToken,
            "messages": messages,
        }
    };

    console.log("reply object: " + JSON.stringify(options));

    return request(options)
        .then((body) => {
            console.log("replyMessage success: " + JSON.stringify(body));
            return "finish";
        })
        .catch((err) => {
            console.log("replyMessage result code: " + err.statusCode);
            console.error("replyMessage error: " + JSON.stringify(err));
            throw new Error(err.message);
        });

}

async function requestLinkToken(channelAccessToken, userId) {
    const headers = {
        "Content-type": "application/json; charset=UTF-8",
        "Authorization": "Bearer " + channelAccessToken
    };
    const options = {
        url : LINK_TOKEN_REQUEST_URL + userId + LINK_TOKEN_REQUEST_URL_SUFFIX,
        method : "POST",
        headers : headers,
        json: true,
    };

    console.log("send object: " + JSON.stringify(options));

    return request(options)
        .then((body) => {
            console.log("requestLinkToken success: " + JSON.stringify(body));
            return body.linkToken;
        })
        .catch((err) => {
            console.log("requestLinkToken result code: " + err.statusCode);
            console.error("requestLinkToken error: " + JSON.stringify(err));
            throw new Error(err.message);
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