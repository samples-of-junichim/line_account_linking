# line_account_linking
LINEアカウント連携のサンプル

ブログ記事『LINE Messaging API のアカウント連携を使ってみる』で使ったサンプルコード

https://blog.mori-soft.com/entry/2019/10/17/000520

## フォルダ構成

```
.
├── deployPublic            public フォルダの S3 バケットへのデプロイ用スクリプト
├── lambda                  lambda 関係のファイル
│   ├── bin
│   │   ├── build           zip パッケージの作成スクリプト
│   │   └── deployLambdas   Lambda 関数デプロイ用スクリプト
│   ├── index.js
│   ├── lib
│   │   └── dbaccess.js
│   ├── lineLinking.js
│   ├── package-lock.json
│   ├── package.json
│   └── proxy.js
├── public                  独自アカウント用ログイン画面のhtml/js/css ファイル
│   ├── app.js
│   ├── index.html
│   └── mycss.css
├── run.sh
└── setup_lib               public/lib 設定用スクリプト
```

## 使い方

```bash
git clone
./setup_lib
cd lambda
npm install
```

デプロイ
```bash
lambda/bin/build
lambda/bin/deployLambdas aws_profile_name lambda/archive.zip
deployPublic aws_profile_name
```

