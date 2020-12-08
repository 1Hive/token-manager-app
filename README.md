# Tokens <img align="right" src="https://github.com/1Hive/website/blob/master/website/static/img/bee.png" height="80px" />

1Hive's Tokens app is a fork of [Aragon Token Manager](https://github.com/aragon/aragon-apps/tree/master/apps/token-manager) which is used to manage the supply and distribution of an organization's token.

#### 🐲 Project Stage: Production

The 1Hive Tokens app has been published to `open.aragonpm.eth` on Rinkeby and xDai networks. If you experience any issues or are interested in contributing please see review our [open issues](https://github.com/1hive/token-manager-app/issues).

#### 🚨 Security Review Status: pre-audit

The code in this repository has not been audited.

## How to run 1Hive Tokens locally

First make sure that you have node and yarn installed and working. You'll also need to have [Metamask](https://metamask.io) or some kind of web wallet enabled to sign transactions in the browser.

Git clone this repo.

```sh
git clone https://github.com/1Hive/token-manager-app.git
```

Navigate into the `token-manager-app` directory.

```sh
cd token-manager-app
```

Install npm dependencies.

```sh
yarn
```

Start a development version of the Hooked Token Manager with buidler

```sh
yarn start
```

A new tab should appear in your browser. Now, any change in the frontend code or smart contract will automatically be applied.

## How to deploy 1Hive Tokens to an organization

1Hive Tokens has been published to APM on Rinkeby and xDai at `hooked-token-manager.open.aragonpm.eth`.

It can be used as a regular Token Manager, but define an extra ROLE (`SET_HOOK_ROLE`), and two new functions (`registerHook(address)` and `revokeHook(uint256)`).

## Contributing

We welcome community contributions!

Please check out our [open Issues](https://github.com/1hive/token-manager-app/issues) to get started.

If you discover something that could potentially impact security, please notify us immediately. The quickest way to reach us is via the #dev channel in our [Discord chat](https://discord.gg/mP75t4n). Just say hi and that you discovered a potential security vulnerability and we'll DM you to discuss details.
