import { getMcpServer } from './mcp-server.js'
import { buildLink } from './tools/build-link.js'
import { createChannel } from './tools/create-channel.js'
import { createConversation } from './tools/create-conversation.js'
import { createThread } from './tools/create-thread.js'
import { deleteObject } from './tools/delete-object.js'
import { fetchInbox } from './tools/fetch-inbox.js'
import { getGroups } from './tools/get-groups.js'
import { getMentions } from './tools/get-mentions.js'
import { getUserStatus } from './tools/get-user-status.js'
import { getUsers } from './tools/get-users.js'
import { getWorkspaces } from './tools/get-workspaces.js'
import { listChannels } from './tools/list-channels.js'
import { listConversations } from './tools/list-conversations.js'
import { loadConversation } from './tools/load-conversation.js'
import { loadThread } from './tools/load-thread.js'
import { markDone } from './tools/mark-done.js'
import { markRead } from './tools/mark-read.js'
import { react } from './tools/react.js'
import { reply } from './tools/reply.js'
import { searchContent } from './tools/search-content.js'
import { setUserStatus } from './tools/set-user-status.js'
import { updateChannel } from './tools/update-channel.js'
import { updateObject } from './tools/update-object.js'
import { userInfo } from './tools/user-info.js'
import { validateCommsToken } from './utils/validate-comms-token.js'

const tools = {
    userInfo,
    getUserStatus,
    setUserStatus,
    fetchInbox,
    loadThread,
    loadConversation,
    searchContent,
    getMentions,
    createThread,
    createConversation,
    updateObject,
    deleteObject,
    reply,
    react,
    markDone,
    markRead,
    buildLink,
    listChannels,
    listConversations,
    getGroups,
    getUsers,
    getWorkspaces,
    createChannel,
    updateChannel,
}

export { tools, getMcpServer, validateCommsToken }
// Re-exported so consumers of the exported tools can catch the API's errors without taking a
// direct @doist/comms-sdk dependency.
export { CommsRequestError } from '@doist/comms-sdk'

export {
    userInfo,
    getUserStatus,
    setUserStatus,
    fetchInbox,
    loadThread,
    loadConversation,
    searchContent,
    getMentions,
    createThread,
    createConversation,
    updateObject,
    deleteObject,
    reply,
    react,
    markDone,
    markRead,
    buildLink,
    listChannels,
    listConversations,
    getGroups,
    getUsers,
    getWorkspaces,
    createChannel,
    updateChannel,
}
