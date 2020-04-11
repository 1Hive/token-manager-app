/*
 * SPDX-License-Identitifer:    GPL-3.0-or-later
 */

pragma solidity 0.4.24;


interface ITokenManagerHook {
    /*
    * @dev Called when this contract has been included as a Token Manager hook
    * @param _tokenManager Token Manager instance that has included the hook
    * @param _hookId The position in which the hook is going to be called
    */
    function onRegisterAsHook(address _tokenManager, uint256 _hookId) external;

    /*
    * @dev Called when this hook is being removed from the Token Manager
    * @param _tokenManager Token Manager that removes the hook
    * @param _hookId The position in which the hook is going to be called
    */
    function onRevokeAsHook(address _tokenManager, uint256 _hookId) external;

    /*
    * @dev Notifies the hook about a token transfer allowing the hook to react if desired
    * @param _from The origin of the transfer
    * @param _to The destination of the transfer
    * @param _amount The amount of the transfer
    */
    function onTransfer(address _from, address _to, uint256 _amount) external returns (bool);

    /*
    * @dev Notifies the hook about an approval allowing the hook to react if desired
    * @param _holder The account that is allowing to spend
    * @param _spender The account that is allowed to spend
    * @param _amount The amount being allowed
    */
    function onApprove(address _holder, address _spender, uint _amount) external returns (bool);

    /*
    * @dev Notifies the hook about a vesting assignation allowing the hook to react if desired
    * @param _receiver The address receiving the tokens
    * @param _vestingId Numeric id of the vesting
    */
    function onAssignVested(address _receiver, uint256 _vestingId) external;

    /*
    * @dev Notifies the hook about a vesting revocation allowing the hook to react if desired
    * @param _holder Address whose vesting to revoke
    * @param _vestingId Numeric id of the vesting
    */
    function onRevokeVesting(address _holder, uint256 _vestingId) external;
}


contract TokenManagerHook {
    function onRegisterAsHook(address _tokenManager, uint256 _hookId) external {
        return;
    }

    function onRevokeAsHook(address _tokenManager, uint256 _hookId) external {
        return;
    }

    function onTransfer(address _from, address _to, uint256) external returns (bool) {
        return true;
    }

    function onApprove(address, address, uint) external returns (bool) {
        return true;
    }

    function onAssignVested(address, uint256) external {
        return;
    }

    function onRevokeVesting(address, uint256) external {
        return;
    }
}