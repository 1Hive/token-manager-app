const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const timetravel = require('@aragon/test-helpers/timeTravel')(web3)
const getBlock = require('@aragon/test-helpers/block')(web3)
const getBlockNumber = require('@aragon/test-helpers/blockNumber')(web3)

const { encodeScript } = require('@aragon/test-helpers/evmScript')
const ExecutionTarget = artifacts.require('ExecutionTarget')

const TokenManager = artifacts.require('TokenManager')
const MiniMeToken = artifacts.require('MiniMeToken')

const n = '0x00'

contract('Token Manager', accounts => {
    let tokenManager, token = {}

    beforeEach(async () => {
        token = await MiniMeToken.new(n, n, 0, 'n', 0, 'n', true)
        tokenManager = await TokenManager.new()
    })

    it('fails when initializing without setting controller', async () => {
        return assertRevert(async () => {
            await tokenManager.initializeNative(token.address)
        })
    })

    it('fails when sending ether to token', async () => {
        return assertRevert(async () => {
            await token.send(1) // transfer 1 wei to token contract
        })
    })

    context('for native tokens', () => {
        const holder = accounts[1]

        beforeEach(async () => {
            await token.changeController(tokenManager.address)
            await tokenManager.initializeNative(token.address)
        })

        it('fails on reinitialization', async () => {
            return assertRevert(async () => {
                await tokenManager.initializeNative(token.address)
            })
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

        it('cannot assign more tokens than owned', async () => {
            await tokenManager.issue(50)

            return assertRevert(async () => {
                await tokenManager.assign(holder, 51)
            })
        })

        it('cannot wrap tokens', async () => {
            return assertRevert(async () => {
                await tokenManager.wrap(100, { from: holder })
            })
        })

        it('forwards actions only to token holders', async () => {
            const executionTarget = await ExecutionTarget.new()
            await tokenManager.mint(holder, 100)

            const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
            const script = encodeScript([action])

            await tokenManager.forward(script, { from: holder })
            assert.equal(await executionTarget.counter(), 1, 'should have received execution call')

            return assertRevert(async () => {
                await tokenManager.forward(script, { from: accounts[8] })
            })
        })

        it('fails when assigning invalid vesting schedule', async () => {
            return assertRevert(async () => {
                const tokens = 10
                // vesting < cliff
                await tokenManager.assignVested(holder, tokens, 10, 20, 10, true)
            })
        })

        context('assigning vested tokens', () => {
            let now = 0

            const start = 1000
            const cliff = 2000
            const vesting = 5000

            const totalTokens = 40

            beforeEach(async () => {
                await tokenManager.issue(totalTokens)
                const block = await getBlock(await getBlockNumber())
                now = block.timestamp

                await tokenManager.assignVested(holder, totalTokens, now + start, now + cliff, now + vesting, true)
            })

            it('can start transfering on cliff', async () => {
                await timetravel(cliff)
                await token.transfer(accounts[2], 10, { from: holder })
                assert.equal(await token.balanceOf(accounts[2]), 10, 'should have received tokens')
                assert.equal(await tokenManager.spendableBalanceOf(holder), 0, 'should not be able to spend more tokens')
            })

            it('can transfer all tokens after vesting', async () => {
                await timetravel(vesting)
                await token.transfer(accounts[2], totalTokens, { from: holder })
                assert.equal(await token.balanceOf(accounts[2]), totalTokens, 'should have received tokens')
            })

            it('can transfer half mid vesting', async () => {
                await timetravel(start + (vesting - start) / 2)

                await token.transfer(accounts[2], 20, { from: holder })

                assert.equal(await tokenManager.spendableBalanceOf(holder), 0, 'should not be able to spend more tokens')
            })

            it('cannot transfer non-vested tokens', async () => {
                return assertRevert(async () => {
                    await token.transfer(accounts[2], 10, { from: holder })
                })
            })

            it('can approve non-vested tokens but transferFrom fails', async () => {
                await token.approve(accounts[2], 10, { from: holder })

                return assertRevert(async () => {
                    await token.transferFrom(holder, accounts[2], 10, { from: accounts[2] })
                })
            })

            it('cannot transfer all tokens right before vesting', async () => {
                await timetravel(vesting - 10)
                return assertRevert(async () => {
                    await token.transfer(accounts[2], totalTokens, { from: holder })
                })
            })

            it('can be revoked and not vested tokens are transfered to token manager', async () => {
                await timetravel(cliff)
                await tokenManager.revokeVesting(holder, 0)

                await token.transfer(accounts[2], 5, { from: holder })

                assert.equal(await token.balanceOf(holder), 5, 'should have kept vested tokens')
                assert.equal(await token.balanceOf(accounts[2]), 5, 'should have kept vested tokens')
                assert.equal(await token.balanceOf(tokenManager.address), totalTokens - 10, 'should have received unvested')
            })

            it('cannot revoke non-revokable vestings', async () => {
                await tokenManager.issue(1)
                await tokenManager.assignVested(holder, 1, now + start, now + cliff, now + vesting, false)

                return assertRevert(async () => {
                    await tokenManager.revokeVesting(holder, 1)
                })
            })

            it('cannot have more than 50 vestings', async () => {
                let i = 49 // already have 1
                await tokenManager.issue(50)
                while (i > 0) {
                    await tokenManager.assignVested(holder, 1, now + start, now + cliff, now + vesting, false)
                    i--
                }
                await timetravel(vesting)
                await token.transfer(accounts[3], 1) // can transfer
                return assertRevert(async () => {
                    await tokenManager.assignVested(holder, 1, now + start, now + cliff, now + vesting, false)
                })
            })
        })
    })

    context('for wrapped tokens', () => {
        let wrappedToken = {}

        const holder100 = accounts[1]

        beforeEach(async () => {
            wrappedToken = await MiniMeToken.new(n, n, 0, 'n', 0, 'n', true)
            await wrappedToken.generateTokens(holder100, 100)

            await token.changeController(tokenManager.address)
            await tokenManager.initializeWrapper(token.address, wrappedToken.address)
        })

        it('cannot wrap more than allowance', async () => {
            await wrappedToken.approve(tokenManager.address, 99, { from: holder100 })
            return assertRevert(async () => {
                await tokenManager.wrap(100, { from: holder100 })
            })
        })

        it('cannot mint', async () => {
            return assertRevert(async () => {
                await tokenManager.mint(holder100, 100)
            })
        })

        it('cannot issue', async () => {
            return assertRevert(async () => {
                await tokenManager.issue(100)
            })
        })

        context('wrapping tokens', () => {
            beforeEach(async () => {
                await wrappedToken.approve(tokenManager.address, 100, { from: holder100 })
                await tokenManager.wrap(100, { from: holder100 })
            })

            it('balances are correct', async () => {
                assert.equal(await token.balanceOf(holder100), 100, 'tokens should have been wrapped 1:1')
                assert.equal(await wrappedToken.balanceOf(holder100), 0, 'balance should be 0 on wrapped token')
                assert.equal(await wrappedToken.balanceOf(tokenManager.address), 100, 'tokenManager should hold wrapped tokens')
            })

            it('can unwrap', async () => {
                await tokenManager.unwrap(50, { from: holder100 }) // unwrap half of wrapped tokens

                assert.equal(await token.balanceOf(holder100), 50, 'tokens should have been unwrapped 1:1')
                assert.equal(await wrappedToken.balanceOf(holder100), 50, 'balance should be 50 on wrapped token')
                assert.equal(await wrappedToken.balanceOf(tokenManager.address), 50, 'tokenManager should hold wrapped tokens')
            })

            it('can transfer', async () => {
                await token.transfer(accounts[2], 10, { from: holder100 })

                assert.equal(await token.balanceOf(holder100), 90, 'balance should be correct')
                assert.equal(await token.balanceOf(accounts[2]), 10, 'balance should be correct')
            })

            it('cannot unwrap tokens with vesting', async () => {
                await token.transfer(tokenManager.address, 100, { from: holder100 })
                await tokenManager.assignVested(holder100, 100, 1e11, 1e11, 1e11, false)

                return assertRevert(async () => {
                    await tokenManager.unwrap(100, { from: holder100 })
                })
            })

            it('fails if unwrapping more tokens than token managers balance', async () => {
                // after being wrapped, as token controller we can move tokens at our will
                // this scenario shouldn't happen in reality, as wrapped tokens should be
                // trustless tokens in which this operation is not allowed
                await wrappedToken.transferFrom(tokenManager.address, accounts[7], 100)
                return assertRevert(async () => {
                    await tokenManager.unwrap(100, { from: holder100 })
                })
            })
        })
    })
})
