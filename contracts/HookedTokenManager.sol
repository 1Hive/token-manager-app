/*
 * SPDX-License-Identitifer:    GPL-3.0-or-later
 */

/* solium-disable function-order */

pragma solidity 0.4.24;

import "@aragon/os/contracts/apps/AragonApp.sol";

import "@aragon/os/contracts/lib/math/SafeMath.sol";

import "@aragon/minime/contracts/MiniMeToken.sol";
import "@aragon/minime/contracts/ITokenController.sol";

import "./TokenManagerHook.sol";


contract HookedTokenManager is ITokenController, AragonApp {
    using SafeMath for uint256;

    bytes32 public constant CHANGE_CONTROLLER_ROLE = keccak256("CHANGE_CONTROLLER_ROLE");
    bytes32 public constant MINT_ROLE = keccak256("MINT_ROLE");
    bytes32 public constant ISSUE_ROLE = keccak256("ISSUE_ROLE");
    bytes32 public constant ASSIGN_ROLE = keccak256("ASSIGN_ROLE");
    bytes32 public constant REVOKE_VESTINGS_ROLE = keccak256("REVOKE_VESTINGS_ROLE");
    bytes32 public constant BURN_ROLE = keccak256("BURN_ROLE");
    bytes32 public constant SET_HOOK_ROLE = keccak256("SET_HOOK_ROLE");
    bytes32 public constant WRAP_TOKEN_ROLE = keccak256("WRAP_TOKEN_ROLE");

    uint256 public constant MAX_VESTINGS_PER_ADDRESS = 50;

    string private constant ERROR_CALLER_NOT_TOKEN = "TM_CALLER_NOT_TOKEN";
    string private constant ERROR_NO_VESTING = "TM_NO_VESTING";
    string private constant ERROR_TOKEN_CONTROLLER = "TM_TOKEN_CONTROLLER";
    string private constant ERROR_MINT_RECEIVER_IS_TM = "TM_MINT_RECEIVER_IS_TM";
    string private constant ERROR_VESTING_TO_TM = "TM_VESTING_TO_TM";
    string private constant ERROR_TOO_MANY_VESTINGS = "TM_TOO_MANY_VESTINGS";
    string private constant ERROR_WRONG_CLIFF_DATE = "TM_WRONG_CLIFF_DATE";
    string private constant ERROR_VESTING_NOT_REVOKABLE = "TM_VESTING_NOT_REVOKABLE";
    string private constant ERROR_REVOKE_TRANSFER_FROM_REVERTED = "TM_REVOKE_TRANSFER_FROM_REVERTED";
    string private constant ERROR_NO_WRAPPABLE_TOKEN = "TM_NO_WRAPPABLE_TOKEN";
    string private constant ERROR_SAFE_TRANSFER_FAILED = "TM_SAFE_TRANSFER_FAILED";
    string private constant ERROR_BALANCE_INCREASE_NOT_ALLOWED = "TM_BALANCE_INC_NOT_ALLOWED";
    string private constant ERROR_ASSIGN_TRANSFER_FROM_REVERTED = "TM_ASSIGN_TRANSFER_FROM_REVERTED";

    struct TokenVesting {
        uint256 amount;
        uint64 start;
        uint64 cliff;
        uint64 vesting;
        bool revokable;
    }

    // Note that we COMPLETELY trust this MiniMeToken to not be malicious for proper operation of this contract
    MiniMeToken public token;
    ERC20 public wrappableToken;
    uint256 public maxAccountTokens;

    // We are mimicing an array in the inner mapping, we use a mapping instead to make app upgrade more graceful
    mapping (address => mapping (uint256 => TokenVesting)) internal vestings;
    mapping (address => uint256) public vestingsLengths;

    mapping (uint256 => TokenManagerHook) public hooks;
    uint256 public hooksLength;

    // Other token specific events can be watched on the token address directly (avoids duplication)
    event TokenManagerInitialized(address token, address wrappableToken);
    event NewVesting(address indexed receiver, uint256 vestingId, uint256 amount);
    event RevokeVesting(address indexed receiver, uint256 vestingId, uint256 nonVestedAmount);

    modifier onlyToken() {
        require(msg.sender == address(token), ERROR_CALLER_NOT_TOKEN);
        _;
    }

    modifier vestingExists(address _holder, uint256 _vestingId) {
        // TODO: it's not checking for gaps that may appear because of deletes in revokeVesting function
        require(_vestingId < vestingsLengths[_holder], ERROR_NO_VESTING);
        _;
    }

    /**
    * @notice Initialize Token Manager for `_token.symbol(): string`, whose tokens are `_transferable ? '' : 'not'` transferable`_maxAccountTokens > 0 ? ' and limited to a maximum of ' + @tokenAmount(_token, _maxAccountTokens, false) + ' per account' : ''`
    * @param _token MiniMeToken address for the managed token (Token Manager instance must be already set as the token controller)
    * @param _wrappableToken Token which can be wrapped/unwrapped to generate an equal number of the MiniMeToken. Set to address(0) to disable.
    * @param _transferable whether the token can be transferred by holders
    * @param _maxAccountTokens Maximum amount of tokens an account can have (0 for infinite tokens)
    */
    function initialize(
        MiniMeToken _token,
        ERC20 _wrappableToken,
        bool _transferable,
        uint256 _maxAccountTokens
    )
        external
        onlyInit
    {
        initialized();

        require(_token.controller() == address(this), ERROR_TOKEN_CONTROLLER);

        token = _token;
        wrappableToken = _wrappableToken;
        maxAccountTokens = _maxAccountTokens == 0 ? uint256(-1) : _maxAccountTokens;

        if (token.transfersEnabled() != _transferable) {
            token.enableTransfers(_transferable);
        }

        emit TokenManagerInitialized(_token, _wrappableToken);
    }

    /**
    * @notice Change the token controller to `_newController`
    * @param _newController Address to transfer control of the token
    */
    function changeTokenController(address _newController) external authP(CHANGE_CONTROLLER_ROLE, arr(_newController)) {
        token.changeController(_newController);
    }

    /**
    * @notice Create a new Token Manager hook for `_hook`
    * @param _hook Contract that will be used as Token Manager hook
    */
    function registerHook(address _hook) external authP(SET_HOOK_ROLE, arr(_hook)) returns (uint256) {
        uint256 hookId = hooksLength++;
        hooks[hookId] = TokenManagerHook(_hook);
        hooks[hookId].onRegisterAsHook(hookId, token);
        return hookId;
    }

    /**
    * @notice Revoke Token Manager hook #`_hookId`
    * @param _hookId Position of the hook to be removed
    */
    function revokeHook(uint256 _hookId) external authP(SET_HOOK_ROLE, arr(_hookId)) {
        hooks[_hookId].onRevokeAsHook(_hookId, token);
        delete hooks[_hookId];
    }

    /**
    * @notice Mint `@tokenAmount(self.token(): address, _amount, false)` tokens for `_receiver`
    * @param _receiver The address receiving the tokens, cannot be the Token Manager itself (use `issue()` instead)
    * @param _amount Number of tokens minted
    */
    function mint(address _receiver, uint256 _amount) external authP(MINT_ROLE, arr(_receiver, _amount)) {
        require(_receiver != address(this), ERROR_MINT_RECEIVER_IS_TM);
        _mint(_receiver, _amount);
    }

    /**
    * @notice Mint `@tokenAmount(self.token(): address, _amount, false)` tokens for the Token Manager
    * @param _amount Number of tokens minted
    */
    function issue(uint256 _amount) external authP(ISSUE_ROLE, arr(_amount)) {
        _mint(address(this), _amount);
    }

    /**
    * @notice Assign `@tokenAmount(self.token(): address, _amount, false)` tokens to `_receiver` from the Token Manager's holdings
    * @param _receiver The address receiving the tokens
    * @param _amount Number of tokens transferred
    */
    function assign(address _receiver, uint256 _amount) external authP(ASSIGN_ROLE, arr(_receiver, _amount)) {
        _assign(_receiver, _amount);
    }

    /**
    * @notice Burn `@tokenAmount(self.token(): address, _amount, false)` tokens from `_holder`
    * @param _holder Holder of tokens being burned
    * @param _amount Number of tokens being burned
    */
    function burn(address _holder, uint256 _amount) external authP(BURN_ROLE, arr(_holder, _amount)) {
        _burn(_holder, _amount);
    }

    /**
    * @notice Assign `@tokenAmount(self.token(): address, _amount, false)` tokens to `_receiver` from the Token Manager's holdings with a `_revokable ? 'revokable' : ''` vesting starting at `@formatDate(_start)`, cliff at `@formatDate(_cliff)` (first portion of tokens transferable), and completed vesting at `@formatDate(_vested)` (all tokens transferable)
    * @param _receiver The address receiving the tokens, cannot be Token Manager itself
    * @param _amount Number of tokens vested
    * @param _start Date the vesting calculations start
    * @param _cliff Date when the initial portion of tokens are transferable
    * @param _vested Date when all tokens are transferable
    * @param _revokable Whether the vesting can be revoked by the Token Manager
    */
    function assignVested(
        address _receiver,
        uint256 _amount,
        uint64 _start,
        uint64 _cliff,
        uint64 _vested,
        bool _revokable
    )
        external
        authP(ASSIGN_ROLE, arr(_receiver, _amount))
        returns (uint256)
    {
        require(_receiver != address(this), ERROR_VESTING_TO_TM);
        require(vestingsLengths[_receiver] < MAX_VESTINGS_PER_ADDRESS, ERROR_TOO_MANY_VESTINGS);
        require(_start <= _cliff && _cliff <= _vested, ERROR_WRONG_CLIFF_DATE);

        uint256 vestingId = vestingsLengths[_receiver]++;
        vestings[_receiver][vestingId] = TokenVesting(
            _amount,
            _start,
            _cliff,
            _vested,
            _revokable
        );

        _assign(_receiver, _amount);

        emit NewVesting(_receiver, vestingId, _amount);

        return vestingId;
    }

    /**
    * @notice Revoke vesting #`_vestingId` from `_holder`, returning unvested tokens to the Token Manager
    * @param _holder Address whose vesting to revoke
    * @param _vestingId Numeric id of the vesting
    */
    function revokeVesting(address _holder, uint256 _vestingId)
        external
        authP(REVOKE_VESTINGS_ROLE, arr(_holder))
        vestingExists(_holder, _vestingId)
    {
        TokenVesting storage v = vestings[_holder][_vestingId];
        require(v.revokable, ERROR_VESTING_NOT_REVOKABLE);

        uint256 nonVested = _calculateNonVestedTokens(
            v.amount,
            getTimestamp(),
            v.start,
            v.cliff,
            v.vesting
        );

        // To make vestingIds immutable over time, we just zero out the revoked vesting
        // Clearing this out also allows the token transfer back to the Token Manager to succeed
        delete vestings[_holder][_vestingId];

        // transferFrom always works as controller
        // onTransfer hook always allows if transfering to token controller
        require(token.transferFrom(_holder, address(this), nonVested), ERROR_REVOKE_TRANSFER_FROM_REVERTED);

        emit RevokeVesting(_holder, _vestingId, nonVested);
    }

    /**
    * @notice Wrap @tokenAmount(self.wrappableToken(): address, _amount, false) to receive @tokenAmount(self.token(): address, _amount, false)
    * @param _amount Amount of tokens to wrap
    */
    function wrap(uint256 _amount) external authP(WRAP_TOKEN_ROLE, arr(msg.sender)) {
        require(wrappableToken != address(0), ERROR_NO_WRAPPABLE_TOKEN);
        require(msg.sender != address(this), ERROR_MINT_RECEIVER_IS_TM);

        require(wrappableToken.safeTransferFrom(msg.sender, address(this), _amount), ERROR_SAFE_TRANSFER_FAILED);
        _mint(msg.sender, _amount);
    }

    /**
    * @notice Unwrap @tokenAmount(self.token(): address, _amount, false) to receive @tokenAmount(self.wrappableToken(): address, _amount, false)
    * @param _amount Amount of tokens to unwrap
    */
    function unwrap(uint256 _amount) external isInitialized {
        require(wrappableToken != address(0), ERROR_NO_WRAPPABLE_TOKEN);
        require(msg.sender != address(this), ERROR_MINT_RECEIVER_IS_TM);

        _burn(msg.sender, _amount);
        require(wrappableToken.safeTransfer(msg.sender, _amount), ERROR_SAFE_TRANSFER_FAILED);
    }

    // ITokenController fns
    // `onTransfer()`, `onApprove()`, and `proxyPayment()` are callbacks from the MiniMe token
    // contract and are only meant to be called through the managed MiniMe token that gets assigned
    // during initialization.

    /*
    * @dev Notifies the controller about a token transfer allowing the controller to decide whether
    *      to allow it or react if desired (only callable from the token).
    *      Initialization check is implicitly provided by `onlyToken()`.
    * @param _from The origin of the transfer
    * @param _to The destination of the transfer
    * @param _amount The amount of the transfer
    * @return False if the controller does not authorize the transfer
    */
    function onTransfer(address _from, address _to, uint256 _amount) external onlyToken returns (bool) {
        if (_isBalanceIncreaseAllowed(_to, _amount) && _transferableBalance(_from, getTimestamp()) >= _amount) {
            return _triggerOnTransferHook(_from, _to, _amount);
        }
        return false;
    }

    /**
    * @dev Notifies the controller about an approval allowing the controller to react if desired
    *      Initialization check is implicitly provided by `onlyToken()`.
    * @return False if the controller does not authorize the approval
    */
    function onApprove(address _holder, address _spender, uint _amount) external onlyToken returns (bool) {
        return _triggerOnApproveHook(_holder, _spender, _amount);
    }

    /**
    * @dev Called when ether is sent to the MiniMe Token contract
    *      Initialization check is implicitly provided by `onlyToken()`.
    * @return True if the ether is accepted, false for it to throw
    */
    function proxyPayment(address) external payable onlyToken returns (bool) {
        return false;
    }

    // Getter fns

    function getVesting(
        address _recipient,
        uint256 _vestingId
    )
        public
        view
        vestingExists(_recipient, _vestingId)
        returns (
            uint256 amount,
            uint64 start,
            uint64 cliff,
            uint64 vesting,
            bool revokable
        )
    {
        TokenVesting storage tokenVesting = vestings[_recipient][_vestingId];
        amount = tokenVesting.amount;
        start = tokenVesting.start;
        cliff = tokenVesting.cliff;
        vesting = tokenVesting.vesting;
        revokable = tokenVesting.revokable;
    }

    function spendableBalanceOf(address _holder) public view isInitialized returns (uint256) {
        return _transferableBalance(_holder, getTimestamp());
    }

    function transferableBalance(address _holder, uint256 _time) public view isInitialized returns (uint256) {
        return _transferableBalance(_holder, _time);
    }

    /**
    * @dev Disable recovery escape hatch for own token,
    *      as the it has the concept of issuing tokens without assigning them
    */
    function allowRecoverability(address _token) public view returns (bool) {
        return _token == ETH || (_token != address(token) && _token != address(wrappableToken));
    }

    // Internal fns

    function _assign(address _receiver, uint256 _amount) internal {
        require(_isBalanceIncreaseAllowed(_receiver, _amount), ERROR_BALANCE_INCREASE_NOT_ALLOWED);
        // Must use transferFrom() as transfer() does not give the token controller full control
        require(token.transferFrom(address(this), _receiver, _amount), ERROR_ASSIGN_TRANSFER_FROM_REVERTED);
    }

    function _mint(address _receiver, uint256 _amount) internal {
        require(_isBalanceIncreaseAllowed(_receiver, _amount), ERROR_BALANCE_INCREASE_NOT_ALLOWED);
        _triggerOnTransferHook(0x0, _receiver, _amount);
        token.generateTokens(_receiver, _amount); // minime.generateTokens() never returns false
    }

    function _burn(address _holder, uint256 _amount) internal {
        _triggerOnTransferHook(_holder, 0x0, _amount);
        // minime.destroyTokens() never returns false, only reverts on failure
        token.destroyTokens(_holder, _amount);
    }

    function _isBalanceIncreaseAllowed(address _receiver, uint256 _inc) internal view returns (bool) {
        // Max balance doesn't apply to the token manager itself
        if (_receiver == address(this)) {
            return true;
        }
        return token.balanceOf(_receiver).add(_inc) <= maxAccountTokens;
    }

    /**
    * @dev Calculate amount of non-vested tokens at a specifc time
    * @param tokens The total amount of tokens vested
    * @param time The time at which to check
    * @param start The date vesting started
    * @param cliff The cliff period
    * @param vested The fully vested date
    * @return The amount of non-vested tokens of a specific grant
    *  transferableTokens
    *   |                         _/--------   vestedTokens rect
    *   |                       _/
    *   |                     _/
    *   |                   _/
    *   |                 _/
    *   |                /
    *   |              .|
    *   |            .  |
    *   |          .    |
    *   |        .      |
    *   |      .        |
    *   |    .          |
    *   +===+===========+---------+----------> time
    *      Start       Cliff    Vested
    */
    function _calculateNonVestedTokens(
        uint256 tokens,
        uint256 time,
        uint256 start,
        uint256 cliff,
        uint256 vested
    )
        private
        pure
        returns (uint256)
    {
        // Shortcuts for before cliff and after vested cases.
        if (time >= vested) {
            return 0;
        }
        if (time < cliff) {
            return tokens;
        }

        // Interpolate all vested tokens.
        // As before cliff the shortcut returns 0, we can just calculate a value
        // in the vesting rect (as shown in above's figure)

        // vestedTokens = tokens * (time - start) / (vested - start)
        // In assignVesting we enforce start <= cliff <= vested
        // Here we shortcut time >= vested and time < cliff,
        // so no division by 0 is possible
        uint256 vestedTokens = tokens.mul(time.sub(start)) / vested.sub(start);

        // tokens - vestedTokens
        return tokens.sub(vestedTokens);
    }

    function _transferableBalance(address _holder, uint256 _time) internal view returns (uint256) {
        uint256 transferable = token.balanceOf(_holder);

        // This check is not strictly necessary for the current version of this contract, as
        // Token Managers now cannot assign vestings to themselves.
        // However, this was a possibility in the past, so in case there were vestings assigned to
        // themselves, this will still return the correct value (entire balance, as the Token
        // Manager does not have a spending limit on its own balance).
        if (_holder != address(this)) {
            uint256 vestingsCount = vestingsLengths[_holder];
            for (uint256 i = 0; i < vestingsCount; i++) {
                TokenVesting storage v = vestings[_holder][i];
                uint256 nonTransferable = _calculateNonVestedTokens(
                    v.amount,
                    _time,
                    v.start,
                    v.cliff,
                    v.vesting
                );
                transferable = transferable.sub(nonTransferable);
            }
        }

        return transferable;
    }

    function _triggerOnApproveHook(address _holder, address _spender, uint _amount) internal returns (bool approved) {
        approved = true;
        uint256 i = 0;
        while (approved && i < hooksLength) {
            if (address(hooks[i]) != 0) {
                approved = hooks[i].onApprove(_holder, _spender, _amount);
            }
            i++;
        }
    }

    function _triggerOnTransferHook(address _from, address _to, uint256 _amount) internal returns (bool transferable) {
        transferable = true;
        uint256 i = 0;
        while (transferable && i < hooksLength) {
            if (address(hooks[i]) != 0) {
                transferable = hooks[i].onTransfer(_from, _to, _amount);
            }
            i++;
        }
    }
}
