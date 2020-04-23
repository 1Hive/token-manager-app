pragma solidity 0.4.24;

import "../../HookedTokenManager.sol";
import "@aragon/test-helpers/contracts/TimeHelpersMock.sol";


/* solium-disable-next-line no-empty-blocks */
contract TokenManagerMock is HookedTokenManager, TimeHelpersMock {}
