'use strict';
let lineln = {};

lineln.poolData = {
    UserPoolId: 'ユーザープールID',
    ClientId: 'アプリクライアントID',
    Storage: sessionStorage
};
lineln.UserPool = new AmazonCognitoIdentity.CognitoUserPool(lineln.poolData);
lineln.ShaObject = new jsSHA("SHA-256", "TEXT");

lineln.DELAY_TIME = 3000; // 自動遷移時の遅延時間 (ms)
lineln.KEY_USERNAME = "username";
lineln.KEY_SESSIONE = "session";
lineln.KEY_LINKTOKEN = "linkToken";

lineln.PRE_REGISTER_URL = "https://ノンス登録用URL";


lineln.login = function() {
    let username = $('.inputUserName').val();
    let password = $('.inputPassword').val();
    if (!username | !password) {
        lineln.showMessage("ユーザー名およびパスワードを入力してください");
        return false;
    }

    let authenticationData = {
        Username: username,
        Password: password
    };
    let authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);

    let userData = {
        Username: username,
        Pool: lineln.UserPool,
        Storage: lineln.poolData.Storage
    };

    let cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
    cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: function(result) {
            // リダイレクト先にユーザー名とセッション情報を渡す
            lineln.poolData.Storage.setItem(lineln.KEY_USERNAME, username);
            lineln.poolData.Storage.setItem(lineln.KEY_SESSION, cognitoUser.Session);

            lineln.backToLine();
        },
        onFailure: function(err) {
            console.log(err);
            let message_text = err.message;
            lineln.showMessage(message_text);
        },
        newPasswordRequired: function(userAttributes, requiredAttributes) {
            console.log("transit to new password challenge");
            console.log("userAttributes: " + JSON.stringify(userAttributes));
            console.log("requiredAttributes: " + JSON.stringify(requiredAttributes));
    
            // リダイレクト先にユーザー名とセッション情報を渡す
            lineln.poolData.Storage.setItem(lineln.KEY_USERNAME, userAttributes.email);
            lineln.poolData.Storage.setItem(lineln.KEY_SESSION, cognitoUser.Session);

           $(location).attr('href', '#challenge');
        }
    });
};

lineln.challenge = function() {
    let newPassword = $('.inputNewPassword').val();
    let passwordConfirm = $('.inputNewPasswordConfirm').val();
    if (!newPassword | !passwordConfirm) {
        lineln.showMessage("パスワードを入力してください");
        return false;
    }
    if (newPassword != passwordConfirm) {
        lineln.showMessage("パスワードが一致しません");
        return false;
    }

    // パラメータの取得
    let param = $(location).attr('search');
    console.log('param   : ' + param);

    let username = lineln.poolData.Storage.getItem(lineln.KEY_USERNAME);
    if (! username) {
        lineln.showMessage("ユーザー名が不明です。再度ログインからやり直してください。");
        lineln.storageClear();
        lineln.transitDelay('#login', lineln.DELAY_TIME);
        return false;
    }
    let session = lineln.poolData.Storage.getItem(lineln.KEY_SESSION);
    if (! session) {
        lineln.showMessage("セッション情報が不明です。再度ログインからやり直してください。");
        lineln.storageClear();
        lineln.transitDelay('#login', lineln.DELAY_TIME);
        return false;
    }

    let userData = {
        Username: username,
        Pool: lineln.UserPool,
        Storage: lineln.poolData.Storage
    };

    let cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
    cognitoUser.Session = session;
    cognitoUser.completeNewPasswordChallenge(newPassword, {}, {
        onSuccess: function(result) {
            lineln.backToLine();
        },
        onFailure: function(err) {
            console.log(err);
            let message_text = err.message;
            lineln.showMessage(message_text);
        }
    });
};

lineln.backToLine = async function() {
    let username = lineln.poolData.Storage.getItem(lineln.KEY_USERNAME);
    lineln.ShaObject.update(username); // TODO 日付も追加?
    let nonce = lineln.ShaObject.getHash("HEX");

    console.log("nonce: " + nonce);

    // Dynamo DB に email と ノンスを記述
    try {
        await lineln.preRegister(username, nonce);
    } catch(err) {
        console.error("backToLine error: " + JSON.stringify(err));
        lineln.handleError(err);
    }

    // 呼び出し元が LINE かそれ以外かで分ける
    let token = lineln.poolData.Storage.getItem(lineln.KEY_LINKTOKEN);
    if (token) {
        $(location).attr('href', 'https://access.line.me/dialog/bot/accountLink?linkToken=' + token + "&nonce=" + nonce);
    } else {
        $(location).attr('href', 'https://www.mori-soft.com');
    }

};

lineln.getAuthorizedUser = async function() {
    return new Promise(function(resolve, reject) {
        let cognitoUser = lineln.UserPool.getCurrentUser();
        if (cognitoUser != null) {
            cognitoUser.getSession(function (err, sessionResult) {
                if (err || !sessionResult) {
                    console.log("session is invalid");
                    reject("session is invalid");
                } else {
                    resolve(cognitoUser);
                }
            });
        } else {
            console.log("no user");            
            reject("no user");
        }
    });
};
lineln.getSessionIdToken = async function() {
    let cognitouser;
    try {
        cognitouser = await lineln.getAuthorizedUser();
    }
    catch(err) {
        console.log("getSessionIdToken error: " + JSON.stringify(err));
        lineln.handleError(err);
    }
    return cognitouser.signInUserSession.getIdToken().getJwtToken();
};

