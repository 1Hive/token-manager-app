# Hooked Token Manager <a href="https://1hive.org/"><img align="right" src=".github/assets/1hive.svg" height="80px" /></a>

1Hive's Tokens app is a fork of [Aragon Token Manager](https://github.com/aragon/aragon-apps/tree/master/apps/token-manager) which is used to manage the supply and distribution of an organization's token.

#### 🐲 Project Stage: Production

The 1Hive Tokens app has been published to `open.aragonpm.eth` on Rinkeby and xDai networks. If you experience any issues or are interested in contributing please see review our [open issues](https://github.com/1hive/token-manager-app/issues).

#### 🚨 Security Review Status: pre-audit

The code in this repository has not been audited.

## How to deploy 1Hive Tokens to an organization

1Hive Tokens has been published to APM on Rinkeby, Polygon, and xDai at `wrappable-hooked-token-manager.open.aragonpm.eth`.

It can be used as a regular Token Manager, but define an extra ROLE (`SET_HOOK_ROLE`), and two new functions (`registerHook(address)` and `revokeHook(uint256)`).

## Contributing

We welcome community contributions!

Please check out our [open Issues](https://github.com/1hive/token-manager-app/issues) to get started.

If you discover something that could potentially impact security, please notify us immediately. The quickest way to reach us is via the #dev channel in our [Discord chat](https://discord.gg/mP75t4n). Just say hi and that you discovered a potential security vulnerability and we'll DM you to discuss details.
