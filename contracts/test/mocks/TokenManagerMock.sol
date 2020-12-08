pragma solidity 0.4.24;

import "../../HookedTokenManager.sol";
import "@aragon/contract-helpers-test/contracts/0.4/aragonOS/TimeHelpersMock.sol";


/* solium-disable-next-line no-empty-blocks */
contract TokenManagerMock is HookedTokenManager, TimeHelpersMock {}
