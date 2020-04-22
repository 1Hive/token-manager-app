pragma solidity 0.4.24;

import "../../TokenManagerHook.sol";


contract TokenManagerHookMock is TokenManagerHook {
    uint public id;

    event RegisterHooked(uint indexed _id);
    event RevokeHooked(uint indexed _id);
    event TransferHooked(uint indexed _id, address indexed _from, address indexed _to);
    event ApproveHooked(uint indexed _id);

    constructor(uint _id) public {
        id = _id;
    }

    function _onRegisterAsHook(address, uint256) internal {
        emit RegisterHooked(id);
    }

    function _onRevokeAsHook(address, uint256) internal {
        emit RevokeHooked(id);
    }

    function _onTransfer(address _from, address _to, uint256) internal returns (bool) {
        emit TransferHooked(id, _from, _to);
        return true;
    }

    function _onApprove(address, address, uint) internal returns (bool) {
        emit ApproveHooked(id);
        return true;
    }
}
