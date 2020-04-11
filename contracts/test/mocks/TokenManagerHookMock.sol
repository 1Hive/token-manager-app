pragma solidity 0.4.24;

import "../../TokenManagerHook.sol";


contract TokenManagerHookMock is ITokenManagerHook {
    uint public id;

    event RegisterHooked(uint indexed _id);
    event RevokeHooked(uint indexed _id);
    event TransferHooked(uint indexed _id, address indexed _from, address indexed _to);
    event ApproveHooked(uint indexed _id);
    event AssignVestingHooked(uint indexed _id);
    event VestingRevokeHooked(uint indexed _id);

    constructor(uint _id) public {
        id = _id;
    }

    function onRegisterAsHook(address, uint256) external {
        emit RegisterHooked(id);
    }

    function onRevokeAsHook(address, uint256) external {
        emit RevokeHooked(id);
    }

    function onTransfer(address _from, address _to, uint256) external returns (bool) {
        emit TransferHooked(id, _from, _to);
        return true;
    }

    function onApprove(address, address, uint) external returns (bool) {
        emit ApproveHooked(id);
        return true;
    }

    function onAssignVested(address, uint256) external {
        emit AssignVestingHooked(id);
    }

    function onRevokeVesting(address, uint256) external {
        emit VestingRevokeHooked(id);
    }
}