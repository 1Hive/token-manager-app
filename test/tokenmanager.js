const ERRORS = require('./helpers/errors')
const { assertRevert } = require("./helpers/assertThrow");
const { assertBn } = require('@aragon/contract-helpers-test/src/asserts')
const { getTopicArgument, getTopicArgumentAsAddr } = require('./helpers/topics')
const { ZERO_ADDRESS } = require('@aragon/contract-helpers-test')
const { ANY_ENTITY, newDao, installNewApp, encodeCallScript, createEqOraclePermissionParam } = require('@aragon/contract-helpers-test/src/aragon-os')
const { assert } = require('chai');
const { artifacts } = require('hardhat');

const TokenManager = artifacts.require('TokenManagerMock')
const ExecutionTarget = artifacts.require('ExecutionTarget')
const MiniMeToken = artifacts.require('MiniMeToken')
const TokenManagerHook = artifacts.require('TokenManagerHookMock')
const ACLOracleMock = artifacts.require('ACLOracleMock')

contract('Token Manager', ([root, holder, holder2, anyone]) => {
  let dao, acl, tokenManagerBase, tokenManager, token
  let MINT_ROLE, ISSUE_ROLE, ASSIGN_ROLE, REVOKE_VESTINGS_ROLE, BURN_ROLE, SET_HOOK_ROLE, CHANGE_CONTROLLER_ROLE, WRAP_TOKEN_ROLE

  const NOW = 1
  const ETH = ZERO_ADDRESS
  const APP_ID = '0x1234123412341234123412341234123412341234123412341234123412341234'

  before('load roles', async () => {
    tokenManagerBase = await TokenManager.new()
    MINT_ROLE = await tokenManagerBase.MINT_ROLE()
    ISSUE_ROLE = await tokenManagerBase.ISSUE_ROLE()
    ASSIGN_ROLE = await tokenManagerBase.ASSIGN_ROLE()
    REVOKE_VESTINGS_ROLE = await tokenManagerBase.REVOKE_VESTINGS_ROLE()
    BURN_ROLE = await tokenManagerBase.BURN_ROLE()
    SET_HOOK_ROLE = await tokenManagerBase.SET_HOOK_ROLE()
    CHANGE_CONTROLLER_ROLE = await tokenManagerBase.CHANGE_CONTROLLER_ROLE()
    WRAP_TOKEN_ROLE = await tokenManagerBase.WRAP_TOKEN_ROLE()
  })

  beforeEach('deploy DAO with token manager', async () => {
    ({ dao, acl } = await newDao(root))
    tokenManager = await TokenManager.at(await installNewApp(dao, APP_ID, tokenManagerBase.address, root))

    tokenManager.mockSetTimestamp(NOW)

    await acl.createPermission(ANY_ENTITY, tokenManager.address, MINT_ROLE, root, { from: root })
    await acl.createPermission(ANY_ENTITY, tokenManager.address, ISSUE_ROLE, root, { from: root })
    await acl.createPermission(ANY_ENTITY, tokenManager.address, ASSIGN_ROLE, root, { from: root })
    await acl.createPermission(ANY_ENTITY, tokenManager.address, REVOKE_VESTINGS_ROLE, root, { from: root })
    await acl.createPermission(ANY_ENTITY, tokenManager.address, BURN_ROLE, root, { from: root })
    await acl.createPermission(ANY_ENTITY, tokenManager.address, SET_HOOK_ROLE, root, { from: root })
    await acl.createPermission(ANY_ENTITY, tokenManager.address, CHANGE_CONTROLLER_ROLE, root, { from: root })
    await acl.createPermission(ANY_ENTITY, tokenManager.address, WRAP_TOKEN_ROLE, root, { from: root })

    token = await MiniMeToken.new(ZERO_ADDRESS, ZERO_ADDRESS, 0, 'n', 0, 'n', true)
  })

  it('initializing as transferable sets the token as transferable', async () => {
    const transferable = true
    await token.enableTransfers(!transferable)

    await token.changeController(tokenManager.address)
    await tokenManager.initialize(token.address, ZERO_ADDRESS, transferable, 0)
    assert.equal(transferable, await token.transfersEnabled())
  })

  it('initializing as non-transferable sets the token as non-transferable', async () => {
    const transferable = false
    await token.enableTransfers(!transferable)

    await token.changeController(tokenManager.address)
    await tokenManager.initialize(token.address, ZERO_ADDRESS, transferable, 0)
    assert.equal(transferable, await token.transfersEnabled())
  })

  it('fails when initializing without setting controller', async () => {
    await assertRevert(tokenManager.initialize(token.address, ZERO_ADDRESS, true, 0), ERRORS.TM_TOKEN_CONTROLLER)
  })

  it('fails when sending ether to token', async () => {
    await assertRevert(token.send(1)) // transfer 1 wei to token contract
  })

  context('setting a wrappableToken', async () => {
    context('when setting wrappableToken to zero address', async () => {
      beforeEach(async () => {
        await token.changeController(tokenManager.address)
        await tokenManager.initialize(token.address, ZERO_ADDRESS, true, 0)
      })

      it('wrap fails', async () => {
        await assertRevert(tokenManager.wrap(1), "TM_NO_WRAPPABLE_TOKEN")
      })

      it('unwrap fails', async () => {
        await assertRevert(tokenManager.unwrap(1), "TM_NO_WRAPPABLE_TOKEN")
      })
    })

    context('when setting wrappableToken', async () => {

      let wrappableToken
      const wrappableTokenBalance = 1000

      beforeEach(async () => {
        wrappableToken = await MiniMeToken.new(ZERO_ADDRESS, ZERO_ADDRESS, 0, 'n', 0, 'n', true)
        await wrappableToken.generateTokens(root, wrappableTokenBalance)
        await token.changeController(tokenManager.address)
        await tokenManager.initialize(token.address, wrappableToken.address, true, 0)
      })

      it('wrap is successful', async () => {
        const wrapAmount = 400
        await wrappableToken.approve(tokenManager.address, wrappableTokenBalance)

        await tokenManager.wrap(wrapAmount)

        assert.equal(await token.balanceOf(root), wrapAmount, "Incorrect native token balance")
        assert.equal(await wrappableToken.balanceOf(root), wrappableTokenBalance - wrapAmount, "Incorrect wrappable token balance")
      })

      it('unwrap is successful', async () => {
        const wrapAmount = 400
        const unwrapAmount = 300
        await wrappableToken.approve(tokenManager.address, wrappableTokenBalance)
        await tokenManager.wrap(wrapAmount)

        await tokenManager.unwrap(unwrapAmount)

        assert.equal(await token.balanceOf(root), wrapAmount - unwrapAmount, "Incorrect native token balance")
        assert.equal(await wrappableToken.balanceOf(root), wrappableTokenBalance - wrapAmount + unwrapAmount, "Incorrect wrappable token balance")
      })

      it('wrap reverts when wrapping more than available', async () => {
        const wrapAmount = wrappableTokenBalance + 1
        await wrappableToken.approve(tokenManager.address, wrapAmount)

        await assertRevert(tokenManager.wrap(wrapAmount), "TM_SAFE_TRANSFER_FAILED")
      })

      it('unwrap reverts when unwrapping more than available', async () => {
        const unwrapAmount = wrappableTokenBalance + 1
        await wrappableToken.approve(tokenManager.address, wrappableTokenBalance)
        await tokenManager.wrap(wrappableTokenBalance)

        // No expectedReason because the minimetoken destroyTokens() function reverts before getting to the transfer call
        await assertRevert(tokenManager.unwrap(unwrapAmount), )
      })

      it('allows recovering tokens correctly', async () => {
        assert.isFalse(await tokenManager.allowRecoverability(token.address))
        assert.isFalse(await tokenManager.allowRecoverability(wrappableToken.address))
        assert.isTrue(await tokenManager.allowRecoverability(ETH))
        assert.isTrue(await tokenManager.allowRecoverability('0x1234000000000000000000000000000000000000'))
      })

      context('behind ACL oracle', () => {
        beforeEach(async () => {
          const { address: aclOracleAddr } = await ACLOracleMock.new(root)
          await acl.grantPermissionP(ANY_ENTITY, tokenManager.address, await tokenManager.WRAP_TOKEN_ROLE(), [createEqOraclePermissionParam(aclOracleAddr)])
          await wrappableToken.approve(tokenManager.address, wrappableTokenBalance)
        })

        it('should wrap tokens when allowed', async () => {
          await tokenManager.wrap(wrappableTokenBalance, { from: root })
          assert.equal(await token.balanceOf(root), wrappableTokenBalance, "Incorrect token balance")
        })

        it('should revert when not allowed', async () => {
          await assertRevert(tokenManager.wrap(wrappableTokenBalance, { from: holder }), "APP_AUTH_FAILED")
        })
      })
    })
  })

  context('maximum tokens per address limit', async () => {
    const limit = 100

    beforeEach(async () => {
      await token.changeController(tokenManager.address)
      await tokenManager.initialize(token.address, ZERO_ADDRESS, true, limit)
    })

    it('can mint up to than limit', async () => {
      await tokenManager.mint(holder, limit)

      assert.equal(await token.balanceOf(holder), limit, 'should have tokens')
    })

    it('fails to mint more than limit', async () => {
      await assertRevert(tokenManager.mint(holder, limit + 1), ERRORS.TM_BALANCE_INC_NOT_ALLOWED)
    })

    it('can issue unlimited tokens to itself', async () => {
      await tokenManager.issue(limit + 100000)

      assert.equal(await token.balanceOf(tokenManager.address), limit + 100000, 'should have more tokens than limit')
    })

    it('can assign unlimited tokens to itself', async () => {
      // First issue some tokens to the Token Manager
      await tokenManager.issue(limit + 100000)

      // Then assign these tokens to the Token Manager (should not actually move any tokens)
      await tokenManager.assign(tokenManager.address, limit + 100000)

      assert.equal(await token.balanceOf(tokenManager.address), limit + 100000, 'should have more tokens than limit')
    })

    it('can assign up to limit', async () => {
      await tokenManager.issue(limit)
      await tokenManager.assign(holder, limit)

      assert.equal(await token.balanceOf(holder), limit, 'should have tokens')
    })

    it('cannot assign more than limit', async () => {
      await tokenManager.issue(limit + 2)

      await assertRevert(tokenManager.assign(holder, limit + 1), ERRORS.TM_BALANCE_INC_NOT_ALLOWED)
    })

    it('can transfer tokens to token manager without regard to token limit', async () => {
      await tokenManager.issue(limit + 100000)
      await tokenManager.assign(holder, 5)

      await token.transfer(tokenManager.address, 5, { from: holder })

      assert.equal(await token.balanceOf(tokenManager.address), limit + 100000, 'should have more tokens than limit')
    })

    it('cannot transfer tokens to an address if it would go over the limit', async () => {
      await tokenManager.issue(limit * 2)
      await tokenManager.assign(holder, limit - 1)
      await tokenManager.assign(holder2, limit - 1)

      await assertRevert(token.transfer(holder2, 5, { from: holder }))
    })
  })

  for (const tokenTransferable of [true, false]) {
    context(`for ${tokenTransferable ? 'transferable' : 'non-transferable'} tokens`, () => {
      beforeEach(async () => {
        await token.changeController(tokenManager.address)
        await tokenManager.initialize(token.address, ZERO_ADDRESS, tokenTransferable, 0)
      })

      it('fails on reinitialization', async () => {
        await assertRevert(tokenManager.initialize(token.address, ZERO_ADDRESS, true, 0), ERRORS.INIT_ALREADY_INITIALIZED)
      })

      it('cannot initialize base app', async () => {
        const newTokenManager = await TokenManager.new()
        assert.isTrue(await newTokenManager.isPetrified())
        await assertRevert(newTokenManager.initialize(token.address, ZERO_ADDRESS, true, 0), ERRORS.INIT_ALREADY_INITIALIZED)
      })

      it('can mint tokens', async () => {
        await tokenManager.mint(holder, 100)

        assert.equal(await token.balanceOf(holder), 100, 'should have minted tokens')
      })

      it('can issue tokens', async () => {
        await tokenManager.issue(50)

        assert.equal(await token.balanceOf(tokenManager.address), 50, 'token manager should have issued tokens')
      })

      it('can assign issued tokens', async () => {
        await tokenManager.issue(50)
        await tokenManager.assign(holder, 50)

        assert.equal(await token.balanceOf(holder), 50, 'holder should have assigned tokens')
        assert.equal(await token.balanceOf(tokenManager.address), 0, 'token manager should have 0 tokens')
      })

      it('can assign issued tokens to itself', async () => {
        await tokenManager.issue(50)
        await tokenManager.assign(tokenManager.address, 50)

        assert.equal(await token.balanceOf(tokenManager.address), 50, 'token manager should not have changed token balance')
      })

      it('can burn assigned tokens', async () => {
        const mintAmount = 2000
        const burnAmount = 10
        await tokenManager.mint(holder, mintAmount)
        await tokenManager.burn(holder, burnAmount)

        assert.equal(await token.balanceOf(holder), mintAmount - burnAmount, 'should have burned tokens')
      })

      it('cannot mint tokens to itself', async () => {
        await assertRevert(tokenManager.mint(tokenManager.address, 100), ERRORS.TM_MINT_RECEIVER_IS_TM)
      })

      it('cannot assign more tokens than owned', async () => {
        await tokenManager.issue(50)

        await assertRevert(tokenManager.assign(holder, 51), ERRORS.TM_ASSIGN_TRANSFER_FROM_REVERTED)
      })

      it("cannot call onTransfer() from outside of the token's context", async () => {
        const amount = 10
        await tokenManager.mint(holder, amount)

        // Make sure this callback fails when called out-of-context
        await assertRevert(tokenManager.onTransfer(holder, holder2, 10), ERRORS.TM_CALLER_NOT_TOKEN)

        if (tokenTransferable) {
          // Make sure the same transfer through the token's context doesn't revert
          await token.transfer(holder2, amount, { from: holder })
        }
      })

      it("cannot call onApprove() from outside of the token's context", async () => {
        const amount = 10
        await tokenManager.mint(holder, amount)

        // Make sure this callback fails when called out-of-context
        await assertRevert(tokenManager.onApprove(holder, holder2, 10), ERRORS.TM_CALLER_NOT_TOKEN)

        // Make sure no allowance was registered
        assert.equal(await token.allowance(holder, holder2), 0, 'token approval should be 0')
      })

      it("cannot call proxyPayment() from outside of the token's context", async () => {
        const value = 10
        const prevTokenManagerBalance = await web3.eth.getBalance(tokenManager.address)

        // Make sure this callback fails when called out-of-context
        await assertRevert(tokenManager.proxyPayment(root, { value }), ERRORS.TM_CALLER_NOT_TOKEN)

        // Make sure no ETH was transferred
        assertBn(await web3.eth.getBalance(tokenManager.address), prevTokenManagerBalance, 'token manager ETH balance should be the same')
      })

      it('fails when assigning invalid vesting schedule', async () => {
        const tokens = 10
        // vesting < cliff
        await assertRevert(tokenManager.assignVested(holder, tokens, 10, 20, 10, true), ERRORS.TM_WRONG_CLIFF_DATE)
      })

      it('allows to recover external tokens', async () => {
        assert.isTrue(await tokenManager.allowRecoverability(ETH))
        assert.isTrue(await tokenManager.allowRecoverability('0x1234000000000000000000000000000000000000'))
      })

      it('does not allow to recover own tokens', async () => {
        assert.isFalse(await tokenManager.allowRecoverability(token.address))
      })

      if (!tokenTransferable) {
        it('holders cannot transfer non-transferable tokens', async () => {
          await tokenManager.mint(holder, 2000)

          await assertRevert(token.transfer(holder2, 10, { from: holder }))
        })
      }

      if (tokenTransferable) {
        context('assigning vested tokens', () => {
          const CLIFF_DURATION = 2000
          const VESTING_DURATION = 5000

          const startDate = NOW + 1000
          const cliffDate = NOW + CLIFF_DURATION
          const vestingDate = NOW + VESTING_DURATION

          const totalTokens = 40
          const revokable = true

          beforeEach(async () => {
            await tokenManager.issue(totalTokens)
            await tokenManager.assignVested(holder, totalTokens, startDate, cliffDate, vestingDate, revokable)
          })

          it('fails trying to get vesting out of bounds', async () => {
            await assertRevert(tokenManager.getVesting(holder, 1), ERRORS.TM_NO_VESTING)
          })

          it('can get vesting details before being revoked', async () => {
            const { amount, start, cliff, vesting, revokable: vestingRevokable } = await tokenManager.getVesting(holder, 0)
            assertBn(amount, totalTokens)
            assertBn(start, startDate)
            assertBn(cliff, cliffDate)
            assertBn(vesting, vestingDate)
            assert.equal(vestingRevokable, revokable)
          })

          it('can start transferring on cliff', async () => {
            await tokenManager.mockIncreaseTime(CLIFF_DURATION)

            await token.transfer(holder2, 10, { from: holder })
            assertBn(await token.balanceOf(holder2), 10, 'should have received tokens')
            assertBn(await tokenManager.spendableBalanceOf(holder), 0, 'should not be able to spend more tokens')
          })

          it('can transfer all tokens after vesting', async () => {
            await tokenManager.mockIncreaseTime(VESTING_DURATION)

            await token.transfer(holder2, totalTokens, { from: holder })
            assert.equal(await token.balanceOf(holder2), totalTokens, 'should have received tokens')
          })

          it('can transfer half mid vesting', async () => {
            await tokenManager.mockSetTimestamp(startDate)
            await tokenManager.mockIncreaseTime((vestingDate - startDate) / 2)

            await token.transfer(holder2, 20, { from: holder })

            assertBn(await tokenManager.spendableBalanceOf(holder), 0, 'should not be able to spend more tokens')
          })

          it('cannot transfer non-vested tokens', async () => {
            await assertRevert(token.transfer(holder2, 10, { from: holder }))
          })

          it('can approve non-vested tokens but transferFrom fails', async () => {
            await token.approve(holder2, 10, { from: holder })

            await assertRevert(token.transferFrom(holder, holder2, 10, { from: holder2 }))
          })

          it('cannot transfer all tokens right before vesting', async () => {
            await tokenManager.mockIncreaseTime(VESTING_DURATION - 10)

            await assertRevert(token.transfer(holder2, totalTokens, { from: holder }))
          })

          it('can be revoked and not vested tokens are transfered to token manager', async () => {
            await tokenManager.mockIncreaseTime(CLIFF_DURATION)
            await tokenManager.revokeVesting(holder, 0)

            await token.transfer(holder2, 5, { from: holder })

            assertBn(await token.balanceOf(holder), 5, 'should have kept vested tokens')
            assertBn(await token.balanceOf(holder2), 5, 'should have kept vested tokens')
            assertBn(await token.balanceOf(tokenManager.address), totalTokens - 10, 'should have received unvested')
          })

          it('cannot assign a vesting to itself', async () => {
            await assertRevert(tokenManager.assignVested(tokenManager.address, 5, startDate, cliffDate, vestingDate, revokable), ERRORS.TM_VESTING_TO_TM)
          })

          it('cannot revoke non-revokable vestings', async () => {
            await tokenManager.issue(1)
            await tokenManager.assignVested(holder, 1, startDate, cliffDate, vestingDate, false)

            await assertRevert(tokenManager.revokeVesting(holder, 1), ERRORS.TM_VESTING_NOT_REVOKABLE)
          })

          it('cannot have more than 50 vestings', async () => {
            await tokenManager.issue(50)

            // Only create 49 new vestings as we've already created one in beforeEach()
            for (ii = 0; ii < 49; ++ii) {
              await tokenManager.assignVested(holder, 1, startDate, cliffDate, vestingDate, false)
            }

            await assertRevert(tokenManager.assignVested(holder, 1, startDate, cliffDate, vestingDate, false), ERRORS.TM_TOO_MANY_VESTINGS)

            // Can't create a new vesting even after other vestings have finished
            await tokenManager.mockIncreaseTime(VESTING_DURATION)
            await assertRevert(tokenManager.assignVested(holder, 1, startDate, cliffDate, vestingDate, false), ERRORS.TM_TOO_MANY_VESTINGS)

            // But can now transfer
            await token.transfer(holder2, 1, { from: holder })
          })
        })
      }
    })
  }

  context('app not initialized', async () => {
    it('fails to mint tokens', async() => {
      await assertRevert(tokenManager.mint(holder, 1), ERRORS.APP_AUTH_FAILED)
    })

    it('fails to assign tokens', async() => {
      await assertRevert(tokenManager.assign(holder, 1), ERRORS.APP_AUTH_FAILED)
    })

    it('fails to issue tokens', async() => {
      await assertRevert(tokenManager.issue(1), ERRORS.APP_AUTH_FAILED)
    })

    it('fails to burn tokens', async() => {
      await assertRevert(tokenManager.burn(holder, 1), ERRORS.APP_AUTH_FAILED)
    })
  })

  context('with hooks', async () => {

    let hook0, hook1, hook2

    beforeEach(async () => {
      await token.changeController(tokenManager.address)
      await tokenManager.initialize(token.address, ZERO_ADDRESS, true, 0)

      hook0 = await TokenManagerHook.new(0)
      hook1 = await TokenManagerHook.new(1)
      hook2 = await TokenManagerHook.new(2)
      await tokenManager.registerHook(hook0.address)
      await tokenManager.registerHook(hook1.address)
      await tokenManager.registerHook(hook2.address)
      await tokenManager.revokeHook(1)
    })

    it('can register hooks', async () => {
      const hook3 = await TokenManagerHook.new(3)
      const { receipt } = await tokenManager.registerHook(hook3.address)
      assert.equal(parseInt(getTopicArgument(receipt, 'RegisterHooked(uint256)', 1)), 3)
    })

    it('can revoke hooks', async () => {
      const { receipt } = await tokenManager.revokeHook(0)
      assert.equal(parseInt(getTopicArgument(receipt, 'RevokeHooked(uint256)', 1)), 0)
    })

    it('calls onTransfer hook on token mintings', async () => {
      const { receipt } = await tokenManager.mint(holder, 10)
      assert.equal(parseInt(getTopicArgument(receipt, 'TransferHooked(uint256,address,address)', 1, 0)), 0)
      assert.equal(parseInt(getTopicArgument(receipt, 'TransferHooked(uint256,address,address)', 1, 1)), 2)

      // Transfer from 0x0 to holder
      assert.equal(getTopicArgumentAsAddr(receipt, 'TransferHooked(uint256,address,address)', 2), ZERO_ADDRESS)
      assert.equal(getTopicArgumentAsAddr(receipt, 'TransferHooked(uint256,address,address)', 3), holder.toLowerCase())
      assert.equal(await token.balanceOf(holder), 10)
    })

    it('calls onTransfer hook on token transfers', async () => {
      const { receipt: receipt1 } = await tokenManager.issue(10)
      assert.equal(parseInt(getTopicArgument(receipt1, 'TransferHooked(uint256,address,address)', 1, 0)), 0)
      assert.equal(parseInt(getTopicArgument(receipt1, 'TransferHooked(uint256,address,address)', 1, 1)), 2)

      const { receipt: receipt2 } = await tokenManager.assign(holder, 5)
      assert.equal(parseInt(getTopicArgument(receipt2, 'TransferHooked(uint256,address,address)', 1, 0)), 0)
      assert.equal(parseInt(getTopicArgument(receipt2, 'TransferHooked(uint256,address,address)', 1, 1)), 2)

      assert.equal(await token.balanceOf(tokenManager.address), 5, 'Token Manager balance before transfer')

      const { receipt: receipt3 } = await token.transfer(tokenManager.address, 5, { from: holder })
      assert.equal(parseInt(getTopicArgument(receipt3, 'TransferHooked(uint256,address,address)', 1, 0)), 0)
      assert.equal(parseInt(getTopicArgument(receipt3, 'TransferHooked(uint256,address,address)', 1, 1)), 2)

      // Transfer from holder to token manager
      assert.equal(getTopicArgumentAsAddr(receipt3, 'TransferHooked(uint256,address,address)', 2), holder.toLowerCase())
      assert.equal(getTopicArgumentAsAddr(receipt3, 'TransferHooked(uint256,address,address)', 3), tokenManager.address.toLowerCase())

      assert.equal(await token.balanceOf(tokenManager.address), 10, 'Token Manager balance after transfer')
    })

    it('calls onTransfer hook on token burnings', async () => {
      await tokenManager.mint(holder, 10)
      const { receipt } = await tokenManager.burn(holder, 10)
      assert.equal(parseInt(getTopicArgument(receipt, 'TransferHooked(uint256,address,address)', 1, 0)), 0)
      assert.equal(parseInt(getTopicArgument(receipt, 'TransferHooked(uint256,address,address)', 1, 1)), 2)

      // Transfer from holder to token manager
      assert.equal(getTopicArgumentAsAddr(receipt, 'TransferHooked(uint256,address,address)', 2), holder.toLowerCase())
      assert.equal(getTopicArgumentAsAddr(receipt, 'TransferHooked(uint256,address,address)', 3), ZERO_ADDRESS)
      assert.equal(await token.balanceOf(holder), 0)
    })

    it('calls onApprove hook on token approvals', async () => {
      const { receipt } = await token.approve(holder2, 10, { from: holder })
      assert.equal(parseInt(getTopicArgument(receipt, 'ApproveHooked(uint256)', 1, 0)), 0)
      assert.equal(parseInt(getTopicArgument(receipt, 'ApproveHooked(uint256)', 1, 1)), 2)
    })

    context('for vesting', async () => {
      const CLIFF_DURATION = 2000
      const VESTING_DURATION = 5000

      const startDate = NOW + 1000
      const cliffDate = NOW + CLIFF_DURATION
      const vestingDate = NOW + VESTING_DURATION

      const totalTokens = 40
      const revokable = true

      beforeEach(async () => {
        await tokenManager.issue(totalTokens)
      })
      it('calls onTransfer hook when assigning vested', async () => {
        const { receipt } = await tokenManager.assignVested(holder, totalTokens, startDate, cliffDate, vestingDate, revokable)
        assert.equal(parseInt(getTopicArgument(receipt, 'TransferHooked(uint256,address,address)', 1, 0)), 0)
        assert.equal(parseInt(getTopicArgument(receipt, 'TransferHooked(uint256,address,address)', 1, 1)), 2)
      })
      it('calls onTransfer hook when revoking vesting', async () => {
        await tokenManager.assignVested(holder, totalTokens, startDate, cliffDate, vestingDate, revokable)
        await tokenManager.mockIncreaseTime(CLIFF_DURATION)
        const { receipt } = await tokenManager.revokeVesting(holder, 0)
        assert.equal(parseInt(getTopicArgument(receipt, 'TransferHooked(uint256,address,address)', 1, 0)), 0)
        assert.equal(parseInt(getTopicArgument(receipt, 'TransferHooked(uint256,address,address)', 1, 1)), 2)
      })
    })

    context('changeTokenController()', () => {

      it('reverts when no permission', async () => {
        await acl.revokePermission(ANY_ENTITY, tokenManager.address, CHANGE_CONTROLLER_ROLE)
        await assertRevert(tokenManager.changeTokenController(anyone), "APP_AUTH_FAILED")
      })

      it('changes token controller', async () => {
        const { dao: dao2, acl: acl2 } = await newDao(root)
        const tokenManager2 = await TokenManager.at(await installNewApp(dao2, APP_ID, tokenManagerBase.address, root))
        tokenManager2.mockSetTimestamp(NOW)
        await acl2.createPermission(ANY_ENTITY, tokenManager2.address, MINT_ROLE, root, { from: root })
        assert.equal(await token.controller(), tokenManager.address, 'Incorrect token controller before')
        await tokenManager.changeTokenController(tokenManager2.address)
        assert.equal(await token.controller(), tokenManager2.address, 'Incorrect token controller after')
        await tokenManager2.initialize(token.address, ZERO_ADDRESS, true, 0)
        await tokenManager2.mint(anyone, 100)
        assert.equal(await token.balanceOf(anyone), 100, "New token manager can't control")
      })

      it('cannot mint after changed', async () => {
        await tokenManager.changeTokenController(anyone)
        await assertRevert(tokenManager.mint(anyone, 100))
      })
    })
  })
})
