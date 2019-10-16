
'use strict';

// 環境変数
require('dotenv').config();

const lambda = require('./index.js');

// 実行
let event = null;

lambda.handler(event).then((result) => {
	console.log("result: " + result);
});


