const getTopics = ({ logs = [] }, event) => logs.filter(l => l.topics[0] === web3.sha3(event)).map(l => l.topics)
const getTopicAt = (receipt, event, index = 0) => getTopics(receipt, event)[index]
const getTopicArgument = (receipt, event, arg, index = 0) => getTopicAt(receipt, event, index)[arg]
const topicToAddress = topic => '0x' + topic.slice(-40)
const getTopicArgumentAsAddr = (receipt, event, arg, index = 0) => topicToAddress(getTopicArgument(receipt, event, arg, index))

module.exports = {
  getTopics,
  getTopicAt,
  getTopicArgument,
  getTopicArgumentAsAddr
}
