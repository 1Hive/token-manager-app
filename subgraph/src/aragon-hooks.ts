import { Address } from "@graphprotocol/graph-ts";
import {
  getTokenManagerEntity,
  processOrphanTokenManagers,
} from "./TokenManager";

/*
 * Called when an app proxy is detected.
 *
 * Return the name of a data source template if you would like to create it for a given appId.
 * Return null otherwise.
 *
 * The returned name is used to instantiate a template declared in the subgraph manifest file,
 * which must have the same name.
 */
export function getTemplateForApp(appId: string): string | null {
  if (
    appId ==
    "0x6b20a3010614eeebf2138ccec99f028a61c811b3b1a3343b6ff635985c75c91f"
  ) {
    return "TokenManager";
  } else if (
    appId ==
    "0xb2d2065b829a91588c8b9a15d99acd026f6673733603c6c60e505654eb2b472d"
  ) {
    // token-manager.1hive.aragonpm.eth (first HookedTokenManager version)
    return "TokenManager";
  } else if (
    appId ==
    "0xb2d2065b829a91588c8b9a15d99acd026f6673733603c6c60e505654eb2b472d"
  ) {
    // hooked-tokenmanager.open.aragonpm.eth (new HookedTokenManager with a controller)
    return "TokenManager";
  } else if (
    appId ==
    "0xa2a1b99c88fa1519d5f1a8efa0c90cfd0e570095d71a4d45850205108a8f9a70"
  ) {
    // hooked-token-manager-no-controller.open.aragonpm.eth (new HookedTokenManager without controller used for disputables & celeste deployment)
    return "TokenManager";
  } else {
    return null;
  }
}

export function onAppTemplateCreated(appAddress: Address, appId: string): void {
  getTokenManagerEntity(appAddress);
  processOrphanTokenManagers();
}

export function onOrgTemplateCreated(orgAddress: Address): void {}

export function onTokenTemplateCreated(tokenAddress: Address): void {}