lineln.preRegister = async function(email, nonce) {
    try {
        let idToken;
        idToken = await lineln.getSessionIdToken();
        await lineln.preRegisterToDynamo(idToken, email, nonce);
    }
    catch(err) {
        console.error("preRegister error: " + JSON.stringify(err));
        lineln.handleError(err);
    }
    console.log("success pre-register to Dynamo");
};
    
lineln.preRegisterToDynamo = async function (idToken, email, nonce) {
    let data = {
        "nonce" : nonce,
        "email" : email,
    };
    return new Promise(function(resolve, reject){
        $.ajax(
            lineln.PRE_REGISTER_URL,
            {
                type: 'POST',
                contentType: 'application/json',
                headers: {
                    Authorization: idToken
                },
                async: false,
                cache: false,
                data : JSON.stringify(data),
            }
        )
        .done(function(data) {
            console.log(JSON.stringify(data));
            resolve(data);
        })
        .fail(function(e) {
            console.log("failed to call api: " + JSON.stringify(e));
            reject(e);
        });
    });
};

lineln.storageClear = function(param) {
    lineln.poolData.Storage.removeItem(lineln.KEY_USERNAME);
    lineln.poolData.Storage.removeItem(lineln.KEY_SESSION);
};

lineln.reset = function() {
    let username = $('.inputUserName').val();
    if (!username) {
        lineln.showMessage("ユーザー名を入力してください")
        return false;
    }

    let userData = {
        Username: username,
        Pool: lineln.UserPool,
        Storage: lineln.poolData.Storage
    };

    let cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);
    cognitoUser.forgotPassword({
        onSuccess: function(data) {
            console.log('password reset success, data:' + data);
            lineln.showMessage("パスワードのリセットに成功しました");
            lineln.transitDelay('#login', lineln.DELAY_TIME);
        },
        onFailure: function(err) {
            console.log(err);
            lineln.showMessage(err.message);
        },
        inputVerificationCode: function(data) {
            console.log('password reset code send to: ' + userData.Username + ", " + data.CodeDeliveryDetails.Destination);
            let verificationCode = prompt('メールに記載のパスワードリセット用のコードを入力してください');
            if (!verificationCode) {
                this.onFailure('キャンセルしました');
                return;
            }
            let newPassword = prompt('新しいパスワードを入力してください');
            if (!newPassword) {
                this.onFailure('キャンセルしました');
                return;
            }
            cognitoUser.confirmPassword(verificationCode, newPassword, this);
        }
    });
};

lineln.logout = function() {
    let cognitoUser = lineln.UserPool.getCurrentUser();
    if (cognitoUser != null) {
        cognitoUser.signOut();
        location.reload;
    }
};

// 一定時間後に遷移
lineln.transitDelay = function(url_str, delay) {
    setTimeout(function() {
        $(location).attr('href', url_str);
    }, delay);
};

// エフェクト
lineln.flashElement = function(elem, content) {
    elem.fadeOut('fast', function() {
        elem.html(content);
        elem.fadeIn();
    })
};

// ビュー
lineln.createViewFromTemplate = function(view_name) {
    return $('#templates .' + view_name).clone();
};
lineln.loginView = function() {
    let v = lineln.createViewFromTemplate('login-view');
    v.find('.loginButton').click(lineln.login);
    return v;
};
lineln.newPasswordChallengeView = function() {
    let v = lineln.createViewFromTemplate('new-password-challenge-view');
    v.find('.challengeButton').click(lineln.challenge);
    return v;
};
lineln.passwdResetView = function() {
    let v = lineln.createViewFromTemplate('password-reset-view');
    v.find('.resetButton').click(lineln.reset);
    return v;
};
lineln.landingView = function() {
    let v = lineln.createViewFromTemplate('landing-view');
    return v;
}

// エラーメッセージ
lineln.showMessage = function(msg) {
    let v = $('#contents .message');
    if (v.length != 0) {
        v.show();
        lineln.flashElement(v, msg);
    }
};

// ルート設定
lineln.routes = {
    '#login'     : lineln.loginView,
    '#challenge' : lineln.newPasswordChallengeView,
    '#reset'     : lineln.passwdResetView,
    '#logout'    : lineln.logout,
    '#landing'   : lineln.landingView,
    '#'          : lineln.landingView,
    ''           : lineln.landingView
};
lineln.showView = function(hash) {
    let viewCreater = lineln.routes[hash];
    if (viewCreater) {
        $('#contents').empty().append(viewCreater(hash));
    }
};

lineln.getLinkToken = function(param) {
    let matchedArray = param.match(/linkToken=(.*?)(&|$)/);
    if (!matchedArray) {
        console.log("linkToken no match");
        return false;
    }
    console.log('linkToken matchedArray: ' + JSON.stringify(matchedArray));

    let token = matchedArray[1];
    if (! token) {
        console.log("no linkToken");
        return false;
    }
    console.log('linkToken: ' + token);
    return token;
}

lineln.startApp = function() {
    // 表示時のリクエストパラメータを保存
    let token = lineln.getLinkToken(window.location.search);
    if (token) {
        lineln.poolData.Storage.setItem(lineln.KEY_LINKTOKEN, token);
    } else {
        lineln.poolData.Storage.removeItem(lineln.KEY_LINKTOKEN);
    }

    window.onhashchange = function() {
        lineln.showView(window.location.hash);
    };
    lineln.showView(window.location.hash);
};

lineln.handleError = function(err, base_message) {
    if (!base_message) {
        base_message = "(no message)";
    }
    if (err instanceof Error) {
        console.error(base_message + ": " + err.name + ", " + err.message);
        throw err;
    } else {
        console.error(base_message + ": " + JSON.stringify(err));
        throw new Error(JSON.stringify(err));
    }
}